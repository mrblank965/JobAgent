import fs from "node:fs";
import { buildJDDutiesPrompt, normalizeJDDuties } from "../src/lib/ai/jd.ts";

const raw = fs.readFileSync(".env.local", "utf8");
const key = raw.match(/^DEEPSEEK_API_KEY=(.+)$/m)[1].trim();
const base = raw.match(/^DEEPSEEK_BASE_URL=(.+)$/m)[1].trim();
const model = raw.match(/^DEEPSEEK_MODEL=(.+)$/m)[1].trim();

const jd = "招聘银行客户经理，负责个人客户的存款、理财、贷款业务拓展，维护客户关系，完成存款和中间业务收入指标，要求本科以上学历，有银行零售经验优先。";

// 拿知识库上下文
const r = await fetch("http://localhost:3111/api/kb/match", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jd, title: "银行客户经理", ai: { apiBase: base, apiKey: key, model } }),
});
const { match } = await r.json();
const kbContext = match?.context ?? "";
console.log("匹配岗位:", match?.positionTitle);

const prompt = buildJDDutiesPrompt(jd, kbContext);

const res = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
  }),
});
const payload = await res.json();
if (!res.ok) {
  console.log("ERR", JSON.stringify(payload).slice(0, 300));
  process.exit(1);
}

const content = payload.choices[0].message.content;
const data = normalizeJDDuties(JSON.parse(content));
console.log("\n职责数:", data?.duties.length);
for (const d of data.duties) {
  console.log(`\n[${d.sourceTag}] ${d.source.slice(0, 24)}...`);
  console.log(`  实际上: ${d.essence.slice(0, 40)}`);
}
