/**
 * 质检 Agent（LLM）：抽查结构化内容是否忠实原文。
 *
 * 运行：node kb/scripts/qa.cjs <positionId>   或   node kb/scripts/qa.cjs all
 * 输入：kb/output/04-clean/<positionId>.json（原文）+ kb/output/05-structure/<positionId>.json（结构化结果）
 * 产出：kb/output/07-qa/<positionId>.md   ← 交付物（给人看）
 *       kb/output/07-qa/<positionId>.json ← 机器可读副本
 *       kb/store/source-chain.jsonl 中对应 kpId 的 qaStatus 会被回写
 *
 * 规则：
 *   - 只判「内容有没有原文依据」，不判措辞是否与原文一致（结构化已改写成书面语）。
 *   - 出现「严重 / 中等」问题即判不忠实。
 *   - 抽样比例见 pipeline.config.json 的 qaSampleRate；试点阶段可设为 1（全检）。
 */

const fs = require("node:fs");
const path = require("node:path");
const { chatJson } = require("./lib/llm.cjs");

const KB = path.resolve(__dirname, "..");
const CLEAN_DIR = path.join(KB, "output", "04-clean");
const STRUCT_DIR = path.join(KB, "output", "05-structure");
const INDEX_DIR = path.join(KB, "output", "06-index");
const OUT_DIR = path.join(KB, "output", "07-qa");
const STORE_DIR = path.join(KB, "store");
const CONFIG = JSON.parse(fs.readFileSync(path.join(KB, "pipeline.config.json"), "utf8"));

const SAMPLE_RATE = CONFIG.qaSampleRate ?? 0.1;
const SEVERITIES = ["严重", "中等", "轻微"];

const CATEGORY_LABEL = {
  coreDuties: "核心职责",
  workflow: "工作流程",
  tools: "技能工具",
  typicalDay: "典型的一天",
  pitfalls: "坑与经验",
};

const SYSTEM = `你是知识库质检员。输入是「岗位知识条目」和它依据的「原始帖子文本」，任务是判断每条知识在原文里有没有依据。

判定方法：
1. 逐条读知识条目，回到原文找它的出处。
2. 只要能找到对应的事实依据，就算忠实——**措辞不同不算问题**（条目是改写成书面语的）。
3. 找不到依据（凭空添加、过度推断、把个例当通例、把外部常识写进来）才算不忠实。
4. 严重程度：
   - 严重：原文完全没提，属于脑补出来的内容。
   - 中等：原文提了但被明显放大或改变含义。
   - 轻微：表述略有出入，不影响事实。

只输出 JSON：
{"faithful": true|false, "issues": [{"kpId": "被质疑的条目 id", "category": "所属分类", "problem": "问题说明", "severity": "严重|中等|轻微"}]}
没有问题就返回 {"faithful": true, "issues": []}。`;

