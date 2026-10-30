/**
 * 结构化 Agent（LLM）：把清洗后的多篇帖子整合成一份风格统一的岗位知识。
 *
 * 运行：node kb/scripts/structure.cjs <positionId>   或   node kb/scripts/structure.cjs all
 * 输入：kb/output/04-clean/<positionId>.json（只取 keep=true 的帖子）
 * 产出：kb/output/05-structure/<positionId>.md   ← 交付物（给人看）
 *       kb/output/05-structure/<positionId>.json ← 机器可读副本（流水线内部交接）
 *
 * 规则：
 *   - 允许改写措辞：从原文内容出发，写成自然、严谨的书面语句，不要口语化，整体风格统一。
 *   - 不再要求原文原句；溯源靠 md 末尾的来源帖子链接。
 *   - 仍然不许脑补：只写原文出现过的内容；某类原文没提到就写「暂缺」。
 *   - 跨帖说法冲突时两个都列，不调和。
 */

const fs = require("node:fs");
const path = require("node:path");
const { chatJson } = require("./lib/llm.cjs");

const KB = path.resolve(__dirname, "..");
const IN_DIR = path.join(KB, "output", "04-clean");
const OUT_DIR = path.join(KB, "output", "05-structure");
const PLAN_JSON = path.join(KB, "output", "01-plan", "plan.json");

const CATEGORIES = ["coreDuties", "workflow", "tools", "typicalDay", "pitfalls"];
const CATEGORY_LABEL = {
  coreDuties: "核心职责",
  workflow: "工作流程",
  tools: "技能工具",
  typicalDay: "典型的一天",
  pitfalls: "坑与经验",
};

const SYSTEM = `你是岗位知识整理员。输入是同一个岗位的多篇小红书帖子（已清洗），任务是把它们整合成一份岗位知识。

改写风格（硬性要求）：
- 把口语化、带情绪、带网络用语的表述，改写成自然、严谨的书面语句。
- 全书风格统一：句式、人称、用词习惯保持一致，不要一半书面一半口语。
- 不要出现"姐妹们""真的会谢""谁懂啊"这类表达，也不要出现 emoji。

内容纪律（硬性要求）：
- 只写输入帖子中出现过的内容，**严禁脑补**，不得用岗位常识补充帖子没写的东西。
- 某一类输入里完全没有提到，就把该类留空（输出空数组或空字符串），由渲染层标注「暂缺」。
- 不同帖子说法冲突时，两条都保留，不要自行调和或取舍。
- 不做跨岗位合并，只处理当前这一个岗位。

按五类归档：核心职责(coreDuties) / 工作流程(workflow) / 技能工具(tools) / 典型的一天(typicalDay) / 坑与经验(pitfalls)。

只输出 JSON：
{
  "positionName": "岗位名",
  "aliases": ["该岗位的其他叫法"],
  "coreDuties": ["..."],
  "workflow": ["..."],
  "tools": ["..."],
  "typicalDay": "一段连贯的叙述",
  "pitfalls": ["..."]
}`;

function loadPositionMeta(positionId) {
  if (!fs.existsSync(PLAN_JSON)) return { title: positionId, aliases: [] };
  const positions = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")).positions || [];
  const found = positions.find((p) => p.id === positionId);
  return found ? { title: found.title, aliases: found.aliases || [] } : { title: positionId, aliases: [] };
}

function asList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

async function structurePosition(positionId, posts) {
  const meta = loadPositionMeta(positionId);
  const corpus = posts
    .map((p, i) => `【帖子 ${i + 1}】${p.title || ""}\n${p.cleanText}`)
    .join("\n\n---\n\n")
    .slice(0, 40000);

  const raw = await chatJson(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `岗位：${meta.title}（${positionId}）\n已知别名：${meta.aliases.join("、") || "无"}\n\n以下是该岗位的帖子：\n\n${corpus}`,
      },
    ],
    { temperature: 0.3, maxTokens: 8192 },
  );

  return {
    positionId,
    positionName: String(raw.positionName || meta.title).trim(),
    aliases: asList(raw.aliases).length > 0 ? asList(raw.aliases) : meta.aliases,
    coreDuties: asList(raw.coreDuties),
    workflow: asList(raw.workflow),
    tools: asList(raw.tools),
    typicalDay: typeof raw.typicalDay === "string" ? raw.typicalDay.trim() : asList(raw.typicalDay).join("\n"),
    pitfalls: asList(raw.pitfalls),
    sources: posts.map((p) => ({ postId: p.postId, title: p.title || "", url: p.url })),
  };
}

function renderSection(list) {
  if (list.length === 0) return ["暂缺（输入帖子未涉及）", ""];
  return [...list.map((item) => `- ${item}`), ""];
}

function renderMd(data) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# ${data.positionName}（${data.positionId}）`,
    "",
    `> 结构化 Agent · ${today} · 基于 ${data.sources.length} 篇帖子整合 · 已改写为书面语`,
    "",
    `**岗位别名**：${data.aliases.join("、") || "暂缺"}`,
    "",
    `## ${CATEGORY_LABEL.coreDuties}`,
    "",
    ...renderSection(data.coreDuties),
    `## ${CATEGORY_LABEL.workflow}`,
    "",
    ...renderSection(data.workflow),
    `## ${CATEGORY_LABEL.tools}`,
    "",
    ...renderSection(data.tools),
    `## ${CATEGORY_LABEL.typicalDay}`,
    "",
    data.typicalDay || "暂缺（输入帖子未涉及）",
    "",
    `## ${CATEGORY_LABEL.pitfalls}`,
    "",
    ...renderSection(data.pitfalls),
    "## 来源帖子",
    "",
    ...data.sources.map((s, i) => `${i + 1}. ${s.title || s.postId}｜${s.url}`),
    "",
  ];
  return lines.join("\n");
}

async function runOne(positionId) {
  const src = path.join(IN_DIR, `${positionId}.json`);
  if (!fs.existsSync(src)) throw new Error(`找不到清洗结果：${src}`);
  const payload = JSON.parse(fs.readFileSync(src, "utf8"));
  const posts = (payload.posts || []).filter((p) => p.keep && p.cleanText && p.cleanText.trim().length > 0);
  if (posts.length === 0) {
    console.log(`[structure] ${positionId} 没有保留的帖子，跳过`);
    return;
  }

  console.log(`[structure] ${positionId} 整合 ${posts.length} 篇帖子…`);
  const data = await structurePosition(positionId, posts);
  const filled = CATEGORIES.filter((c) => asList(data[c]).length > 0).length;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${positionId}.md`), renderMd(data), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, `${positionId}.json`), JSON.stringify(data, null, 2), "utf8");
  console.log(`[structure] ${positionId} 完成：5 类中已填充 ${filled} 类`);
}

async function main() {
  const arg = process.argv[2] || "all";
  const ids =
    arg === "all"
      ? fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [arg];
  if (ids.length === 0) throw new Error("没有可结构化的清洗结果");
  for (const id of ids) await runOne(id);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
