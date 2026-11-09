import type { ResumeData } from "@/types/analysis";

type EvidenceSource = "education" | "experiences" | "projects" | "skills" | "strengths" | "other";

type DirectionRule = {
  label: string;
  keywords: string[];
  sources: EvidenceSource[];
  weight: number;
};

export type Direction = {
  id: string;
  name: string;
  rules: DirectionRule[];
  gap: string[];
  act: string;
};

export type DirectionCandidate = Record<EvidenceSource, string[]>;

export type DirectionEvidence = {
  label: string;
  source: string;
  excerpt: string;
  score: number;
};

export type DirectionMatch = {
  direction: Direction;
  score: number;
  evidence: DirectionEvidence[];
  missing: string[];
  evidenceSources: number;
};

const SOURCE_LABELS: Record<EvidenceSource, string> = {
  education: "教育背景",
  experiences: "实习/工作",
  projects: "项目/论文",
  skills: "技能",
  strengths: "个人优势",
  other: "简历原文",
};

const rule = (
  label: string,
  weight: number,
  sources: EvidenceSource[],
  keywords: string[],
): DirectionRule => ({ label, weight, sources, keywords });

/**
 * 每个方向都按多类证据加权，而不是把简历当作一袋技能关键词。
 * 高权重留给直接经历和专业背景；Excel、沟通等通用能力只占较小比例。
 */
