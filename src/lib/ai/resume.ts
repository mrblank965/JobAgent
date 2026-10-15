import type {
  EducationEntry,
  ExperienceCategory,
  ExperienceEntry,
  ResumeData,
} from "@/types/analysis";
import type { AISettings } from "@/lib/store";

/**
 * AI 双模式。
 *
 * 零 Key 模式：本地拼好 Prompt，复制给任意大模型，把返回的 JSON 粘回来。
 * API 直连模式：填了 Key 就直接请求，接口兼容 OpenAI 的 chat/completions。
 *
 * 这里的 Key 只放在页面内存里，不写 localStorage，也不会上传到我们自己的服务器。
 */

/** 系统提示词。要求只输出严格 JSON，避免模型加解释或代码块。 */
const SYSTEM_PROMPT = "你是资深求职辅导与金融招聘专家。只输出严格 JSON，不要输出 markdown 代码块或任何解释。";

/** 简历解析的 Prompt。要求返回的结构和本项目的 ResumeData 一致。 */
export function buildResumePrompt(raw: string): string {
  return `请把下面这份简历整理成严格 JSON，字段如下：

{
  "name": "姓名，识别不到就空字符串",
  "email": "邮箱，只填写简历原文中真实出现的邮箱，识别不到就空字符串",
  "phone": "手机号，只填写简历原文中真实出现的号码，识别不到就空字符串",
  "gradYear": "毕业年份，四位数字，识别不到就空字符串",
  "school": "最高学历的学校",
  "major": "最高学历的专业",
  "degree": "本科 | 硕士 | 博士 | 专科 | 其他",
  "honors": ["奖学金、荣誉称号这类，例如 国家奖学金（2023）"],
  "skills": ["技能，尽量完整，例如 熟练使用Wind数据库"],
  "strengths": ["个人优势，每条一句话"],
  "education": [
    {
      "degree": "bachelor | master | doctor | associate | other",
      "school": "", "college": "", "major": "",
      "periodStart": "YYYY-MM-DD，只有年月就补 -01",
      "periodEnd": "YYYY-MM-DD，在读可留空",
      "performance": "GPA 或排名，没有就空字符串"
    }
  ],
  "experiences": [
    {
      "title": "公司或机构名称",
      "role": "职位",
      "periodStart": "YYYY-MM-DD",
      "periodEnd": "YYYY-MM-DD",
      "bullets": ["在这段经历里做的事，每行一条"]
    }
  ],
  "projects": [
    {
      "category": "project | paper | competition",
      "title": "项目、赛事或论文名称",
      "role": "角色或奖项",
      "periodStart": "YYYY-MM-DD",
      "periodEnd": "YYYY-MM-DD",
      "bullets": []
    }
  ]
}

硬性要求：
1. 只能使用简历里真实出现的信息，一个字都不许编。识别不到就留空字符串或空数组。
2. 论文归到 projects 并把 category 设为 paper，竞赛归到 projects 并把 category 设为 competition。
   奖学金和荣誉称号归到 honors，不要放进 education。
3. 每条经历的事项要拆开，一件事一条，不要把整段话塞进一条。
4. 日期统一成 YYYY-MM-DD，只有年份没有月份就补 -01。

简历原文如下：
"""
${raw}
"""`;
}

/** 去掉模型可能加上的代码块围栏。 */
export function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/**
 * 直连调用。只有填了 apiKey 才会走到这里。
 * 失败时把原始错误抛出去，由界面提示可以改用零 Key 模式。
 */
export async function callChatJSON(settings: AISettings, prompt: string): Promise<unknown> {
  const base = (settings.apiBase || "https://api.deepseek.com/v1").replace(/\/+$/, "");

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || "deepseek-chat",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  // 接口的错误正文里通常写清了原因（模型不存在、Key 无效、未开通），带出来省得对着状态码猜
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`接口返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = stripCodeFence(String(data.choices?.[0]?.message?.content ?? ""));

  if (!content) throw new Error("接口没有返回内容");

  return JSON.parse(content) as unknown;
}

/** 把模型返回的 JSON 文本解析成对象，失败时给一句人话。 */
export function parsePastedJSON(text: string): unknown {
  const cleaned = stripCodeFence(text);
  if (!cleaned) throw new Error("粘贴的内容是空的");
  return JSON.parse(cleaned) as unknown;
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const DEGREES: EducationEntry["degree"][] = ["doctor", "master", "bachelor", "associate", "other"];
const CATEGORIES: ExperienceCategory[] = ["paper", "competition", "project"];

function normalizeEducation(value: unknown): EducationEntry {
  const raw = (value ?? {}) as Record<string, unknown>;
  const degree = asString(raw.degree) as EducationEntry["degree"];

  return {
    degree: DEGREES.includes(degree) ? degree : "other",
    school: asString(raw.school),
    college: asString(raw.college),
    major: asString(raw.major),
    periodStart: asString(raw.periodStart),
    periodEnd: asString(raw.periodEnd),
    performance: asString(raw.performance),
  };
}

function normalizeExperience(value: unknown): ExperienceEntry {
  const raw = (value ?? {}) as Record<string, unknown>;
  const category = asString(raw.category) as ExperienceCategory;

  return {
    ...(CATEGORIES.includes(category) ? { category } : {}),
    title: asString(raw.title),
    role: asString(raw.role),
    periodStart: asString(raw.periodStart),
    periodEnd: asString(raw.periodEnd),
    bullets: asStringArray(raw.bullets),
  };
}

/**
 * 把模型返回的内容整理成本项目的 ResumeData。
 *
 * 模型可能少给字段或把数组写成 null，这里统一补全，
 * 补完还是空的就返回 null，让界面提示重试。
 */
export function normalizeAIResume(data: unknown): ResumeData | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;
  const resume: ResumeData = {
    name: asString(raw.name),
    email: asString(raw.email),
    phone: asString(raw.phone),
    education: Array.isArray(raw.education) ? raw.education.map(normalizeEducation) : [],
    honors: asStringArray(raw.honors),
    experiences: Array.isArray(raw.experiences) ? raw.experiences.map(normalizeExperience) : [],
    projects: Array.isArray(raw.projects) ? raw.projects.map(normalizeExperience) : [],
    skills: asStringArray(raw.skills),
    strengths: asStringArray(raw.strengths),
  };

  const hasContent =
    Boolean(resume.name || resume.email || resume.phone) ||
    resume.education.length > 0 ||
    resume.experiences.length > 0 ||
    resume.projects.length > 0 ||
    resume.skills.length > 0 ||
    resume.strengths.length > 0;

  return hasContent ? resume : null;
}
