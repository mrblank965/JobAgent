/**
 * 联网检索接口。
 *
 * 输入一句检索词，返回公开网页的标题、摘要和链接。
 * 抓取放在服务端：浏览器直连搜索引擎会被跨域拦住。
 *
 * 检索失败不算致命错误：返回空结果并带 error，前端跳过这一段继续拆解。
 */

import { searchWeb } from "@/lib/web/search";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;

  if (!body || typeof body.query !== "string" || body.query.trim().length < 2) {
    return Response.json({ error: "请提交至少 2 个字的检索词。" }, { status: 400 });
  }

  const payload = await searchWeb(body.query);

  return Response.json({
    provider: payload.provider,
    query: payload.query,
    results: payload.results,
    error: payload.error,
  });
}
