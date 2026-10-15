/**
 * 简历语言风格库。
 *
 * 6 种风格，每种描述的是「这条经历该怎么读」，不是「该写什么」——
 * 事实永远来自简历原文，风格只决定信息的摆放顺序、强调什么、用哪类动词。
 *
 * 关于 avoid：里面放的是**空话和模糊修饰词**，不是事实动词。
 * 「参与 / 协助 / 负责」这类词描述的是事实等级，绝不能因为风格而改掉，
 * 那是另一条独立规则（职责等级不许升级），由 styleValidation.ts 单独管。
 */

export type LanguageStyleId =
  | "concise"
  | "quantified"
  | "professional"
  | "analytical"
  | "outcome"
  | "collaborative";

export type LanguageStyle = {
  id: LanguageStyleId;
  name: string;
  /** 一句话定位：适合什么岗位、想让 HR 先看到什么。 */
  positioning: string;
  description: string;
  /** 这段经历按这条风格写出来，整体该有的骨架，按顺序摆。 */
  structure: string[];
  /** 信息摆放顺序。 */
  informationOrder: string[];
  /** 要强调什么。 */
  emphasis: string[];
  /** 句式提示。 */
  sentencePatterns: string[];
  /** 这类风格偏好的动词。 */
  verbs: string[];
  /**
   * 简历原文里出现这类事实时，优先挑出来写进要点。
   *
   * 这张表是「挑」的依据，不是「补」的依据——原文里没有的，照这张表也不许写。
   * 之所以要有它：模型不是不会写具体，是不知道在有限字数里该优先保留哪类信息。
   */
  factPriority: string[];
  /** 尽量避开的空话、模糊词。不包含描述事实等级的动词。 */
  avoid: string[];
  /** 为什么避开这些词。给模型讲清原因，比让它背一张清单管用。 */
  avoidNote: string;
  /** 默认字数上限。用户选了长度就以用户的为准。 */
  maxLength: number;
};

