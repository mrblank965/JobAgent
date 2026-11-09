/**
 * 入库 Agent（工具型）：按岗位聚合知识点、去重、建检索索引、落来源链。
 *
 * 运行：node kb/scripts/build-index.cjs <positionId>   或   node kb/scripts/build-index.cjs all
 * 输入：kb/output/05-structure/<positionId>.json（+ 04-clean 用于取原文链接）
 * 产出：
 *   kb/output/06-index/<positionId>.md    ← 交付物（给人看的知识库条目）
 *   kb/output/06-index/<positionId>.json  ← 机器可读副本
 *   kb/store/index.json                   ← 检索索引（岗位名 / 别名 / 关键词 → 岗位）
 *   kb/store/source-chain.jsonl           ← 来源链（原文链接 → 清洗文本 → 结构化内容 → kpId）
 *
 * 说明：本 Agent 负责来源链落盘（总控不落盘）。当前环境无 embedding 服务，降级为关键词倒排。
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const IN_DIR = path.join(KB, "output", "05-structure");
const CLEAN_DIR = path.join(KB, "output", "04-clean");
const PLAN_JSON = path.join(KB, "output", "01-plan", "plan.json");
const OUT_DIR = path.join(KB, "output", "06-index");
const STORE_DIR = path.join(KB, "store");

const CATEGORY_LABEL = {
  coreDuties: "核心职责",
  workflow: "工作流程",
  tools: "技能工具",
  typicalDay: "典型的一天",
  pitfalls: "坑与经验",
};

/** 归一化用于去重：去掉标点、空格与常见虚词差异。 */
function normalizeKey(text) {
  return String(text)
    .replace(/[\s，。、；：！？（）「」【】《》,.;:!?()"']/g, "")
    .toLowerCase();
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const text = String(item).trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function loadPlan() {
  if (!fs.existsSync(PLAN_JSON)) return new Map();
  const positions = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")).positions || [];
  return new Map(positions.map((p) => [p.id, p]));
}

function buildKnowledgePoints(data) {
  const points = [];
  const push = (category, text) => {
    if (!text || !String(text).trim()) return;
    points.push({ category, text: String(text).trim() });
  };

  for (const item of dedupe(data.coreDuties)) push("coreDuties", item);
  for (const item of dedupe(data.workflow)) push("workflow", item);
  for (const item of dedupe(data.tools)) push("tools", item);
  if (data.typicalDay) push("typicalDay", data.typicalDay);
  for (const item of dedupe(data.pitfalls)) push("pitfalls", item);

  return points.map((p, i) => ({ ...p, kpId: `${data.positionId}-kp-${String(i + 1).padStart(3, "0")}` }));
}

function renderMd(data, points, sources, indexedAt) {
  const byCategory = {};
  for (const p of points) (byCategory[p.category] = byCategory[p.category] || []).push(p);

  const lines = [
    `# 知识库条目 · ${data.positionName}（${data.positionId}）`,
    "",
    `> 入库 Agent · ${indexedAt} · 知识点 ${points.length} 条 · 来源帖子 ${sources.length} 篇`,
    "> 检索方式：关键词倒排（当前环境无 embedding 服务，未使用向量检索）",
    "",
    `**岗位别名**：${(data.aliases || []).join("、") || "暂缺"}`,
    "",
  ];

  for (const [category, label] of Object.entries(CATEGORY_LABEL)) {
    const items = byCategory[category] || [];
    lines.push(`## ${label}`, "");
    if (items.length === 0) {
      lines.push("暂缺（输入帖子未涉及）", "");
      continue;
    }
    for (const item of items) lines.push(`- \`${item.kpId}\` ${item.text}`);
    lines.push("");
  }

  lines.push("## 来源链", "");
  lines.push("| 知识点 | 来源帖子 | 原文链接 |");
  lines.push("| --- | --- | --- |");
  for (const p of points) {
    lines.push(`| ${p.kpId} | ${sources.map((s) => s.title || s.postId).join("、")} | ${sources.map((s) => s.url).join(" ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function runOne(positionId, planMap, indexedAt) {
  const src = path.join(IN_DIR, `${positionId}.json`);
  if (!fs.existsSync(src)) throw new Error(`找不到结构化结果：${src}`);
  const data = JSON.parse(fs.readFileSync(src, "utf8"));

  const points = buildKnowledgePoints(data);
  const planEntry = planMap.get(positionId) || {};

  // 来源链：从清洗结果里取回每篇帖子的链接，把知识点挂到来源上
  const cleanPath = path.join(CLEAN_DIR, `${positionId}.json`);
  const keptPosts = fs.existsSync(cleanPath)
    ? (JSON.parse(fs.readFileSync(cleanPath, "utf8")).posts || []).filter((p) => p.keep)
    : [];
  const sources = data.sources && data.sources.length > 0
    ? data.sources
    : keptPosts.map((p) => ({ postId: p.postId, title: p.title || "", url: p.url }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${positionId}.md`), renderMd(data, points, sources, indexedAt), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, `${positionId}.json`),
    JSON.stringify(
      {
        status: points.length > 0 ? "indexed" : "skipped",
        positionId,
        positionName: data.positionName,
        aliases: data.aliases || [],
        vectorStore: "keyword-inverted",
        points,
        sources,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.mkdirSync(STORE_DIR, { recursive: true });
  const chainPath = path.join(STORE_DIR, "source-chain.jsonl");
  const chainLines = [];
  for (const p of points) {
    for (const s of sources) {
      chainLines.push(
        JSON.stringify({
          kpId: p.kpId,
          positionId,
          category: p.category,
          sourceUrl: s.url,
          cleanArtifact: `output/04-clean/${positionId}.json`,
          structuredArtifact: `output/05-structure/${positionId}.json`,
          indexedArtifact: `output/06-index/${positionId}.json`,
          qaStatus: "pending",
          indexedAt,
        }),
      );
    }
  }
  if (chainLines.length > 0) fs.appendFileSync(chainPath, chainLines.join("\n") + "\n", "utf8");

  return {
    positionId,
    positionName: data.positionName,
    aliases: data.aliases || [],
    keywords: planEntry.keywords || [],
    knowledgePointCount: points.length,
    status: points.length > 0 ? "indexed" : "skipped",
  };
}

function main() {
  const arg = process.argv[2] || "all";
  const ids =
    arg === "all"
      ? fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [arg];
  if (ids.length === 0) throw new Error("没有可入库的结构化结果");

  const planMap = loadPlan();
  const indexedAt = new Date().toISOString();
  const entries = [];
  for (const id of ids) entries.push(runOne(id, planMap, indexedAt));

  // 检索索引：岗位名 / 别名 / 关键词 → 岗位
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const index = {
    generatedAt: indexedAt,
    retrieval: "keyword-inverted",
    positions: entries.map((e) => ({ positionId: e.positionId, title: e.positionName, aliases: e.aliases, keywords: e.keywords })),
    terms: {},
  };
  for (const e of entries) {
    for (const term of [e.positionName, ...e.aliases, ...e.keywords].filter(Boolean)) {
      index.terms[term] = e.positionId;
    }
  }
  fs.writeFileSync(path.join(STORE_DIR, "index.json"), JSON.stringify(index, null, 2), "utf8");

  console.log(`[index] 完成 ${entries.length} 个岗位，检索词 ${Object.keys(index.terms).length} 个`);
  for (const e of entries) console.log(`[index]   ${e.positionId}: ${e.knowledgePointCount} 条知识点`);
}

try {
  main();
} catch (error) {
  console.error("FAILED:", error.message || error);
  process.exit(1);
}
