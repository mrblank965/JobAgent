/**
 * 规划清单 · 同类岗位合并：类型相同的岗位不按公募/私募/券商拆分，机构差异收进别名与关键词。
 *
 * 运行：node kb/scripts/plan-merge.cjs
 *
 * 合并动作：
 *   - 私募基金经理 → 并入 fin-fund-pm（基金经理）
 *   - 私募研究员   → 并入 fin-fund-ra（基金研究员）
 *   - 私募交易员 + 券商固收/自营交易 + 基金交易员 → 合并为 fin-fund-trader（买方交易员）
 *   - 私募风控运营 → 并入 fin-sec-compliance-risk（金融合规风控）
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT_DIR = path.join(KB, "output", "01-plan");
const PLAN_JSON = path.join(OUT_DIR, "plan.json");

const DROP = [
  "fin-hf-research",
  "fin-hf-fund-manager",
  "fin-hf-trader",
  "fin-hf-risk-operations",
  "fin-sec-fixed-income-trading",
];

function dedupeCap(arr, cap) {
  return [...new Set(arr)].slice(0, cap);
}

function renderMd(positions) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# 岗位清单",
    "",
    `> 规划 Agent 生成 · ${today} · 含增量扩充（PE / VC / 券商条线 / 公募补充）· 同类岗位已跨机构合并`,
    "> 覆盖范围：金融（银行 / 证券投行 / 基金资管 / 保险 / 互金 / PE / VC）+ 互联网（运营 / 产品 / 数据分析 / 风控）",
    "> 合并说明：交易员 / 基金经理 / 研究员 / 合规风控等同类岗位不按公募私募拆分，机构差异见别名与搜索关键词。",
    "",
    "格式说明：`##` 后是岗位 id；`JD 常见别名` 与 `搜索关键词` 用 ` | ` 分隔，供采集 Agent 程序化解析。",
    "",
  ];
  for (const p of positions) {
    lines.push(
      `## ${p.id}`,
      `- 岗位名：${p.title}`,
      `- 行业：${p.industry}`,
      `- 方向：${p.direction}`,
      `- JD 常见别名：${p.aliases.join(" | ")}`,
      `- 搜索关键词：${p.keywords.join(" | ")}`,
      "",
    );
  }
  return lines.join("\n");
}

const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
const byId = new Map(plan.positions.map((p) => [p.id, p]));

const pm = byId.get("fin-fund-pm");
pm.aliases = dedupeCap([...pm.aliases, "私募基金经理", "对冲基金经理"], 5);
pm.keywords = dedupeCap([...pm.keywords, "私募基金经理劝退"], 5);

const ra = byId.get("fin-fund-ra");
ra.aliases = dedupeCap([...ra.aliases, "私募研究员", "买方研究员"], 5);

const trader = byId.get("fin-fund-trader");
trader.title = "买方交易员（基金/私募/固收）";
trader.direction = "基金/资管";
trader.aliases = ["基金交易员", "私募交易员", "固收交易员", "债券交易员", "自营交易员"];
trader.keywords = ["基金交易员日常", "私募交易员劝退", "固收交易员日常", "交易员真实工作", "债券交易员面试"];

const comp = byId.get("fin-sec-compliance-risk");
comp.title = "金融合规风控（券商/私募）";
comp.aliases = dedupeCap([...comp.aliases, "私募风控", "合规专员"], 5);
comp.keywords = dedupeCap([...comp.keywords, "私募风控日常"], 5);

const before = plan.positions.length;
plan.positions = plan.positions.filter((p) => !DROP.includes(p.id));
plan.generatedAt = new Date().toISOString();

fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "岗位清单.md"), renderMd(plan.positions), "utf8");

console.log(`[plan-merge] 移除 ${before - plan.positions.length} 条冗余：${DROP.join(", ")}`);
console.log(`[plan-merge] 合并后：${trader.id} → ${trader.title}；${comp.id} → ${comp.title}`);
console.log(`[plan-merge] 清单总量：${plan.positions.length} 个岗位，plan.json 与 岗位清单.md 已更新`);