export const DIRECTIONS: Direction[] = [
  {
    id: "ibd",
    name: "投资银行 IBD",
    rules: [
      rule("投行或资本市场经历", 35, ["experiences", "projects", "other"], ["投行", "投资银行", "ipo", "招股", "保荐", "债券承销", "资本市场部"]),
      rule("交易与尽调经验", 20, ["experiences", "projects", "other"], ["并购", "重组", "尽职调查", "尽调", "交易结构", "融资"]),
      rule("估值与财务建模", 20, ["experiences", "projects", "skills", "other"], ["估值", "dcf", "财务模型", "可比公司", "现金流折现"]),
      rule("财会金融教育基础", 15, ["education"], ["会计", "财务", "金融", "经济", "审计"]),
      rule("金融数据工具", 10, ["skills", "experiences", "projects"], ["wind", "excel", "同花顺", "choice"]),
    ],
    gap: ["财务模型 / DCF 建模", "招股书与尽调报告阅读", "交易流程理解", "投行实习经历"],
    act: "优先呈现估值、尽调和资本市场证据；若缺少直接交易经历，可先补建模案例或券商相关实习。",
  },
  {
    id: "er",
    name: "行业研究 / 券商行研",
    rules: [
      rule("行业研究直接经历", 35, ["experiences", "projects", "other"], ["行业研究", "行研", "深度报告", "研究报告", "行业跟踪", "产业研究"]),
      rule("调研与信息验证", 15, ["experiences", "projects", "strengths", "other"], ["调研", "访谈", "专家访谈", "交叉验证", "案头研究", "桌面研究"]),
      rule("财务分析与预测", 20, ["experiences", "projects", "skills", "other"], ["财务分析", "盈利预测", "财务模型", "估值", "基本面"]),
      rule("研究型教育背景", 15, ["education"], ["金融", "经济", "会计", "统计", "管理", "产业经济"]),
      rule("数据与报告工具", 15, ["skills", "experiences", "projects"], ["wind", "excel", "ppt", "数据分析", "python", "写作"]),
    ],
    gap: ["独立深度报告", "行业数据搜集与交叉验证", "盈利预测模型", "观点表达与路演"],
    act: "选择熟悉行业完成一篇可展示的深度报告，并准备行业观点、数据来源和盈利预测逻辑。",
  },
  {
    id: "pevc",
    name: "PE / VC 股权投资",
    rules: [
      rule("股权投资直接经历", 35, ["experiences", "projects", "other"], ["pe", "vc", "股权投资", "一级市场", "私募股权", "风险投资", "投资部"]),
      rule("项目筛选与行业判断", 20, ["experiences", "projects", "other"], ["项目筛选", "项目挖掘", "sourcing", "行业分析", "行业mapping", "商业模式"]),
      rule("尽调与交易分析", 20, ["experiences", "projects", "other"], ["尽职调查", "尽调", "估值", "财务模型", "商业计划书", "bp"]),
      rule("商科与金融基础", 15, ["education"], ["金融", "会计", "经济", "财务", "管理"]),
      rule("分析与表达工具", 10, ["skills", "strengths", "experiences"], ["excel", "ppt", "wind", "沟通", "访谈"]),
    ],
    gap: ["项目 sourcing 经验", "商业判断案例", "尽调全流程", "交易条款理解"],
    act: "把行业分析、尽调和商业判断整理成可讲述案例；优先补充真实项目来源与投资结论。",
  },
  {
    id: "am",
    name: "投研 / 资管 / 基金",
    rules: [
      rule("买方投研直接经历", 35, ["experiences", "projects", "other"], ["投研", "资产管理", "资管", "基金", "买方研究", "组合管理"]),
      rule("基本面与投资分析", 20, ["experiences", "projects", "other"], ["基本面", "股票研究", "证券研究", "财务分析", "估值", "投资逻辑"]),
      rule("资产配置与市场理解", 15, ["experiences", "projects", "other"], ["资产配置", "行业配置", "宏观经济", "固收", "债券", "证券"]),
      rule("金融与数量基础", 15, ["education"], ["金融", "经济", "会计", "统计", "数学"]),
      rule("投研数据工具", 15, ["skills", "projects", "experiences"], ["wind", "python", "excel", "量化", "回测"]),
    ],
    gap: ["清晰的投资框架", "模拟组合与复盘", "宏观指标跟踪", "可验证的研究结论"],
    act: "建立模拟组合并持续复盘；准备一项资产或一家公司从观点、证据到风险的完整推荐逻辑。",
  },
  {
    id: "bank",
    name: "银行管培 / 金融机构",
    rules: [
      rule("银行或金融机构经历", 35, ["experiences", "projects", "other"], ["银行", "分行", "支行", "金融机构", "信贷", "金融市场部"]),
      rule("客户与业务能力", 20, ["experiences", "strengths", "other"], ["客户", "营销", "业务拓展", "客户关系", "对公", "零售业务"]),
      rule("风险与合规意识", 15, ["experiences", "projects", "other"], ["风险管理", "风控", "合规", "授信", "反洗钱", "内控"]),
      rule("金融财会教育背景", 20, ["education"], ["金融", "经济", "会计", "财务", "管理"]),
      rule("沟通协作与执行", 10, ["strengths", "skills", "experiences"], ["沟通", "协作", "抗压", "组织", "写作", "excel"]),
    ],
    gap: ["银行业务理解", "客户沟通案例", "风险与合规知识", "银行业直接经历"],
    act: "结合客户、业务和协作案例准备行为面；补足目标银行业务线及产品知识。",
  },
  {
    id: "consult",
    name: "战略 / 管理咨询",
    rules: [
      rule("战略或咨询直接经历", 40, ["experiences", "projects", "other"], ["战略部", "战略规划", "战略咨询", "管理咨询", "咨询顾问", "企业战略", "咨询"]),
      rule("专业服务经历", 15, ["experiences", "other"], ["会计师事务所", "事务所", "四大", "审计所", "德勤", "普华永道", "安永", "毕马威"]),
      rule("商业研究与问题分析", 15, ["experiences", "projects", "strengths", "other"], ["商业分析", "行业分析", "市场分析", "案头研究", "桌面研究", "调研", "访谈", "问题拆解"]),
      rule("商科与分析教育基础", 15, ["education"], ["会计", "财务", "金融", "经济", "管理", "统计", "商业分析"]),
      rule("结构化表达与沟通", 10, ["skills", "strengths", "experiences", "projects"], ["ppt", "汇报", "沟通", "访谈", "写作", "结构化", "逻辑"]),
      rule("数据处理工具", 5, ["skills", "experiences", "projects"], ["excel", "python", "sql", "数据分析"]),
    ],
    gap: ["Case Interview 训练", "结构化框架", "咨询式 PPT 输出", "英文 case"],
    act: "突出战略部、专业服务和商业分析经历；用“问题—分析—建议—结果”重写项目，并系统训练 case interview。",
  },
  {
    id: "audit",
    name: "审计 / 财务 / 事务所",
    rules: [
      rule("事务所或财务直接经历", 35, ["experiences", "other"], ["会计师事务所", "事务所", "审计实习", "财务实习", "四大", "德勤", "普华永道", "安永", "毕马威"]),
      rule("会计审计专业背景", 25, ["education"], ["会计", "审计", "财务管理", "财务", "税务"]),
      rule("财务与审计实务", 20, ["experiences", "projects", "skills", "other"], ["审计", "财务报表", "底稿", "函证", "内部控制", "税务", "账务", "凭证"]),
      rule("专业资格进展", 15, ["skills", "strengths", "other"], ["cpa", "acca", "初级会计", "中级会计", "注册会计师"]),
      rule("办公与数据工具", 5, ["skills", "experiences"], ["excel", "透视表", "vlookup"]),
    ],
    gap: ["CPA / ACCA 科目进展", "底稿与函证流程", "报表科目分析", "事务所项目经历"],
    act: "优先呈现事务所、会计教育和审计实务证据；补充可核验的底稿、函证或报表分析案例。",
  },
  {
    id: "fintech",
    name: "金融科技 / 量化 / 数据",
    rules: [
      rule("量化或金融科技经历", 35, ["experiences", "projects", "other"], ["量化", "金融科技", "金工", "因子研究", "策略研究", "回测"]),
      rule("编程与数据工程", 25, ["skills", "projects", "experiences"], ["python", "sql", "java", "c++", "数据处理", "数据工程"]),
      rule("模型与算法项目", 20, ["projects", "experiences", "skills"], ["机器学习", "深度学习", "nlp", "算法", "数据挖掘", "预测模型"]),
      rule("数量教育背景", 15, ["education"], ["统计", "数学", "计算机", "数据科学", "金融工程", "计量"]),
      rule("金融数据工具", 5, ["skills", "projects", "experiences"], ["wind", "同花顺", "choice", "excel"]),
    ],
    gap: ["可运行的策略或模型", "SQL 与工程化能力", "因子研究与回测", "代码与统计面试"],
    act: "完成一个可运行、可复现的量化或数据项目，并准备解释数据、方法、结果和局限。",
  },
];

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function resumeSources(resume: ResumeData): DirectionCandidate {
  return {
    education: resume.education.map((item) => clean([
      item.school, item.college, item.major, item.performance,
    ].filter(Boolean).join(" "))),
    experiences: resume.experiences.map((item) => clean([
      item.title, item.role, ...item.bullets,
    ].filter(Boolean).join(" "))),
    projects: resume.projects.map((item) => clean([
      item.title, item.role, ...item.bullets,
    ].filter(Boolean).join(" "))),
    skills: resume.skills.map(clean),
    strengths: resume.strengths.map(clean),
    other: resume.honors.map(clean),
  };
}

