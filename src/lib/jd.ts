/**
 * JD 拆解。本地规则，离线可用，不调用模型。
 * 逻辑沿用参考页 jobagent 的设计：先抽关键词，再和技能库逐条比对。
 */

/** 技能词典。JD 里出现这些词就算一个关键词。 */
export const SKILL_DICT = [
  "财务报表", "财务分析", "估值", "DCF", "财务模型", "行业研究", "行研", "深度报告", "尽职调查",
  "投研", "投行", "IPO", "并购", "重组", "一级市场", "二级市场", "基金", "证券", "股票", "债券",
  "银行", "保险", "信托", "期货", "信贷", "风控", "风险管理", "合规", "量化", "宏观经济",
  "资产配置", "私募", "股权投资", "PE", "VC", "商业计划书", "BP", "融资", "路演", "审计", "税务",
  "会计", "内部控制", "法律", "供应链", "ESG", "咨询", "商业分析", "访谈", "调研",
  "Python", "SQL", "Java", "C++", "机器学习", "深度学习", "NLP", "数据挖掘", "数据分析", "统计",
  "算法", "Excel", "PPT", "VBA", "Wind", "Choice", "Bloomberg", "彭博",
  "产品经理", "运营", "市场营销", "沟通", "团队合作", "抗压", "学习能力", "逻辑思维", "演讲", "写作",
  "英语", "四级", "六级", "雅思", "托福", "GRE", "GMAT", "CPA", "CFA", "FRM", "法律职业资格",
];

/** 从"熟悉/掌握 + 词"里补充抽取的关键词。 */
const SKILL_VERB_PATTERN = /(?:熟悉|掌握|精通|了解|具备|擅长)\s*([A-Za-z0-9#+一-龥、/，]{2,30})/g;

/** 职责行的开头动词。 */
const DUTY_PREFIX = /^(负责|参与|协助|承担|跟进|完成|支持|推动|对接)/;

/** 要求行的特征词。 */
const REQUIRE_HINT =
  /(任职资格|岗位要求|任职要求|职位要求|要求如下|优先|熟悉|掌握|了解|精通|具备|学历|本科|硕士|博士|经验|专业|CET|英语)/;

/**
 * JD 里的分区标题。招聘贴通常用【职位描述】和【职位要求】把内容分成两段，
 * 按这个切比逐行猜准得多。
 */
const JD_SECTION_MARKERS: { pattern: RegExp; kind: "duty" | "req" }[] = [
  { pattern: /职位描述|岗位描述|工作内容|岗位职责|工作职责|职责描述|你将做什么/, kind: "duty" },
  { pattern: /职位要求|任职要求|岗位要求|任职资格|招聘要求|申请要求|资格条件|我们希望你/, kind: "req" },
];

/** 条目开头的序号，例如 "1." "1、" "（1）"。 */
const JD_ITEM_PREFIX = /^[0-9０-９]{1,2}\s*[.、．)）]\s*/;

/** 邮箱。 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 【……】形式的方括号块，招聘贴常用来放标题行和命名格式。 */
const BRACKET_BLOCK = /【([^】]{2,60})】/g;

/** 看起来像简历命名格式的块，例如"姓名_学校_毕业年份_可工作时长"。 */
const NAMING_HINT = /姓名|学校|毕业|到岗|时长|岗位|专业/;

/** 硬性条件，单独挑出来提醒。 */
const HARD_HINT = /(CPA|CFA|FRM|Python|SQL|Java|C\+\+|Excel|PPT|VBA|Wind|Choice|Bloomberg|彭博|四级|六级|雅思|托福|GRE|GMAT|本科|硕士|博士|经验|证书)/;

export type JDKeyword = { k: string; n: number };

export type JDAnalysis = {
  keywords: string[];
  duties: string[];
  reqs: string[];
  hard: string[];
  preferred: string[];
  /** 公司、岗位、城市、投递邮箱、简历命名格式。 */
  info: JDInfo;
  match: {
    score: number;
    hits: { k: string; ev: string }[];
    partial: { k: string }[];
    missing: string[];
  };
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/** 在简历正文里找这个关键词的出处，作为命中证据。 */
export function findEvidence(resumeText: string, keyword: string): string {
  if (!resumeText) return "";

  for (const line of resumeText.split(/\n+/)) {
    if (line.includes(keyword)) return line.trim().slice(0, 60);
  }
  return "";
}

/**
 * 拆解一段 JD。
 * skills 是画像里的技能标签，resumeText 是简历原文，用来找命中证据。
 */
export function analyzeJD(raw: string, skills: string[], resumeText: string): JDAnalysis {
  const text = raw ?? "";
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[·•\-—\d.、)）\s]+/, ""))
    .filter((line) => line.length > 3);

  // 先按【职位描述】【职位要求】分区，找不到分区标题再退回逐行猜
  const sections = splitJDSections(text);

  const duties: string[] = [...sections.duties];
  const reqs: string[] = [...sections.reqs];

  if (duties.length === 0 && reqs.length === 0) {
    for (const line of lines) {
      if (DUTY_PREFIX.test(line)) duties.push(line);
      if (REQUIRE_HINT.test(line)) reqs.push(line);
    }
  }

  const counted: JDKeyword[] = [];
  for (const word of SKILL_DICT) {
    const n = text.split(word).length - 1;
    if (n > 0) counted.push({ k: word, n });
  }

  // 再补一轮"熟悉/掌握 + 词"，抓词典没覆盖的写法
  for (const matched of text.matchAll(SKILL_VERB_PATTERN)) {
    const parts = matched[1].split(/[、/，,]/).map((part) => part.trim());
    for (const part of parts) {
      if (part.length < 2 || part.length > 10) continue;
      if (!counted.some((item) => item.k === part)) counted.push({ k: part, n: 1 });
    }
  }

  counted.sort((left, right) => right.n - left.n);
  const keywords = counted.slice(0, 18).map((item) => item.k);
  const hard = keywords.filter((word) => HARD_HINT.test(word));
  const preferred = (text.match(/[^。\n]*(?:优先|加分|best|plus)[^。\n]*/gi) ?? []).slice(0, 5);

  const hits: { k: string; ev: string }[] = [];
  const partial: { k: string }[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    const direct = skills.some(
      (skill) => skill === keyword || skill.includes(keyword) || keyword.includes(skill),
    );

    if (direct) {
      hits.push({ k: keyword, ev: findEvidence(resumeText, keyword) || "技能库已含" });
      continue;
    }

    const near = SKILL_DICT.some(
      (word) =>
        (word.includes(keyword) || keyword.includes(word)) &&
        skills.some((skill) => skill.includes(word) || word.includes(skill)),
    );

    if (near) partial.push({ k: keyword });
    else missing.push(keyword);
  }

  const score = keywords.length
    ? Math.round(
        Math.min(1, hits.length / Math.max(6, keywords.length * 0.55) + partial.length * 0.04) * 100,
      )
    : 0;

  return {
    keywords,
    duties: unique(duties).slice(0, 8),
    reqs: unique(reqs).slice(0, 10),
    hard: unique(hard),
    preferred,
    info: extractJDInfo(text),
    match: { score, hits, partial, missing },
  };
}