export const LANGUAGE_STYLES: LanguageStyle[] = [
  {
    id: "concise",
    name: "简洁直接",
    positioning: "适合流程清晰、职责明确的岗位，例如运营、财务、行政、审计助理。让 HR 十秒看完一段还有印象。",
    description: "动作、对象、结果，短句，一句话说清一件事。删掉铺垫、评价和过渡句。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点一句话，动词开头，讲清一个动作和一个对象。",
      "不写过渡句，也不写「通过……提升了……」这类收尾评价。",
      "要点条数不要少于原文。原文已有的要点都要保留，不要为了简短而合并或删掉。",
    ],
    informationOrder: ["动作", "对象", "结果"],
    emphasis: ["动词开头", "一句话只讲一件事", "删掉修饰和铺垫"],
    sentencePatterns: ["动宾短语直接开头", "用逗号断句，不用长定语"],
    verbs: ["整理", "搭建", "核对", "测算", "撰写", "汇总", "拆解"],
    factPriority: ["具体动作和它作用的对象", "做这件事的频次或周期", "交付出来的东西，例如表格、报告、底稿"],
    avoid: ["进行了", "从事了", "相关的", "各类", "若干", "等等"],
    avoidNote: "这些词只交代做过哪一类事，不交代具体做了什么，占着字数却不给信息。",
    maxLength: 45,
  },
  {
    id: "quantified",
    name: "数据量化",
    positioning: "适合结果可衡量的岗位，例如数据分析、投研、运营、销售支持。让 HR 先看到做到了多少。",
    description: "优先展示原文已有的数量、比例、金额和效率。原文里确实没有数字时，改写成范围，绝不编。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点都尽量挂上一个原文里真实存在的数字。",
      "原文确实没有数字的，在末尾另起一行写【待补：…】交给用户补，不要自己填。",
      "要点条数不要少于原文。原文已有的要点都要保留，数字在原文里出现过就照原文写。",
    ],
    informationOrder: ["动作", "对象", "数量或比例或金额", "变化幅度"],
    emphasis: ["把原文已有的数字往前提", "用比例和金额代替形容词", "写清覆盖范围"],
    sentencePatterns: ["动词 + 对象 + 具体数字", "原文没有数字时，改成描述范围而不是编一个数"],
    verbs: ["测算", "统计", "覆盖", "归集", "对比", "核算"],
    factPriority: ["条数、样本量、覆盖范围", "占比、增长率、变化幅度", "金额和规模", "时长和频次", "效率或耗时的前后变化"],
    avoid: ["大量", "很多", "显著", "大幅", "众多", "成倍"],
    avoidNote: "这些词是数字的替身，但读者换算不出实际量级。原文里有数字就直接写数字。",
    maxLength: 65,
  },
  {
    id: "professional",
    name: "严谨专业",
    positioning: "适合流程规范、责任边界清楚的岗位，例如审计、风控、合规、财务、银行。让 HR 看到你做事有依据、可复核。",
    description: "强调依据、口径、规范和风险，用词克制，不夸大自己的作用。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点交代清「按什么做、怎么做、做完交付了什么」。",
      "结论只写原文里已经有的判断，不替用户推演新结论。",
      "要点条数不要少于原文。原文已有的要点都要保留，用词统一，前后口径不要打架。",
    ],
    informationOrder: ["依据", "动作", "对象", "结论"],
    emphasis: ["说明依据和口径", "用词准确，不用口语", "点出规范意识与风险意识"],
    sentencePatterns: ["依据 X，完成 Y", "按 Z 口径核算并复核"],
    verbs: ["依据", "核算", "复核", "校验", "归档", "追溯", "比对"],
    factPriority: ["依据的来源，例如制度、准则、口径、底稿", "核对和复核的动作", "交付的文档或档案", "发现的差异或问题"],
    avoid: ["大概", "差不多", "基本上", "应该是", "可能吧"],
    avoidNote: "这些词把「做过」变成「好像是」，在强调规范和风险的岗位上直接减分。",
    maxLength: 65,
  },
  {
    id: "analytical",
    name: "研究分析",
    positioning: "适合研究、策略、投研类岗位。让 HR 看到你有分析路径，不只是执行。",
    description: "对象、数据、方法、结论，把怎么想出来的写出来，而不是只写做了什么。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点至少交代「用什么数据、用什么方法」。",
      "结论只写原文里已有的判断。原文只写了过程没写结论，就停在过程。",
      "要点条数不要少于原文。原文已有的要点都要保留，条目之间按分析路径排先后。",
    ],
    informationOrder: ["研究对象", "数据来源", "分析方法", "结论"],
    emphasis: ["交代数据来源", "写清方法", "给出结论而不是只写动作"],
    sentencePatterns: ["针对 X，用 Y 方法，得出 Z 结论", "基于 X 数据，通过 Y 分析"],
    verbs: ["分析", "比较", "检验", "归因", "建模", "推演", "论证"],
    factPriority: ["数据来源和样本范围", "使用的方法或模型", "分组和对比的维度", "得出的结论或判断"],
    avoid: ["感觉", "个人认为", "应该是", "反正"],
    avoidNote: "研究岗位看的就是判断有没有依据，这些词等于自己声明没有依据。",
    maxLength: 90,
  },
  {
    id: "outcome",
    name: "成果导向",
    positioning: "适合按交付和目标考核的岗位，例如咨询、产品、市场、项目管理。让 HR 先看到产出。",
    description: "结果、动作、方法，把交付了什么、影响到谁放在最前面。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点先说交付物，再说用什么方法做的。",
      "产出必须来自原文。原文没写产出，就不要补一个出来。",
      "要点条数不要少于原文。原文已有的要点都要保留，把交付物最明确的那条放最前面。",
    ],
    informationOrder: ["结果或产出物", "动作", "方法"],
    emphasis: ["结果前置", "写清交付了什么", "说明影响到谁"],
    sentencePatterns: ["产出 X，通过 Y 方法完成", "形成 X，用于 Y"],
    verbs: ["产出", "交付", "形成", "输出", "落地", "支撑"],
    factPriority: ["交付物，例如报告、模型、方案、系统", "被谁使用、用在哪个环节", "达成的目标或通过的评审", "被持续使用的时长"],
    avoid: ["各种", "一些", "有关的", "努力", "争取"],
    avoidNote: "这些词把成果说得很虚，努力过不等于有产出，读者抓不到东西。",
    maxLength: 65,
  },
  {
    id: "collaborative",
    name: "协作沟通",
    positioning: "适合需要跨部门推进的岗位，例如项目管理、客户对接、运营和职能岗。让 HR 看清你在协作里的位置。",
    description: "协作对象、个人分工、团队成果，团队成果标明是共同的，不记成个人成绩。",
    structure: [
      "表头那一行：起止时间、机构、职位原样保留，一律不要改写。",
      "每条要点写清和谁协作、自己负责哪一段。",
      "团队共同拿到的成果，必须写明是共同完成，不能写成个人成绩。",
      "要点条数不要少于原文。原文已有的要点都要保留，不要为了显得独立而删掉协作对象。",
    ],
    informationOrder: ["协作对象", "个人分工", "团队共同成果"],
    emphasis: ["写清与谁协作", "明确哪部分是自己做的", "团队成果标明是共同的"],
    sentencePatterns: ["与 X 协作，负责 Y，共同完成 Z", "对接 X，完成 Y"],
    verbs: ["对接", "协调", "配合", "同步", "推进", "联动"],
    factPriority: ["协作的对象和部门", "自己在其中的具体分工", "对齐口径、同步进度这类动作", "团队共同达成的结果"],
    avoid: ["包揽", "全部由本人", "力排众议"],
    avoidNote: "这类说法把团队成果记成个人成绩，面试一问就露。真正加分的是写清你负责的那一段。",
    maxLength: 65,
  },
];