export function buildDirectionCandidate(input: {
  profile: {
    school?: string;
    major?: string;
    degree?: string;
    education?: string;
    skills?: string[];
    strengths?: string[];
    rawResume?: string;
  };
  resumes: ResumeData[];
}): DirectionCandidate {
  // 画像里已经有学历摘要时就用它，别再拼一遍学历/学校/专业，
  // 否则同一段教育会在证据里出现两遍（"硕士 海川大学 金融学 硕士 海川大学 金融学"）。
  const educationSummary = clean(
    input.profile.education?.trim()
      ? input.profile.education
      : [input.profile.degree, input.profile.school, input.profile.major].filter(Boolean).join(" "),
  );

  const candidate: DirectionCandidate = {
    education: [educationSummary],
    experiences: [],
    projects: [],
    skills: (input.profile.skills ?? []).map(clean),
    strengths: (input.profile.strengths ?? []).map(clean),
    other: input.profile.rawResume ? [clean(input.profile.rawResume)] : [],
  };

  for (const resume of input.resumes) {
    const sources = resumeSources(resume);
    (Object.keys(candidate) as EvidenceSource[]).forEach((source) => {
      candidate[source].push(...sources[source]);
    });
  }

  (Object.keys(candidate) as EvidenceSource[]).forEach((source) => {
    candidate[source] = [...new Set(candidate[source].filter(Boolean))];
  });
  return candidate;
}

