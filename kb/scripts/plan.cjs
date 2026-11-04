/**
 * 规划 Agent（纯 LLM）：归纳金融与互联网的常规岗位，产出岗位清单。
 *
 * 运行：node kb/scripts/plan.cjs
 * 输入：用户背景与覆盖范围（本脚本内置）
 * 产出：
 *   kb/output/01-plan/岗位清单.md   ← 交付物（给人看，固定格式，可被采集 Agent 解析）
 *   kb/output/01-plan/plan.json     ← 同一内容的机器可读副本（流水线内部交接用）
 *
 * 规则：不做 P0/P1/P2 优先级；只列常规岗；每个岗位必须有 JD 常见别名 + 搜索关键词。
 */

const fs = require("node:fs");
const path = require("node:path");
const { chatJson } = require("./lib/llm.cjs");

const KB = path.resolve(__dirname, "..");
const OUT_DIR = path.join(KB, "output", "01-plan");

const SYSTEM = `你是招聘领域研究员。任务：归纳「金融专业求职者」与「互联网从业者」最常被拿来拆解 JD 的【常规岗位】清单。

覆盖范围（必须全部覆盖，每个方向至少 3 个岗位）：
- 金融：银行、证券/投行、基金/资管、保险、互金/金融科技
- 互联网：运营、产品、数据分析、风控/反欺诈

硬性要求：
1. 只列常规岗（大众常搜、招聘量大、JD 常被拿来分析的），不列冷门小众岗。
2. 每个岗位必须给出它在招聘 JD 上常见的【不同名称】（同一岗位的不同叫法），2-5 个。
3. 每个岗位必须给出【求职者在小红书搜索该岗位时会用的关键词】，3-5 个；关键词要口语化、贴近真实发帖语气（例如"银行客户经理劝退""券商投行承做日常"），不要写成岗位职责式的书面语。
4. 岗位 id 命名规则：{industry}-{direction}-{role}，全小写英文短横线连接。industry 只能取 fin（金融）或 it（互联网）。
   例：fin-bank-rm、fin-ib-ibd、fin-fund-ra、fin-ins-actuary、fin-fintech-risk、it-ops-user、it-pm、it-da、it-risk。
5. 不做优先级排序，不要输出 P0/P1/P2。

只输出 JSON，结构如下：
{
  "positions": [
    {
      "id": "fin-bank-rm",
      "title": "银行客户经理",
      "industry": "金融",
      "direction": "银行",
      "aliases": ["理财经理", "个贷客户经理", "对私客户经理"],
      "keywords": ["银行客户经理日常", "银行客户经理劝退", "银行客户经理真实工作"]
    }
  ]
}`;

function renderMd(positions) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# 岗位清单",
    "",
    `> 规划 Agent 生成 · ${today}`,
    "> 覆盖范围：金融（银行 / 证券投行 / 基金资管 / 保险 / 互金）+ 互联网（运营 / 产品 / 数据分析 / 风控）",
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

function normalize(positions) {
  const seen = new Set();
  const out = [];
  for (const p of positions || []) {
    const id = String(p.id || "").trim();
    if (!id || seen.has(id)) continue;
    const aliases = (p.aliases || []).map((s) => String(s).trim()).filter(Boolean);
    const keywords = (p.keywords || []).map((s) => String(s).trim()).filter(Boolean);
    if (keywords.length === 0) continue;
    seen.add(id);
    out.push({
      id,
      title: String(p.title || "").trim(),
      industry: String(p.industry || "").trim(),
      direction: String(p.direction || "").trim(),
      aliases,
      keywords,
    });
  }
  return out;
}

async function main() {
  console.log("[plan] 调用 LLM 生成岗位清单…");
  const data = await chatJson(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: "请输出完整的岗位清单 JSON。覆盖金融与互联网全部方向，每方向至少 3 个常规岗位。" },
    ],
    { temperature: 0.3, maxTokens: 8192 },
  );

  const positions = normalize(data.positions);
  if (positions.length === 0) throw new Error("LLM 未产出任何有效岗位");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "岗位清单.md"), renderMd(positions), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "plan.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), positions }, null, 2),
    "utf8",
  );

  console.log(`[plan] 完成：${positions.length} 个岗位`);
  console.log(`[plan] 交付物：${path.join(OUT_DIR, "岗位清单.md")}`);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