export const EXPRESSION_STRENGTHS = [
  { id: "restrained", name: "克制", hint: "陈述事实，不加评价词，语气平稳。" },
  { id: "moderate", name: "适中", hint: "适度体现自己的作用，但不夸大。" },
  { id: "strong", name: "有力", hint: "用更明确的动词突出作用，仍不超出事实。" },
] as const;

export type ExpressionStrength = (typeof EXPRESSION_STRENGTHS)[number]["id"];

export const LENGTH_OPTIONS = [
  { value: 45, name: "精简 45 字" },
  { value: 65, name: "标准 65 字" },
  { value: 90, name: "详细 90 字" },
] as const;

export function getStyle(id: LanguageStyleId): LanguageStyle {
  const found = LANGUAGE_STYLES.find((item) => item.id === id);
  if (!found) throw new Error(`没有这种风格：${id}`);
  return found;
}

/** 用户在界面上选的原始设置。id 用字符串存，因为下拉框可以还没选。 */
export type StyleSettings = {
  /** 主风格，必选；空字符串表示还没选。 */
  primaryId: string;
  /** 辅风格，可选；空字符串表示不启用。 */
  secondaryId: string;
  strength: ExpressionStrength;
  maxLength: number;
  preferNumbers: boolean;
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  primaryId: "",
  secondaryId: "",
  strength: "moderate",
  maxLength: 65,
  preferNumbers: false,
};

/** 把界面设置转成合并函数的输入；主风格没选或非法时返回 null。 */
export function settingsToResolveInput(settings: StyleSettings): ResolveStyleInput | null {
  if (!LANGUAGE_STYLES.some((item) => item.id === settings.primaryId)) return null;

  const secondary = LANGUAGE_STYLES.some((item) => item.id === settings.secondaryId)
    ? (settings.secondaryId as LanguageStyleId)
    : null;

  return {
    primaryStyleId: settings.primaryId as LanguageStyleId,
    secondaryStyleId: secondary === settings.primaryId ? null : secondary,
    expressionStrength: settings.strength,
    maxLength: settings.maxLength,
    preferNumbers: settings.preferNumbers,
  };
}

/** 主辅风格合并后的结果，喂给 Prompt 的最终形态。 */
export type MergedStyle = {
  primary: LanguageStyle;
  secondary: LanguageStyle | null;
  expressionStrength: ExpressionStrength;
  maxLength: number;
  preferNumbers: boolean;
  /** 主风格和辅风格要避开的词，合并去重。 */
  avoid: string[];
  /** 辅风格额外补充的强调点，最多两个。 */
  extraEmphasis: string[];
  /** 用户设置覆盖了默认值的地方，界面上可以提示一句。 */
  overridden: string[];
};

export type ResolveStyleInput = {
  primaryStyleId: LanguageStyleId;
  /** 辅风格，可以不填。与主风格相同时会被忽略。 */
  secondaryStyleId?: LanguageStyleId | null;
  expressionStrength?: ExpressionStrength;
  maxLength?: number;
  preferNumbers?: boolean;
};

/**
 * 合并主辅风格。
 *
 * 优先级：事实安全 > 用户设置 > 主风格 > 辅风格。
 * 这一条体现在：
 * - 事实安全的规则不在这里，由 Prompt 和 styleValidation 管，任何风格都越不过它；
 * - 用户显式设置（力度、长度、量化开关）覆盖风格自带的默认值；
 * - 结构、句式、默认长度取自主风格；
 * - 辅风格只补最多两个强调点，不改变结构。
 */
