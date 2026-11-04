/**
 * 联网补充的拼装逻辑。纯函数，前端后端都能用。
 *
 * 提示词里放摘要不放链接：链接对模型没用，只会白占 token；
 * 但界面要把链接列出来，用户得能自己点开核对。
 */

import type { WebResult } from "./search";

/** 检索词最多拼这么长，太长反而搜不到东西。 */
const MAX_QUERY_LEN = 40;

/**
 * 拼检索词。
 *
 * 只用「岗位名 + 工作内容」，不加公司名——公司名会把结果带到招聘广告和面经上，
 * 而这里要的是这个岗位平时干什么。岗位名拿不到就返回空串，别拿 JD 正文硬搜。
 */
export function buildSearchQuery(title: string, keywords: string[] = []): string {
  const name = title.trim();
  if (name.length < 2) return "";

  // 关键词里常带「日常」「劝退」这类平台化后缀，取第一个不带后缀的做补充说明
  const extra = keywords
    .map((item) => item.trim())
    .find((item) => item.length >= 2 && !/劝退|面试|招聘|岗位$/.test(item));

  const query = extra && !name.includes(extra) ? `${name} ${extra}` : `${name} 工作内容`;
  return query.slice(0, MAX_QUERY_LEN);
}

/**
 * 拼给大模型的联网资料段落。
 *
 * 带上序号和站点名，让模型知道这是外部公开资料、不是知识库里的从业者原话，
 * 引用时语气要更保守。
 */
export function formatWebContext(results: WebResult[]): string {
  const usable = results.filter((item) => item.snippet.length >= 20).slice(0, 5);
  if (usable.length === 0) return "";

  const lines: string[] = ["〔联网检索到的公开资料〕"];
  for (const [index, item] of usable.entries()) {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   ${item.snippet}`);
  }
  return lines.join("\n");
}