function samplePoints(points, rate) {
  if (rate >= 1) return points;
  const n = Math.max(1, Math.round(points.length * rate));
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function writeBackQaStatus(positionId, faithful, checkedIds) {
  const chainPath = path.join(STORE_DIR, "source-chain.jsonl");
  if (!fs.existsSync(chainPath)) return;
  const lines = fs.readFileSync(chainPath, "utf8").split(/\r?\n/).filter(Boolean);
  const updated = lines.map((line) => {
    try {
      const row = JSON.parse(line);
      if (row.positionId !== positionId || !checkedIds.includes(row.kpId)) return line;
      return JSON.stringify({ ...row, qaStatus: faithful ? "pass" : "fail", qaCheckedAt: new Date().toISOString() });
    } catch {
      return line;
    }
  });
  fs.writeFileSync(chainPath, updated.join("\n") + "\n", "utf8");
}

function renderMd(positionId, data, sample, verdict, sources, totalPoints) {
  const today = new Date().toISOString().slice(0, 10);
  const issues = verdict.issues || [];
  const lines = [
    `# 质检结果 · ${data.positionName || positionId}（${positionId}）`,
    "",
    `> 质检 Agent · ${today} · 抽检 ${sample.length} / ${totalPoints} 条 · 结论：${verdict.faithful ? "忠实" : "不忠实"}`,
    "",
    "## 抽检条目",
    "",
    ...sample.map((p) => `- \`${p.kpId}\`［${CATEGORY_LABEL[p.category] || p.category}］${p.text}`),
    "",
    "## 问题明细",
    "",
  ];
  if (issues.length === 0) {
    lines.push("未发现问题。", "");
  } else {
    lines.push("| 条目 | 分类 | 严重度 | 问题 |", "| --- | --- | --- | --- |");
    for (const issue of issues) {
      lines.push(
        `| ${issue.kpId || "—"} | ${CATEGORY_LABEL[issue.category] || issue.category || "—"} | ${issue.severity || "—"} | ${String(issue.problem || "").replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 处理", "");
  if (verdict.faithful) {
    lines.push("全部通过，无需回退。", "");
  } else {
    lines.push("已退回结构化 Agent 重做；重做后仍不通过的条目保留并标记 `qaStatus=fail`，不删除、不隐瞒。", "");
  }

  if (sources && sources.length > 0) {
    lines.push("## 本次依据的原文帖子", "");
    sources.forEach((s, i) => lines.push(`${i + 1}. ${s.title || s.postId}｜${s.url}`));
    lines.push("");
  }
  return lines.join("\n");
}

async function runOne(positionId) {
  const cleanPath = path.join(CLEAN_DIR, `${positionId}.json`);
  const structPath = path.join(STRUCT_DIR, `${positionId}.json`);
  const indexDir = path.join(INDEX_DIR, `${positionId}.json`);
  if (!fs.existsSync(cleanPath) || !fs.existsSync(structPath)) {
    throw new Error(`缺少质检输入：${cleanPath} 或 ${structPath}`);
  }

  const keptPosts = (JSON.parse(fs.readFileSync(cleanPath, "utf8")).posts || []).filter((p) => p.keep);
  const data = JSON.parse(fs.readFileSync(structPath, "utf8"));
  const points = fs.existsSync(indexDir)
    ? JSON.parse(fs.readFileSync(indexDir, "utf8")).points || []
    : [];
  if (points.length === 0) {
    console.log(`[qa] ${positionId} 没有知识点可抽检，跳过`);
    return null;
  }

  const sample = samplePoints(points, SAMPLE_RATE);
  const corpus = keptPosts.map((p, i) => `【帖子 ${i + 1}】${p.title || ""}\n${p.cleanText}`).join("\n\n---\n\n").slice(0, 40000);

  console.log(`[qa] ${positionId} 抽检 ${sample.length}/${points.length} 条…`);
  const raw = await chatJson(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `岗位：${data.positionName}（${positionId}）\n\n【待检知识条目】\n${sample
          .map((p) => `- kpId=${p.kpId} ［${CATEGORY_LABEL[p.category] || p.category}］${p.text}`)
          .join("\n")}\n\n【原文帖子】\n${corpus}`,
      },
    ],
    { temperature: 0.1, maxTokens: 4096 },
  );

  const issues = (raw.issues || []).map((i) => ({
    kpId: String(i.kpId || "").trim(),
    category: String(i.category || "").trim(),
    problem: String(i.problem || "").trim(),
    severity: SEVERITIES.includes(i.severity) ? i.severity : "中等",
  }));
  const verdict = { faithful: issues.length === 0, issues };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, `${positionId}.md`),
    renderMd(positionId, data, sample, verdict, keptPosts.map((p) => ({ postId: p.postId, title: p.title, url: p.url })), points.length),
    "utf8",
  );
  fs.writeFileSync(
    path.join(OUT_DIR, `${positionId}.json`),
    JSON.stringify({ positionId, sampledKpIds: sample.map((p) => p.kpId), totalPoints: points.length, ...verdict }, null, 2),
    "utf8",
  );
  writeBackQaStatus(positionId, verdict.faithful, sample.map((p) => p.kpId));
  console.log(`[qa] ${positionId} 结论：${verdict.faithful ? "忠实" : `不忠实（${issues.length} 处问题）`}`);
  return verdict;
}

async function main() {
  const arg = process.argv[2] || "all";
  const ids =
    arg === "all"
      ? fs.readdirSync(STRUCT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [arg];
  if (ids.length === 0) throw new Error("没有可质检的结构化结果");
  for (const id of ids) await runOne(id);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
