import fs from "node:fs";
import { buildJDDutiesPrompt, normalizeJDDuties } from "../src/lib/ai/jd.ts";

const raw = fs.readFileSync(".env.local", "utf8");
const key = raw.match(/^DEEPSEEK_API_KEY=(.+)$/m)[1].trim();
const base = raw.match(/^DEEPSEEK_BASE_URL=(.+)$/m)[1].trim();
const model = raw.match(/^DEEPSEEK_MODEL=(.+)$/m)[1].trim();

// 知识库没有的岗位：结构工程师
const jd = "招聘结构工程师，负责建筑结构设计、施工图审查、现场技术支持，熟练使用PKPM、YJK等结构计算软件。";

const prompt = buildJDDutiesPrompt(jd); // 无 kbContext、无 webContext

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
const data = normalizeJDDuties(JSON.parse(payload.choices[0].message.content));
console.log("职责数:", data?.duties.length);
for (const d of data.duties) {
  const e = d.essence.slice(0, 36);
  console.log(`[${d.sourceTag}] ${e}`);
}