/**
 * 从 JD 原文猜它属于哪个求职方向。
 *
 * 拿八个方向各自规则里的关键词去数命中次数，按权重加权；分不够高就返回 null，
 * 交给用户自己选——宁可留空，也不要猜错方向把简历配错。
 */
export function guessDirectionFromJD(text: string): { id: string; name: string } | null {
  const lower = text.toLowerCase();
  let best: { id: string; name: string; score: number } | null = null;

  for (const direction of DIRECTIONS) {
    let score = 0;
    for (const rule of direction.rules) {
      for (const keyword of rule.keywords) {
        const key = keyword.toLowerCase();
        if (!key) continue;
        const hits = lower.split(key).length - 1;
        if (hits > 0) score += hits * rule.weight;
      }
    }
    if (!best || score > best.score) best = { id: direction.id, name: direction.name, score };
  }

  // 分数太低说明这份 JD 和八个方向都不像，别硬猜。
  return best && best.score >= 20 ? { id: best.id, name: best.name } : null;
}

/** 页面共用的简历候选：已保存版本 + 当前草稿，合并去重后的一份数据。 */
export type CandidateSource = "direction" | "default" | "latest" | "merged" | "profile";

export type ResumeCandidate = {
  candidate: DirectionCandidate;
  skills: string[];
  rawResume: string;
  /** 草稿里的内容还没有对应的已保存版本时为 true。 */
  hasUnsavedDraft: boolean;
  isEmpty: boolean;
  /** 这份候选是按什么规则挑出来的，界面据此说明分数口径。 */
  source: CandidateSource;
  /** 实际参与算分的简历版本名，用于界面上写清「用的是哪一份」。 */
  sourceName: string;
};

/**
 * 把已保存的简历版本和当前解析草稿合成同一份候选。
 *
 * 同一份简历既存过版本、又还留在草稿里时按内容去重，避免同一段证据被算两遍，
 * 让方向分析和岗位匹配看到的是同一份数据。
 */
