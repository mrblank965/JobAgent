/**
 * 进度看板：扫描 kb/output 各阶段目录，生成岗位 × 阶段完成情况。
 *
 * 运行：
 *   node kb/scripts/status.cjs          打印到控制台，并写入 kb/output/00-进度看板.md
 *
 * 判定规则：某岗位某阶段存在 <id>.json 且能通过 JSON.parse 即视为完成；
 * 质检阶段额外显示 faithful 结论。
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");

const STAGES = [
  ["collect", "02-collect", "采集"],
  ["parse", "03-parse", "解析"],
  ["clean", "04-clean", "清洗"],
  ["structure", "05-structure", "结构化"],
  ["index", "06-index", "入库"],
  ["qa", "07-qa", "质检"],
];

function positionIds() {
  const planJson = path.join(OUT, "01-plan", "plan.json");
  if (!fs.existsSync(planJson)) return [];
  return JSON.parse(fs.readFileSync(planJson, "utf8")).positions.map((p) => ({ id: p.id, title: p.title }));
}

function stageDone(dirName, id) {
  const file = path.join(OUT, dirName, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    return fs.statSync(file).mtime;
  } catch {
    return null;
  }
}

function main() {
  const positions = positionIds();
  const rows = [];
  for (const { id, title } of positions) {
    const cells = [];
    let doneCount = 0;
    for (const [, dirName] of STAGES) {
      const mtime = stageDone(dirName, id);
      if (mtime) {
        doneCount += 1;
        cells.push(`${String(mtime.getHours()).padStart(2, "0")}:${String(mtime.getMinutes()).padStart(2, "0")}`);
      } else {
        cells.push("—");
      }
    }
    let qaNote = "";
    const qaFile = path.join(OUT, "07-qa", `${id}.json`);
    if (fs.existsSync(qaFile)) {
      try {
        const qa = JSON.parse(fs.readFileSync(qaFile, "utf8"));
        qaNote = qa.faithful ? "忠实" : "不忠实";
      } catch {}
    }
    rows.push({ id, title, cells, doneCount, qaNote });
  }

  const now = new Date();
  const header = [
    `# 岗位知识库流水线 · 进度看板`,
    "",
    `> 刷新于 ${now.toLocaleString("zh-CN")} · 总岗位 ${positions.length} 个 · 阶段：采集 → 解析 → 清洗 → 结构化 → 入库 → 质检`,
    "",
    `**整体进度**：${rows.filter((r) => r.doneCount === STAGES.length).length}/${positions.length} 个岗位完成全链路`,
    "",
    "| 岗位 | 采集 | 解析 | 清洗 | 结构化 | 入库 | 质检 | 质检结论 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map((r) => `| ${r.title}（${r.id}） | ${r.cells.join(" | ")} | ${r.qaNote || "—"} |`);
  const md = [...header, ...body, ""].join("\n");

  fs.writeFileSync(path.join(OUT, "00-进度看板.md"), md, "utf8");
  console.log(md);
}

main();