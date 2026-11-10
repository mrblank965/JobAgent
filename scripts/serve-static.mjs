/**
 * 本地验收用的静态服务器。
 *
 * 模拟部署后的行为：/resume 这类路径落到 out/resume/index.html，
 * 没有扩展名的未知路径回退到 404.html。
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = normalize(join(process.cwd(), "out"));
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".woff2": "font/woff2",
};

async function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0]);
  const candidates = clean.endsWith("/")
    ? [join(root, clean, "index.html")]
    : [join(root, clean), join(root, clean, "index.html")];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // 试下一个
    }
  }

  return null;
}

createServer(async (request, response) => {
  const file = await resolveFile(request.url || "/");

  if (!file) {
    const fallback = join(root, "404.html");
    response.writeHead(404, { "Content-Type": TYPES[".html"] });
    response.end(await readFile(fallback, "utf8").catch(() => "Not found"));
    return;
  }

  response.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
  });
  response.end(await readFile(file));
}).listen(port, "127.0.0.1", () => {
  console.log(`static server: http://127.0.0.1:${port}/`);
});
