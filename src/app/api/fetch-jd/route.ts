/**
 * 读取网页正文。
 *
 * 浏览器直接抓别的站会被跨域拦住，所以这一步放在服务端做。
 * 只处理能直接打开的公开页面，不针对任何招聘平台写爬虫，
 * 遇到登录墙、验证码或者反爬的站点会原样失败，由界面提示用户改用粘贴。
 */

import { ocrImages } from "@/lib/ocr";

/** 正文是图片时最多识别这么多张，够覆盖一份招聘贴，又不会让等待时间失控。 */
const MAX_OCR_IMAGES = 8;

/** 单张图片体积上限。 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 单页最大体积。超过就拒绝，避免把服务端内存拖垮。
 *
 * 定在 8MB 是因为公众号文章的 HTML 能到三四兆，里面绝大部分是脚本和样式，
 * 正文抽出来只有几千字。注意 content-length 头报的是压缩后的大小，
 * 不能拿它判断，必须等解压完再量。
 */
const MAX_BYTES = 8 * 1024 * 1024;

/** 抓取超时。 */
const TIMEOUT_MS = 15000;

/** 挡掉内网地址，避免这个接口被拿来探测本机服务。 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^(127|10|0)\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host === "::1" || host === "[::1]") return true;

  return false;
}

/**
 * 取正文容器里的图片地址。
 * 公众号用 data-src 做懒加载，真正的图片地址在这里而不是 src。
 */
function extractContentImages(html: string): string[] {
  const start = html.indexOf('id="js_content"');
  const window = start >= 0 ? html.slice(start, start + 600000) : html;

  return [...window.matchAll(/data-src="([^"]+)"/g)]
    .map((matched) => matched[1].replace(/&amp;/g, "&"))
    .filter((url) => url.startsWith("http") && !url.includes("svg"))
    .slice(0, MAX_OCR_IMAGES);
}

/** 逐张下载图片，单张超限或下载失败就跳过。 */
async function downloadImages(urls: string[]): Promise<Buffer[]> {
  const buffers: Buffer[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      });

      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 0 && buffer.byteLength <= MAX_IMAGE_BYTES) buffers.push(buffer);
    } catch {
      // 单张失败不影响其余几张
    }
  }

  return buffers;
}

/** 读一个 meta 标签的 content，读不到返回空字符串。 */
function readMeta(html: string, key: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );

  return (pattern.exec(html)?.[1] ?? reversed.exec(html)?.[1] ?? "").trim();
}

/**
 * 页面上的按钮和导航文字，不是正文。
 * 抽出来会混进关键词里，所以逐行丢掉。
 */
const UI_NOISE =
  /^(微信扫一扫|关注该公众号|知道了|取消|允许|不喜欢|分享|留言|收藏|听过|视频|小程序|分析|使用完整服务|在小说阅读器读本章|去阅读|在公众号小说中沉浸阅读|赞|在看|轻点两下取消赞|轻点两下取消在看)$/;

/** 只有标点的行也丢掉。 */
const PUNCTUATION_ONLY = /^[：，。、；！？…·\s]+$/;

/** 把 HTML 转成纯文本。只做标签剥离，不引第三方解析库。 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !UI_NOISE.test(line) && !PUNCTUATION_ONLY.test(line))
    .join("\n");
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const rawUrl = (payload as { url?: unknown } | null)?.url;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return Response.json({ error: "请提供要读取的网址。" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    return Response.json({ error: "网址格式不正确，请带上 http:// 或 https://。" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "只支持 http 和 https 开头的网址。" }, { status: 400 });
  }

  if (isBlockedHost(target.hostname)) {
    return Response.json({ error: "这个地址指向本机或内网，不能读取。" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      // 不要缓存。抓的是别人随时会变的页面，缓存下来只会拿到过期内容。
      cache: "no-store",
      headers: {
        // 有些站点对没有 UA 的请求直接返回 403
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `对方返回 HTTP ${response.status}，可能需要在登录状态下才能打开。` },
        { status: 400 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BYTES) {
      return Response.json({ error: "页面太大，请改用粘贴方式。" }, { status: 400 });
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return Response.json({ error: "页面太大，请改用粘贴方式。" }, { status: 400 });
    }

    // 中文站点有些还在用 GBK，按响应头里的 charset 解码，解不了就退回 UTF-8
    const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
    let body: string;
    try {
      body = new TextDecoder(charset).decode(buffer);
    } catch {
      body = new TextDecoder("utf-8").decode(buffer);
    }

    if (!contentType.includes("html")) {
      const plain = body.trim();
      if (plain.length < 20) {
        return Response.json({ error: "这个地址没读到有效文字，请改用粘贴方式。" }, { status: 400 });
      }
      return Response.json({ text: plain });
    }

    // 标题和摘要单独抽出来。招聘贴的标题常写成"公司 - 部门 - 岗位"，本身就很有用，
    // 而且正文是图片的时候，标题往往是唯一能拿到的信息。
    const title = readMeta(body, "og:title");
    const description = readMeta(body, "og:description") || readMeta(body, "description");
    const imageCount = (body.match(/<img/gi) ?? []).length;

    const text = htmlToText(body);

    // 正文基本是图片的情况。公众号招聘贴很常见，这种就交给 OCR。
    // 阈值定在 500 字，正常招聘贴的正文都远超这个数，只有图片正文才会这么短。
    if (text.length < 500 && imageCount >= 5) {
      const imageUrls = extractContentImages(body);

      if (imageUrls.length > 0) {
        const buffers = await downloadImages(imageUrls);
        const result = await ocrImages(buffers);

        if (result.text.trim().length > 0) {
          const merged = [title, description, result.text].filter(Boolean).join("\n");
          return Response.json({
            text: merged,
            warning: `正文是图片，已用 OCR 识别 ${result.pages.length} 张。识别结果可能有错字，请核对后再点拆解。`,
          });
        }
      }

      const fallback = [title, description].filter(Boolean).join("\n");
      return Response.json({
        text: fallback,
        warning: `这个页面的正文是 ${imageCount} 张图片，OCR 也没能识别出文字。标题已带回来，正文需要手动粘贴。`,
      });
    }

    if (text.length < 20) {
      return Response.json(
        { error: "这个页面没读到有效文字，可能是脚本渲染的，请改用粘贴方式。" },
        { status: 400 },
      );
    }

    const merged = title && !text.startsWith(title) ? `${title}\n${text}` : text;
    return Response.json({ text: merged });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return Response.json(
      {
        error: aborted
          ? "读取超时，对方站点响应太慢，请改用粘贴方式。"
          : "读取失败，可能是网络不通或对方站点拒绝访问，请改用粘贴方式。",
      },
      { status: 400 },
    );
  } finally {
    clearTimeout(timer);
  }
}