export function buildResumeCandidate(input: {
  profile: {
    school?: string;
    major?: string;
    degree?: string;
    education?: string;
    skills?: string[];
    strengths?: string[];
    rawResume?: string;
  };
  resumeVariants: {
    name?: string;
    sourceText?: string;
    directionId?: string;
    isDefault?: boolean;
    updatedAt?: string;
    structuredData?: ResumeData;
  }[];
  resumeDraft: { resume?: ResumeData | null; text?: string };
  /** 指定方向时只统计该方向的版本；草稿没有方向，这时不参与。 */
  directionId?: string;
}): ResumeCandidate {
  const variants = input.resumeVariants;
  let pool = variants;
  let source: CandidateSource = "merged";

  if (input.directionId) {
    const byDirection = variants.filter((item) => item.directionId === input.directionId);
    if (byDirection.length > 0) {
      pool = byDirection;
      source = "direction";
    } else {
      // 该方向还没建简历时的兜底顺序：默认版本 → 最近更新的那份 → 全部合并。
      // 不去随机挑，挑出来的分数学员解释不了。
      const usable = variants
        .filter((item) => item.structuredData)
        .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
      const fallback = usable.find((item) => item.isDefault) ?? usable[0];
      if (fallback) {
        pool = [fallback];
        source = "default";
      }
    }
  }

  const useDraft = source === "merged";
  const seen = new Set<string>();
  const resumes: ResumeData[] = [];

  for (const item of pool) {
    if (!item.structuredData) continue;
    const signature = JSON.stringify(item.structuredData);
    if (seen.has(signature)) continue;
    seen.add(signature);
    resumes.push(item.structuredData);
  }

  const draftResume = useDraft ? (input.resumeDraft.resume ?? null) : null;
  if (draftResume) {
    const signature = JSON.stringify(draftResume);
    if (!seen.has(signature)) {
      seen.add(signature);
      resumes.push(draftResume);
    }
  }

  const candidate = buildDirectionCandidate({ profile: input.profile, resumes });

  const draftText = useDraft ? (input.resumeDraft.text ?? "").trim() : "";
  const savedTexts = new Set(
    pool.map((item) => (item.sourceText ?? "").trim()).filter(Boolean),
  );
  const hasUnsavedDraft = draftText.length > 0 && !savedTexts.has(draftText);

  // 原文以草稿为准，草稿为空时才退回画像里保存过的那份。
  const rawResume = draftText || (input.profile.rawResume ?? "").trim();

  // 画像里的学历字段有默认值（本科），单独一条学历说明不了任何问题，
  // 不能因为它就把空工作区当成"有简历"。
  const educationOnlyDegree =
    candidate.education.length === 1 && candidate.education[0] === clean(input.profile.degree ?? "");

  const isEmpty = (Object.keys(candidate) as EvidenceSource[]).every((source) =>
    source === "education"
      ? candidate[source].length === 0 || educationOnlyDegree
      : candidate[source].length === 0,
  );

  return {
    candidate,
    skills: candidate.skills,
    rawResume,
    hasUnsavedDraft,
    isEmpty,
    source,
    sourceName: pool.length === 1 ? (pool[0].name ?? "") : "",
  };
}

function evidenceExcerpt(text: string, keyword: string) {
  const compact = clean(text);
  const index = compact.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0 || compact.length <= 72) return compact;
  const start = Math.max(0, index - 24);
  const end = Math.min(compact.length, index + keyword.length + 38);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;
}

function includesKeyword(text: string, keyword: string) {
  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  if (!/^[a-z0-9]+$/.test(normalizedKeyword)) return normalizedText.includes(normalizedKeyword);
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalizedText);
}

function findRuleEvidence(candidate: DirectionCandidate, item: DirectionRule): DirectionEvidence | null {
  for (const source of item.sources) {
    for (const text of candidate[source]) {
      const keyword = item.keywords.find((word) => includesKeyword(text, word));
      if (keyword) {
        return {
          label: item.label,
          source: SOURCE_LABELS[source],
          excerpt: evidenceExcerpt(text, keyword),
          score: item.weight,
        };
      }
    }
  }
  return null;
}

/**
 * 使用教育、实习、项目、技能和优势等完整证据评分。
 * 每条规则最多计分一次，避免同一关键词在多个简历版本中重复刷分。
 */
export function matchDirections(candidate: DirectionCandidate): DirectionMatch[] {
  return DIRECTIONS.map((direction) => {
    const evidence = direction.rules
      .map((item) => findRuleEvidence(candidate, item))
      .filter((item): item is DirectionEvidence => item !== null);
    const matchedLabels = new Set(evidence.map((item) => item.label));
    const evidenceSources = new Set(evidence.map((item) => item.source)).size;

    return {
      direction,
      score: Math.min(100, evidence.reduce((sum, item) => sum + item.score, 0)),
      evidence,
      missing: direction.rules
        .filter((item) => !matchedLabels.has(item.label))
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 3)
        .map((item) => item.label),
      evidenceSources,
    };
  }).sort((left, right) => right.score - left.score || right.evidenceSources - left.evidenceSources);
}
