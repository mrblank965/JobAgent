/**
 * 联网检索。
 *
 * 只在服务端跑：浏览器直接请求搜索引擎会被跨域拦住，而且不该把抓取逻辑放到客户端。
 *
 * 两条通路：
 *   1. 配了 TAVILY_API_KEY 就用 Tavily，返回结构化结果，质量稳定；
 *   2. 没配就走 Bing 结果页解析，不需要任何 Key，但依赖页面结构，可能被改版或限频。
 *
 * 两条都失败时返回空结果并带 error，调用方按「没检索到」处理，不许因此挡住拆解。
 */

export type WebResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchPayload = {
  provider: "tavily" | "bing" | "none";
  query: string;
  results: WebResult[];
  error?: string;
};

/** 单次检索最多返回这么多条，够铺满提示词又不至于把上下文撑爆。 */
const MAX_RESULTS = 6;

/** 抓取超时。检索是辅助环节，慢过这个数就直接放弃。 */
const TIMEOUT_MS = 12000;

/** 结果缓存 10 分钟：同一份 JD 反复拆解不该反复打扰搜索引擎。 */
const CACHE_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; payload: WebSearchPayload }>();

/** 浏览器 UA。不给 UA 时 Bing 常直接返回空壳页。 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 把 HTML 实体和残留标签清掉，摘要要能直接读。 */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&ensp;|&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** 走 Tavily。字段名按它的官方响应取，结果里没有内容就跳过。 */
async function searchTavily(query: string, key: string): Promise<WebResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: MAX_RESULTS,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);

  const data = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (data.results ?? [])
    .map((item) => ({
      title: cleanText(item.title ?? ""),
      url: item.url ?? "",
      snippet: cleanText(item.content ?? ""),
    }))
    .filter((item) => item.url && item.title)
    .slice(0, MAX_RESULTS);
}

/**
 * 走 Bing 结果页。
 *
 * 只取自然结果块（li.b_algo），广告块结构不一样，混进来会污染摘要。
 * 解析失败时返回空数组，让上层判断成「没检索到」，不要抛错打断整个流程。
 */
async function searchBing(query: string): Promise<WebResult[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "zh-CN,zh;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Bing HTTP ${response.status}`);

  const html = await response.text();
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const results: WebResult[] = [];

  for (const block of blocks) {
    const anchor = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!anchor) continue;

    const link = anchor[1];
    const title = cleanText(anchor[2]);
    if (!title || !link.startsWith("http")) continue;

    const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = paragraph ? cleanText(paragraph[1]) : "";

    results.push({ title, url: link, snippet });
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

/**
 * 对外入口。
 *
 * 先看缓存，再按可用通路检索。任何异常都收敛成 `provider: "none"` + error，
 * 调用方拿到空 results 就该照常拆解，只是提示词里少一段外部资料。
 */
export async function searchWeb(query: string): Promise<WebSearchPayload> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { provider: "none", query: trimmed, results: [], error: "检索词太短" };
  }

  const hit = cache.get(trimmed);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.payload;

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  if (tavilyKey) {
    try {
      const results = await searchTavily(trimmed, tavilyKey);
      const payload: WebSearchPayload = { provider: "tavily", query: trimmed, results };
      cache.set(trimmed, { at: Date.now(), payload });
      return payload;
    } catch (error) {
      // Tavily 不可用时不要直接放弃，下面还有 Bing 兜底
      void error;
    }
  }

  try {
    const results = await searchBing(trimmed);
    const payload: WebSearchPayload = {
      provider: "bing",
      query: trimmed,
      results,
      error: results.length === 0 ? "没有检索到可用结果" : undefined,
    };
    cache.set(trimmed, { at: Date.now(), payload });
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "检索失败";
    return { provider: "none", query: trimmed, results: [], error: message };
  }
}
