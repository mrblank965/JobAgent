/**
 * 总控的交接契约校验器：每步之间检查上游产出是否合规。
 *
 * 用法：
 *   node kb/scripts/validate.cjs plan              校验 output/01-plan/岗位清单.md
 *   node kb/scripts/validate.cjs <stage> <positionId>   校验某岗位的产出（collect/parse/clean/structure/index/qa）
 *   node kb/scripts/validate.cjs <stage> all       校验该阶段全部岗位
 *
 * 退出码：0=合格；1=有不合格项（总控据此退回重做，最多 2 次）。
 * 契约定义见 contracts/handoff-contracts.json；这里额外核对「md 里的统计数字与 json 实际条数一致」。
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");
const CONTRACTS = JSON.parse(fs.readFileSync(path.join(KB, "contracts", "handoff-contracts.json"), "utf8"));

const STAGE_DIR = {
  plan: "01-plan",
  collect: "02-collect",
  parse: "03-parse",
  clean: "04-clean",
  structure: "05-structure",
  index: "06-index",
  qa: "07-qa",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** 岗位 id 列表：优先 plan.json，缺失则解析 岗位清单.md。 */
function listPositionIds() {
  const planJson = path.join(OUT, "01-plan", "plan.json");
  if (fs.existsSync(planJson)) {
    return (readJson(planJson).positions || []).map((p) => p.id);
  }
  const mdPath = path.join(OUT, "01-plan", "岗位清单.md");
  if (!fs.existsSync(mdPath)) return [];
  return fs
    .readFileSync(mdPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^##\s+(\S+)\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

function checkAgainst(schema, obj, label) {
  const issues = [];
  if (!schema) return [`${label}: 契约缺少 schema`];
  for (const field of schema.required || []) {
    const value = obj?.[field];
    if (value === undefined || value === null) {
      issues.push(`${label}: 缺少必填字段 ${field}`);
      continue;
    }
    const expected = schema.properties?.[field]?.type;
    if (expected === "array" && !Array.isArray(value)) issues.push(`${label}: ${field} 应为数组`);
    if (expected === "string" && typeof value !== "string") issues.push(`${label}: ${field} 应为字符串`);
    if (expected === "boolean" && typeof value !== "boolean") issues.push(`${label}: ${field} 应为布尔`);
    if (expected === "number" && typeof value !== "number") issues.push(`${label}: ${field} 应为数字`);
    if (expected === "object" && (typeof value !== "object" || Array.isArray(value))) issues.push(`${label}: ${field} 应为对象`);
  }
  return issues;
}

/** 交付物 md 必须存在、非空。 */
function checkMd(dirName, positionId, issues) {
  const mdPath = path.join(OUT, dirName, `${positionId}.md`);
  if (!fs.existsSync(mdPath)) {
    issues.push(`${positionId}: 缺少交付物 ${dirName}/${positionId}.md`);
    return null;
  }
  const md = fs.readFileSync(mdPath, "utf8");
  if (md.trim().length < 80) issues.push(`${positionId}: 交付物 ${dirName}/${positionId}.md 内容过短，疑似空产出`);
  return md;
}

/** md 头部写的统计数字必须与 json 实际条数一致（防报告吹牛）。 */
function checkCounts(stage, positionId, md, expected, issues) {
  if (!md) return;
  const patterns = {
    collect: /采纳\s*(\d+)\s*条/,
    parse: /共\s*(\d+)\s*篇/,
    clean: /保留\s*(\d+)\s*篇/,
    index: /知识点\s*(\d+)\s*条/,
    qa: /抽检\s*(\d+)\s*\/\s*(\d+)\s*条/,
  };
  const re = patterns[stage];
  if (!re) return;
  const m = md.match(re);
  if (!m) {
    issues.push(`${positionId}: ${stage} 的 md 缺少统计行，无法核对数字`);
    return;
  }
  const stated = Number(m[1]);
  if (stated !== expected) {
    issues.push(`${positionId}: ${stage} 的 md 写「${stated}」，json 实际 ${expected}，数字不一致`);
  }
}

function validatePlan(issues) {
  const dirName = STAGE_DIR.plan;
  const mdPath = path.join(OUT, dirName, "岗位清单.md");
  if (!fs.existsSync(mdPath)) {
    issues.push("缺少交付物 01-plan/岗位清单.md");
    return;
  }
  const md = fs.readFileSync(mdPath, "utf8");
  const ids = listPositionIds();
  if (ids.length === 0) issues.push("岗位清单里没有任何岗位");
  for (const id of ids) {
    const block = md.split(/^##\s+/m).find((b) => b.startsWith(id));
    if (!block) continue;
    if (!/-\s*岗位名：\s*\S+/.test(block)) issues.push(`${id}: 缺「岗位名」行`);
    if (!/-\s*JD 常见别名：\s*\S+/.test(block)) issues.push(`${id}: 缺「JD 常见别名」行`);
    const kw = block.match(/-\s*搜索关键词：\s*(.+)/);
    if (!kw) {
      issues.push(`${id}: 缺「搜索关键词」行`);
    } else if (kw[1].split("|").map((s) => s.trim()).filter(Boolean).length < 3) {
      issues.push(`${id}: 搜索关键词少于 3 个`);
    }
  }
  const planJson = path.join(OUT, dirName, "plan.json");
  if (!fs.existsSync(planJson)) issues.push("缺少机器副本 01-plan/plan.json");
  console.log(`[validate] plan：${ids.length} 个岗位`);
}

function validateStage(stage, positionId, issues) {
  const dirName = STAGE_DIR[stage];
  const jsonPath = path.join(OUT, dirName, `${positionId}.json`);
  if (!fs.existsSync(jsonPath)) {
    issues.push(`${positionId}: 缺少机器副本 ${dirName}/${positionId}.json`);
    return;
  }
  const obj = readJson(jsonPath);
  const md = checkMd(dirName, positionId, issues);

  if (stage === "collect") {
    const posts = obj.posts || [];
    if (posts.length === 0) issues.push(`${positionId}: 采集到 0 条帖子`);
    for (const [i, p] of posts.entries()) {
      issues.push(...checkAgainst(CONTRACTS.collect.output.properties.posts.items, p, `${positionId}.posts[${i}]`));
    }
    checkCounts(stage, positionId, md, posts.length, issues);
    return;
  }

  if (stage === "parse") {
    const posts = obj.posts || [];
    if (posts.length === 0) issues.push(`${positionId}: 解析结果为 0 条`);
    for (const [i, p] of posts.entries()) {
      issues.push(...checkAgainst(CONTRACTS.parse.output.properties.posts.items, p, `${positionId}.posts[${i}]`));
    }
    checkCounts(stage, positionId, md, posts.length, issues);
    return;
  }

  if (stage === "clean") {
    const posts = obj.posts || [];
    if (posts.length === 0) issues.push(`${positionId}: 清洗结果为 0 条`);
    for (const [i, p] of posts.entries()) {
      issues.push(...checkAgainst(CONTRACTS.clean.output.properties.posts.items, p, `${positionId}.posts[${i}]`));
    }
    checkCounts(stage, positionId, md, posts.filter((p) => p.keep).length, issues);
    return;
  }

  if (stage === "structure") {
    issues.push(...checkAgainst(CONTRACTS.structure.output, obj, positionId));
    const filled = ["coreDuties", "workflow", "tools", "typicalDay", "pitfalls"].filter((c) =>
      Array.isArray(obj[c]) ? obj[c].length > 0 : Boolean(obj[c] && String(obj[c]).trim()),
    ).length;
    if (filled === 0) issues.push(`${positionId}: 五类内容全部为空`);
    if (!Array.isArray(obj.sources) || obj.sources.length === 0) issues.push(`${positionId}: 缺来源帖子列表`);
    return;
  }

  if (stage === "index") {
    issues.push(...checkAgainst(CONTRACTS.index.output, obj, positionId));
    const points = obj.points || [];
    if (points.length === 0) issues.push(`${positionId}: 入库知识点为 0 条`);
    checkCounts(stage, positionId, md, points.length, issues);
    return;
  }

  if (stage === "qa") {
    issues.push(...checkAgainst(CONTRACTS.qa.output, obj, positionId));
    if (typeof obj.faithful !== "boolean") issues.push(`${positionId}: faithful 必须是布尔值`);
    return;
  }
}

function main() {
  const stage = process.argv[2];
  const arg = process.argv[3];
  const issues = [];

  if (!STAGE_DIR[stage]) {
    console.error(`未知阶段: ${stage}。可用: ${Object.keys(STAGE_DIR).join("|")}`);
    process.exit(1);
  }

  if (stage === "plan") {
    validatePlan(issues);
  } else {
    const ids = arg && arg !== "all" ? [arg] : listPositionIds();
    if (ids.length === 0) {
      console.error("拿不到岗位清单，无法定位要校验的产出");
      process.exit(1);
    }
    for (const id of ids) validateStage(stage, id, issues);
    console.log(`[validate] ${stage}：检查 ${ids.length} 个岗位`);
  }

  if (issues.length === 0) {
    console.log("PASS: 全部符合契约");
    process.exit(0);
  }
  console.log(`FAIL: ${issues.length} 处不合格`);
  for (const issue of issues.slice(0, 40)) console.log("  - " + issue);
  process.exit(1);
}

main();
