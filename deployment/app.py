"""JobAgent 的线上托管入口。

平台只支持静态站点或 Python 服务，不支持 Node/Next 服务端。
前端已经导出成纯静态文件放在 out/，这个文件只做三件事：

1. 托管 out/ 里的 HTML、JS、CSS 和知识库 JSON；
2. /api/config 告诉前端服务器有没有内置大模型；
3. /api/chat 用环境变量里的 DEEPSEEK_API_KEY 转发请求，真实 Key 不进浏览器。

只用 Python 标准库，不安装第三方包。
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent / "out"
DEEPSEEK_API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1").rstrip("/")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
MAX_BODY_BYTES = 4 * 1024 * 1024
TIMEOUT_SECONDS = 90
BING_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def api_key() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUT_DIR), **kwargs)

    def end_headers(self) -> None:
        # 页面 HTML 不让浏览器缓存，免得重新部署后还跑旧版 JS；
        # 带哈希的静态资源可以长缓存。
        existing = b"".join(getattr(self, "_headers_buffer", []))
        if b"Cache-Control" not in existing:
            path = urllib.parse.urlparse(self.path).path
            if path.startswith("/_next/static/"):
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            else:
                self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---------- 基础响应 ----------

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_passthrough(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY_BYTES:
            return None
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    # ---------- GET ----------

    def do_GET(self) -> None:  # noqa: N802 - http.server 约定
        path = urllib.parse.urlparse(self.path).path

        if path == "/api/config":
            self.send_json(200, {"serverAI": bool(api_key()), "model": DEEPSEEK_MODEL})
            return

        if path == "/api/health":
            self.send_json(200, {"ok": True, "staticRoot": str(OUT_DIR)})
            return

        super().do_GET()

    # ---------- POST ----------

    def do_POST(self) -> None:  # noqa: N802 - http.server 约定
        path = urllib.parse.urlparse(self.path).path

        if path == "/api/chat":
            self.handle_chat()
            return

        if path == "/api/web/search":
            self.handle_web_search()
            return

        self.send_json(404, {"error": "接口不存在。"})

    def handle_chat(self) -> None:
        key = api_key()
        if not key:
            self.send_json(500, {"error": "服务器没有配置 DEEPSEEK_API_KEY。"})
            return

        body = self.read_json()
        if body is None:
            self.send_json(400, {"error": "请求体不是合法的 JSON。"})
            return

        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            self.send_json(400, {"error": "messages 不能为空。"})
            return

        payload = {
            "model": body.get("model") or DEEPSEEK_MODEL,
            "temperature": body.get("temperature", 0.2),
            "messages": messages,
        }

        request = urllib.request.Request(
            f"{DEEPSEEK_API_BASE}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                self.send_passthrough(
                    response.status,
                    response.read(),
                    response.headers.get("Content-Type", "application/json"),
                )
        except urllib.error.HTTPError as error:
            # 上游的错误正文通常写明了原因，原样带回去，前端会展示。
            self.send_passthrough(
                error.code,
                error.read(),
                error.headers.get("Content-Type", "application/json") if error.headers else "",
            )
        except (urllib.error.URLError, TimeoutError) as error:
            reason = getattr(error, "reason", error)
            self.send_json(502, {"error": f"连接模型接口失败：{reason}"})
        except Exception as error:  # noqa: BLE001 - 兜底，避免把服务打挂
            self.send_json(502, {"error": f"模型接口异常：{error}"})

    def handle_web_search(self) -> None:
        body = self.read_json()
        if body is None:
            self.send_json(400, {"error": "请求体不是合法的 JSON。"})
            return

        query = body.get("query")
        if not isinstance(query, str) or len(query.strip()) < 2:
            self.send_json(400, {"error": "请提交至少 2 个字的检索词。"})
            return

        query = query.strip()
        url = f"https://cn.bing.com/search?q={urllib.parse.quote(query)}&setlang=zh-CN"
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": BING_UA,
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Accept": "text/html,application/xhtml+xml",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                page = response.read().decode("utf-8", "ignore")
        except Exception as error:  # noqa: BLE001 - 检索失败按空结果处理
            self.send_json(
                200,
                {"provider": "none", "query": query, "results": [], "error": f"联网检索失败：{error}"},
            )
            return

        results = parse_bing(page)
        self.send_json(
            200,
            {
                "provider": "bing" if results else "none",
                "query": query,
                "results": results,
                "error": "" if results else "没有解析到检索结果。",
            },
        )

    # ---------- 日志 ----------

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - 父类签名
        # 默认日志只带请求行和状态码，不打印请求正文，避免简历内容进日志。
        super().log_message(format, *args)


def clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_bing(page: str) -> list[dict]:
    blocks = re.findall(r'<li class="b_algo"[\s\S]*?</li>', page)
    results: list[dict] = []

    for block in blocks:
        anchor = re.search(r'<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', block)
        if not anchor:
            continue

        link = anchor.group(1)
        title = clean_html(anchor.group(2))
        if not title or not link.startswith("http"):
            continue

        paragraph = re.search(r"<p[^>]*>([\s\S]*?)</p>", block)
        snippet = clean_html(paragraph.group(1)) if paragraph else ""
        results.append({"title": title, "url": link, "snippet": snippet})

        if len(results) >= 6:
            break

    return results


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    if not OUT_DIR.is_dir():
        print(f"[jobagent] 静态目录不存在：{OUT_DIR}", file=sys.stderr)
        sys.exit(1)

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[jobagent] serving {OUT_DIR} on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