/** 招聘贴里能直接抄下来用的投递信息。 */
export type JDInfo = {
  company: string;
  title: string;
  city: string;
  email: string;
  /** 简历命名格式，例如 姓名_学校_毕业年份_可工作时长_最快到岗时间。 */
  namingFormat: string;
};

/**
 * 按【职位描述】【职位要求】把 JD 切成两段，每段里一条一条列出来。
 *
 * 找不到分区标题时返回空数组，由调用方退回逐行猜的老办法。
 */
export function splitJDSections(raw: string): { duties: string[]; reqs: string[] } {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const duties: string[] = [];
  const reqs: string[] = [];
  let current: "duty" | "req" | null = null;

  for (const line of lines) {
    // 去掉行首的方括号再找分区标题，兼容【职位描述】和 职位描述 两种写法
    const stripped = line.replace(/^[【\[]|[】\]]$/g, "").trim();
    const marker = JD_SECTION_MARKERS.find((item) => item.pattern.test(stripped));

    if (marker) {
      current = marker.kind;
      // 标题和第一条挤在一行时，把后面的内容也收进来
      const rest = stripped.replace(marker.pattern, "").replace(/^[】\]\s:：]+/, "").trim();
      if (rest.length >= 4) {
        (current === "duty" ? duties : reqs).push(rest.replace(JD_ITEM_PREFIX, "").trim());
      }
      continue;
    }

    if (!current) continue;

    const item = line.replace(JD_ITEM_PREFIX, "").trim();
    if (item.length < 4) continue;

    (current === "duty" ? duties : reqs).push(item);
  }

  return { duties, reqs };
}

/**
 * 从 JD 原文里抽投递信息。
 *
 * 招聘贴的标题行常写成【公司_岗位_城市】，命名格式也放在【】里，
 * 所以先扫所有方括号块，再找邮箱，最后用公司名后缀和岗位名后缀兜底。
 */
export function extractJDInfo(raw: string): JDInfo {
  const blocks = [...raw.matchAll(BRACKET_BLOCK)].map((matched) => matched[1].trim());

  // 标题行取第一个方括号块，按常见分隔符拆成公司、岗位、城市
  const headerParts = (blocks[0] ?? "")
    .split(/[_｜|/·]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  let company = headerParts[0] ?? "";
  let title = headerParts.find((part) => /实习|分析|研究|经理|管培|工程|顾问|运营|产品/.test(part)) ?? "";
  let city = "";

  // 城市可能写在"需base杭州"这类片段里
  const basePart = headerParts.find((part) => /base|城市|地点/i.test(part)) ?? "";
  const cityMatch = /(?:base|城市|地点)[\s:：]*([一-龥]{2,6})/i.exec(basePart);
  if (cityMatch) city = cityMatch[1];

  // 命名格式：方括号块里含"姓名""学校"这类词的那一个
  const namingFormat = blocks.find((block) => NAMING_HINT.test(block) && /[_｜|/·]/.test(block)) ?? "";

  // 兜底：从正文里找公司名和岗位名
  if (!company) {
    company =
      raw.match(/([一-龥A-Za-z]{2,20}(?:有限公司|股份有限公司|集团|银行|证券|基金|事务所))/)?.[1]?.trim() ??
      "";
  }
  if (!title) {
    title =
      raw.match(/([一-龥A-Za-z]{2,16}(?:实习生|分析师|研究员|经理|管培生|工程师|顾问))/)?.[1]?.trim() ?? "";
  }
  if (!city) {
    city = raw.match(/(?:base|工作地点|城市)[\s:：]*([一-龥]{2,6})/i)?.[1]?.trim() ?? "";
  }

  // 命名格式里可能还带着岗位名，例如"姓名_学校_岗位"，去掉后缀噪音
  const email = EMAIL_PATTERN.exec(raw)?.[0] ?? "";

  return { company, title, city, email, namingFormat };
}

/** 兼容旧调用：只取公司名和岗位名。 */
export function guessJDTitle(raw: string): { company: string; title: string } {
  const info = extractJDInfo(raw);
  if (info.company || info.title) return { company: info.company, title: info.title };

  const firstLine = (raw.split(/\n+/)[0] ?? "").trim();
  return { company: firstLine.length <= 20 ? firstLine : "", title: "" };
}