export function resolveStyle(input: ResolveStyleInput): MergedStyle {
  const primary = getStyle(input.primaryStyleId);

  // 辅风格与主风格相同时直接忽略，避免自己给自己补强调点。
  const secondary =
    input.secondaryStyleId && input.secondaryStyleId !== input.primaryStyleId
      ? getStyle(input.secondaryStyleId)
      : null;

  const overridden: string[] = [];

  let maxLength = primary.maxLength;
  if (input.maxLength !== undefined) {
    maxLength = input.maxLength;
    if (input.maxLength !== primary.maxLength) overridden.push("长度");
  }

  let expressionStrength: ExpressionStrength = "moderate";
  if (input.expressionStrength !== undefined) {
    expressionStrength = input.expressionStrength;
    overridden.push("表达力度");
  }

  const preferNumbers = input.preferNumbers ?? false;
  if (input.preferNumbers !== undefined) overridden.push("优先量化");

  return {
    primary,
    secondary,
    expressionStrength,
    maxLength,
    preferNumbers,
    avoid: [...new Set([...primary.avoid, ...(secondary?.avoid ?? [])])],
    extraEmphasis: secondary ? secondary.emphasis.slice(0, 2) : [],
    overridden,
  };
}

/** 选风格时的前置校验：主风格必选，辅风格不能跟主风格一样。 */
export function validateStyleSelection(
  primaryStyleId: string,
  secondaryStyleId: string,
): string {
  if (!primaryStyleId) return "请先选一个主风格。";
  if (!LANGUAGE_STYLES.some((item) => item.id === primaryStyleId)) return "主风格不是库里已有的选项。";
  if (secondaryStyleId && secondaryStyleId === primaryStyleId) {
    return "辅风格不能和主风格相同。";
  }
  if (secondaryStyleId && !LANGUAGE_STYLES.some((item) => item.id === secondaryStyleId)) {
    return "辅风格不是库里已有的选项。";
  }
  return "";
}

/**
 * 从 JD 里猜一个推荐风格。
 *
 * 纯本地关键词匹配，不调模型、不花钱、即时出结果。
 * 每个风格给一组信号词，命中越多分越高；返回命中的词，让用户看得见"为什么推荐这个"。
 * 这只是**推荐**，用户随时可以在下拉框里改掉。
 */
const STYLE_SIGNALS: { id: LanguageStyleId; words: string[] }[] = [
  {
    id: "quantified",
    words: ["量化", "数据", "指标", "同比", "环比", "增长", "效率", "降本", "成本", "测算", "统计", "KPI", "ROI", "转化率", "规模"],
  },
  {
    id: "analytical",
    words: ["研究", "分析", "结论", "报告", "调研", "课题", "论证", "归因", "模型", "洞察", "策略"],
  },
  {
    id: "professional",
    words: ["合规", "风险", "规范", "审计", "内控", "严谨", "准确", "尽职调查", "底稿", "监管", "审慎"],
  },
  {
    id: "collaborative",
    words: ["协作", "沟通", "团队", "跨部门", "对接", "协同", "配合", "联动", "共同"],
  },
  {
    id: "outcome",
    words: ["成果", "结果", "达成", "落地", "交付", "业绩", "产出", "闭环", "目标"],
  },
  {
    id: "concise",
    words: ["简洁", "直接", "高效", "快速", "简明", "清晰"],
  },
];

export type StyleRecommendation = {
  /** 得分最高的风格。没有任何信号词时是 null，不要硬推一个。 */
  id: LanguageStyleId | null;
  /** 命中的信号词，界面上展示给用户看，让推荐有据可查。 */
  matched: string[];
  /** 所有风格的得分，便于调试和展示。 */
  scores: { id: LanguageStyleId; score: number }[];
};

export function recommendStyle(jdText: string): StyleRecommendation {
  const text = (jdText ?? "").toLowerCase();

  const scores = STYLE_SIGNALS.map(({ id, words }) => ({
    id,
    score: words.filter((word) => text.includes(word.toLowerCase())).length,
  }));

  const best = scores.reduce((left, right) => (right.score > left.score ? right : left), scores[0]);

  // 一个信号词都没命中时不推荐任何风格——硬推一个等于误导用户，
  // 让人以为这份 JD 真的偏好那种写法。
  if (best.score === 0) {
    return { id: null, matched: [], scores };
  }

  const signals = STYLE_SIGNALS.find((item) => item.id === best.id);

  return {
    id: best.id,
    matched: (signals?.words ?? []).filter((word) => text.includes(word.toLowerCase())),
    scores,
  };
}
