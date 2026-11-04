/**
 * 清洗 Agent（LLM）：去广告引流、质量打分、过滤低质内容。
 *
 * 运行：node kb/scripts/clean.cjs <positionId>   或   node kb/scripts/clean.cjs all
 * 输入：kb/output/03-parse/<positionId>.json
 * 产出：kb/output/04-clean/<positionId>.md   ← 交付物（给人看）
 *       kb/output/04-clean/<positionId>.json ← 机器可读副本（流水线内部交接）
 *
 * 规则：只删不改；每次判定必须给理由；标签只能用固定枚举；LLM 失败时降级为规则兜底。
 */

const fs = require("node:fs");
const path = require("node:path");
const { chatJson } = require("./lib/llm.cjs");

const KB = path.resolve(__dirname, "..");
const IN_DIR = path.join(KB, "output", "03-parse");
const OUT_DIR = path.join(KB, "output", "04-clean");
const CONFIG = JSON.parse(fs.readFileSync(path.join(KB, "pipeline.config.json"), "utf8"));

const MIN_QUALITY = CONFIG.clean?.minQuality ?? 60;
const MIN_CHARS = CONFIG.clean?.minChars ?? 100;
const FLAGS = ["广告", "引流", "卖课", "带货", "标题党", "跑题", "太短"];

const SYSTEM = `你是小红书内容清洗员。输入是一篇帖子的纯文本，任务是判断它是否值得保留为「岗位知识库」的原料。

判定标准：
- 保留：内容在讲该岗位的真实工作内容（做什么、怎么做、用什么工具、真实体验、坑）。
- 丢弃：纯广告、引流（留微信/加群/私信）、卖课、带货、标题党（标题与内容无关）、跑题（不是讲岗位）、太短（信息量为零）。

工作方式：
1. 删掉纯广告行与引流行，保留其余有效内容——**只删不改**，不得改写、润色、合并有效内容。
2. 给质量分 0-100：信息密度越高、岗位相关细节越具体，分数越高。
3. 给 flags，只能从这些值里选：${FLAGS.join(" / ")}（没有就给空数组）。

只输出 JSON：
{"keep": true|false, "quality": 0-100 的数字, "reason": "一句话说明判定理由", "flags": [], "cleanText": "删掉广告行后的正文"}`;

const AD_PATTERNS = [/加微信/i, /私信我/i, /扫码进群/i, /领取资料/i, /报名课程/i, /关注我/i, /点击链接/i, /带货/i, /优惠券/i, /淘宝|拼多多|京东/i];

function ruleFallback(text) {
  const cleanText = text
    .split("\n")
    .filter((line) => !AD_PATTERNS.some((re) => re.test(line)))
    .join("\n")
    .trim();
  const tooShort = cleanText.length < MIN_CHARS;
  const flags = tooShort ? ["太短"] : [];
  const quality = tooShort ? 20 : 65;
  return {
    keep: !tooShort,
    quality,
    reason: tooShort ? `规则兜底：清理后仅 ${cleanText.length} 字，低于 ${MIN_CHARS} 字下限` : "规则兜底：未命中广告特征且长度达标",
    flags,
    cleanText,
  };
}

function normalize(raw, original) {
  const cleanText = typeof raw.cleanText === "string" ? raw.cleanText.trim() : "";
  const quality = Math.max(0, Math.min(100, Number(raw.quality) || 0));
  const flags = Array.isArray(raw.flags) ? raw.flags.filter((f) => FLAGS.includes(f)) : [];
  const meetsThreshold = quality >= MIN_QUALITY && cleanText.length >= MIN_CHARS;
  return {
    keep: Boolean(raw.keep) && meetsThreshold,
    quality,
    reason: String(raw.reason || "").trim() || "（模型未给理由）",
    flags,
    cleanText: cleanText || original,
  };
}

async function cleanPost(post) {
  const text = post.text || "";
  if (text.trim().length === 0) {
    return { keep: false, quality: 0, reason: "空文本（纯图帖且 OCR 无结果）", flags: ["太短"], cleanText: "" };
  }
  try {
    const raw = await chatJson(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `标题：${post.title || "（无）"}\n\n正文：\n${text.slice(0, 6000)}` },
      ],
      { temperature: 0.1 },
    );
    return normalize(raw, text);
  } catch (error) {
    const fb = ruleFallback(text);
    fb.reason = `LLM 调用失败，已降级规则兜底：${String(error.message || error).slice(0, 100)}`;
    return fb;
  }
}

function renderMd(positionId, title, results) {
  const today = new Date().toISOString().slice(0, 10);
  const kept = results.filter((r) => r.keep);
  const dropped = results.filter((r) => !r.keep);
  const bucket = {};
  for (const d of dropped) for (const f of d.flags) bucket[f] = (bucket[f] || 0) + 1;

  const lines = [
    `# 清洗结果 · ${title || positionId}（${positionId}）`,
    "",
    `> 清洗 Agent · ${today} · 输入 ${results.length} 篇 · 保留 ${kept.length} 篇 · 丢弃 ${dropped.length} 篇`,
    `> 阈值：质量分 ≥ ${MIN_QUALITY} 且正文 ≥ ${MIN_CHARS} 字`,
    "",
    "## 丢弃理由分布",
    "",
    Object.keys(bucket).length > 0 ? Object.entries(bucket).map(([k, v]) => `- ${k}：${v} 篇`).join("\n") : "- （无丢弃）",
    "",
    "## 判定明细",
    "",
    "| 帖子 | 保留 | 质量分 | 标签 | 理由 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.title || r.postId} | ${r.keep ? "是" : "否"} | ${r.quality} | ${r.flags.join("、") || "—"} | ${r.reason.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("", "## 保留文本", "");
  kept.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${r.title || r.postId}`, "", `- 链接：${r.url}`, "", "```text", r.cleanText, "```", "");
  });
  return lines.join("\n");
}

async function runOne(positionId) {
  const src = path.join(IN_DIR, `${positionId}.json`);
  if (!fs.existsSync(src)) throw new Error(`找不到解析结果：${src}`);
  const payload = JSON.parse(fs.readFileSync(src, "utf8"));

  const results = [];
  for (const post of payload.posts || []) {
    const cleaned = await cleanPost(post);
    results.push({ ...cleaned, postId: post.postId, url: post.url, title: post.title, positionId });
    console.log(`[clean] ${post.postId} → ${cleaned.keep ? "保留" : "丢弃"}（${cleaned.quality}）`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${positionId}.md`), renderMd(positionId, payload.title, results), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, `${positionId}.json`),
    JSON.stringify({ positionId, title: payload.title || "", posts: results }, null, 2),
    "utf8",
  );
  console.log(`[clean] ${positionId} 完成：保留 ${results.filter((r) => r.keep).length} / ${results.length}`);
}

async function main() {
  const arg = process.argv[2] || "all";
  const ids =
    arg === "all"
      ? fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [arg];
  if (ids.length === 0) throw new Error("没有可清洗的解析结果");
  for (const id of ids) await runOne(id);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
