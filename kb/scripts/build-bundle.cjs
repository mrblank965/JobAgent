/**
 * 知识库打包（Bundle）：把流水线各阶段的产物压成一个运行时可直接读的文件。
 *
 * 运行：
 *   node kb/scripts/build-bundle.cjs
 *
 * 输入：kb/output/01-plan/plan.json          岗位清单（别名、关键词）
 *       kb/output/05-structure/<id>.json     五类归档 + 来源帖子
 *       kb/output/06-index/<id>.json         知识点（含 kpId，可反查来源链）
 * 产出：kb/store/kb-bundle.json
 *
 * 为什么要打包：网页运行时只需一次读取，不必扫 output 下上百个文件；
 * 同时把「岗位 → 知识点」的检索所需字段限定在必要范围，避免把清洗原文带进前端。
 *
 * 只打包 plan.json 里在册的岗位，已删除的岗位即使磁盘上还有残留产物也不会进库。
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");
const STORE = path.join(KB, "store");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const exists = (file) => fs.existsSync(file);

function loadPlan() {
  const plan = readJson(path.join(OUT, "01-plan", "plan.json"));
  return plan.positions || [];
}

function buildOne(position) {
  const structPath = path.join(OUT, "05-structure", `${position.id}.json`);
  const indexDir = path.join(OUT, "06-index", `${position.id}.json`);

  if (!exists(structPath)) return null;

  const struct = readJson(structPath);
  const points = exists(indexDir) ? readJson(indexDir).points || [] : [];

  // 来源帖子只留标题和链接：链接是溯源凭证，正文不进 bundle（体积和前端暴露都要控）
  const sources = (struct.sources || []).map((s) => ({ title: s.title || "", url: s.url || "" }));

  return {
    positionId: position.id,
    title: struct.positionName || position.title,
    aliases: struct.aliases && struct.aliases.length > 0 ? struct.aliases : position.aliases || [],
    keywords: position.keywords || [],
    industry: position.industry || "",
    direction: position.direction || "",
    sourceCount: sources.length,
    sources: sources.slice(0, 5),
    // 五类归档原文保留，供「更多资讯」直接引用，不经过第二次改写
    sections: {
      coreDuties: struct.coreDuties || [],
      workflow: struct.workflow || [],
      tools: struct.tools || [],
      typicalDay: typeof struct.typicalDay === "string" ? struct.typicalDay : "",
      pitfalls: struct.pitfalls || [],
    },
    knowledgePoints: points.map((p) => ({
      kpId: p.kpId,
      category: p.category,
      text: p.text,
    })),
  };
}

function main() {
  const positions = loadPlan();
  const built = [];
  const skipped = [];

  for (const position of positions) {
    const entry = buildOne(position);
    if (entry) built.push(entry);
    else skipped.push(position.id);
  }

  // 一个岗位都没打包出来，说明 plan.json 或结构化产物出了问题。
  // 这种情况下不能覆盖旧文件：一旦写成空库，前端全部变成「未覆盖」，旧数据也回不来。
  if (built.length === 0) {
    console.error(
      `[bundle] 没有可打包的岗位，已保留原 kb-bundle.json。检查 kb/output/01-plan/plan.json 与 kb/output/05-structure/。`,
    );
    process.exit(1);
  }

  const target = path.join(STORE, "kb-bundle.json");
  const previous = exists(target) ? readJson(target) : null;

  fs.mkdirSync(STORE, { recursive: true });

  const bundle = {
    builtAt: new Date().toISOString(),
    positionCount: built.length,
    pointCount: built.reduce((sum, p) => sum + p.knowledgePoints.length, 0),
    positions: built,
  };

  fs.writeFileSync(target, JSON.stringify(bundle, null, 2), "utf8");

  console.log(`[bundle] 已打包 ${built.length} 个岗位，知识点 ${bundle.pointCount} 条`);
  if (previous && built.length < previous.positionCount * 0.5) {
    console.log(
      `[bundle] 注意：岗位数从 ${previous.positionCount} 降到 ${built.length}，如果不是有意删岗位，检查 plan.json。`,
    );
  }
  if (skipped.length > 0) console.log(`[bundle] 跳过（缺结构化产物）：${skipped.join(", ")}`);

  const bytes = fs.statSync(target).size;
  console.log(`[bundle] 体积 ${(bytes / 1024).toFixed(0)} KB → kb/store/kb-bundle.json`);
}

main();
