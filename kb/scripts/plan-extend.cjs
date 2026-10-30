/**
 * 规划 Agent · 增量扩充模式：在既有清单基础上补充新岗位，不改动已有岗位。
 *
 * 运行：node kb/scripts/plan-extend.cjs
 *
 * 扩充范围：PE（私募股权）、VC（风险投资）、券商其他条线（资管/固收自营/财富管理/合规风控）、
 *          私募证券、公募基金补充（渠道/产品/交易/指数）——前台+中台。
 *
 * 规则：
 *   - 已有岗位（plan.json 全部条目）原样保留，下游成果的 id 关联不受影响
 *   - 新岗位 id 命名空间：fin-pe-* / fin-vc-* / fin-sec-* / fin-hf-* / fin-fund-*
 *   - 产出重写 01-plan/岗位清单.md 与 plan.json（老岗位在前、新岗位在后）
 */

const fs = require("node:fs");
const path = require("node:path");
const { chatJson } = require("./lib/llm.cjs");

const KB = path.resolve(__dirname, "..");
const OUT_DIR = path.join(KB, "output", "01-plan");
const PLAN_JSON = path.join(OUT_DIR, "plan.json");

const DIRECTION_BY_NS = {
  "fin-pe-": "私募股权",
  "fin-vc-": "风险投资",
  "fin-sec-": "证券/投行",
  "fin-hf-": "私募证券",
  "fin-fund-": "基金/资管",
};

const SYSTEM = `你是招聘领域研究员。任务：在一个既有岗位清单的基础上，【只补充新增岗位】。

扩充方向（每个方向 2-4 个岗位，总数 12-16 个，前台与中台都要有）：
1. PE 私募股权：如投资经理/投资分析师、投后管理、基金募集/投资者关系（IR）等
2. VC 风险投资：如投资分析师/投资经理、行业研究等
3. 券商其他条线（已有投行承做/研究员/机构销售，不要重复）：如券商资管、固收或自营交易、财富管理投资顾问、合规风控等
4. 私募证券（阳光私募/对冲基金）：如私募研究员、私募基金经理、私募交易员、风控运营等
5. 公募基金补充（已有基金研究员/基金经理/基金运营，不要重复）：如渠道销售、基金产品经理、基金交易员、指数投资等

硬性要求：
1. 只列常规岗（招聘量大、JD 常被拿来拆解的），不列冷门小众岗。
2. 每个岗位给出 JD 上常见的不同名称 2-5 个（aliases）。
3. 每个岗位给出求职者在小红书搜索时会用的关键词 3-5 个（keywords），口语化、贴近真实发帖语气（如"PE投资经理劝退""券商资管日常"），不要书面语。
4. 岗位 id 命名规则：{industry}-{direction}-{role}，全小写英文短横线；行业前缀固定 fin。命名空间必须是：
   fin-pe-（PE）、fin-vc-（VC）、fin-sec-（券商其他条线）、fin-hf-（私募证券）、fin-fund-（公募补充）。
5. 不得与既有岗位重复。既有岗位清单（这些不要再出）：
${"{{EXISTING}}"}；direction 也不用你填，系统会按命名空间自动归入：私募股权/风险投资/证券投行/私募证券/基金资管。

只输出 JSON：
{
  "positions": [
    { "id": "fin-pe-invest", "title": "PE投资经理", "aliases": ["投资经理", "PE分析师"], "keywords": ["PE投资经理日常", "PE劝退", "私募股权投资岗真实工作"] }
  ]
}`;

function renderMd(positions) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# 岗位清单",
    "",
    `> 规划 Agent 生成 · ${today} · 含增量扩充（PE / VC / 券商条线 / 私募 / 公募）`,
    "> 覆盖范围：金融（银行 / 证券投行 / 基金资管 / 保险 / 互金 / PE / VC / 私募证券）+ 互联网（运营 / 产品 / 数据分析 / 风控）",
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

function normalizeNew(raw, existingIds, existingTitles) {
  const seen = new Set(existingIds);
  const out = [];
  const problems = [];
  for (const p of raw || []) {
    const id = String(p.id || "").trim();
    if (!id || seen.has(id)) {
      problems.push(`丢弃重复/空 id：${id || "(空)"}`);
      continue;
    }
    const ns = Object.keys(DIRECTION_BY_NS).find((k) => id.startsWith(k));
    if (!ns) {
      problems.push(`丢弃命名空间不符：${id}`);
      continue;
    }
    if (!/^fin-(pe|vc|sec|hf|fund)-[a-z0-9-]+$/.test(id)) {
      problems.push(`丢弃 id 格式不符：${id}`);
      continue;
    }
    if (existingTitles.has(String(p.title || "").trim())) {
      problems.push(`丢弃与既有岗位同名：${p.title}`);
      continue;
    }
    const aliases = (p.aliases || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
    const keywords = (p.keywords || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 5);
    if (keywords.length < 3) {
      problems.push(`丢弃关键词不足 3 个：${id}`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      title: String(p.title || "").trim(),
      industry: "金融",
      direction: DIRECTION_BY_NS[ns],
      aliases,
      keywords,
    });
  }
  return { positions: out, problems };
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8"));
  const oldPositions = existing.positions || [];
  const existingIds = oldPositions.map((p) => p.id);
  const existingTitles = new Set(oldPositions.map((p) => p.title));
  const existingDesc = oldPositions.map((p) => `${p.title}（${p.direction}）`).join("、");

  let added = [];
  let problems = [];
  for (let attempt = 1; attempt <= 2 && added.length === 0; attempt += 1) {
    console.log(`[plan-extend] 第 ${attempt} 次调用 LLM 生成新增岗位…`);
    const data = await chatJson(
      [
        { role: "system", content: SYSTEM.replace("{{EXISTING}}", existingDesc) },
        {
          role: "user",
          content: "请输出新增岗位 JSON，总数 12-16 个，五个方向都要覆盖，前台与中台兼顾。",
        },
      ],
      { temperature: 0.3, maxTokens: 4096 },
    );
    const r = normalizeNew(data.positions, existingIds, existingTitles);
    added = r.positions;
    problems = r.problems;
    if (added.length === 0) console.log(`[plan-extend] 本次无有效新增：${problems.join("；")}`);
  }
  if (added.length === 0) throw new Error("两次尝试均未产出有效新增岗位");

  const merged = [...oldPositions, ...added];
  fs.writeFileSync(
    path.join(OUT_DIR, "岗位清单.md"),
    renderMd(merged),
    "utf8",
  );
  fs.writeFileSync(
    PLAN_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), positions: merged }, null, 2),
    "utf8",
  );

  console.log(`[plan-extend] 新增 ${added.length} 个：`);
  for (const p of added) console.log(`  + ${p.id} ${p.title}（${p.direction}）关键词：${p.keywords.join(" / ")}`);
  if (problems.length) console.log(`[plan-extend] 校验剔除：${problems.join("；")}`);
  console.log(`[plan-extend] 清单总量：${merged.length} 个岗位，交付物已更新`);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});