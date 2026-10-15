/**
 * 事实校验，这是"事实安全"那一层的执行者，优先级高于任何风格设置——
 * 不管用户选了哪种风格、什么力度，只要编造了就拒。
 *
 * 只盯**非常具体的硬事实**，分成这么几类：
 * 1. 数字：改写里出现的数字必须在简历原文里找得到。
 * 2. 工具：Python、Power BI、Wind 这类软件和工具名，原文里没有就不许写。
 * 3. 奖项与证书：奖学金、竞赛名次、CPA/CFA 这类，原文里没有就不许写。
 * 4. 职责等级：原文写「参与 / 协助」，改写不得升级成「负责 / 主导」。
 * 5. 模型自报的补充内容：默认拒。新增经历（其他经历）例外，降级成提醒，见 judgeStyleResult。
 * 6. 事实编号：引用了不存在的事实编号。
 * 7. JD 关键词：事实不支持就不能用。工具和证书类照拒；能力词只提醒，见下面的分档说明。
 *
 * 硬事实之外的措辞、句式、信息顺序，随便改，不在这里管。
 *
 * 一条重要的分界线：**「不可能有第二种叫法」的东西才逐字比对**。
 * 工具名就是这种——真用过 Power BI，简历里一定写着这三个字，不存在换个说法。
 * 而「财务分析」这种能力描述不是：简历里写「建立财务指标对比表」，那就是财务分析，
 * 但字面上一个「财务分析」都找不到。这类词逐字比对只会天天误报，所以不拦，只提醒。
 *
 * 注意一个已知的漏网：中文数字（「三万」「翻了一番」）抓不到，只能抓阿拉伯数字。
 */

/** 一条从简历里抽出的事实。id 用于让模型回填 usedFactIds。 */
export type ResumeFact = {
  id: string;
  /** 事实原文，逐字来自简历。 */
  text: string;
  /** 所属板块，便于界面分组展示。 */
  section?: string;
};

/** 风格改写约定的返回结构。 */
export type StyleRewriteResult = {
  rewrittenText: string;
  usedFactIds: string[];
  usedKeywords: string[];
  warnings: string[];
  /** 模型自己承认的、事实里没有的补充。非空就整条拒掉。 */
  addedClaims: string[];
};

export type ValidationIssue = {
  kind: "number" | "tool" | "skill" | "credential" | "responsibility" | "claim" | "shape";
  /** 是否直接拒绝整条结果。false 的只当提醒。 */
  blocking: boolean;
  message: string;
  detail?: string[];
};

/** 比对前先把空白抹掉、大小写统一，免得「Power BI」和「PowerBI」被当成两个东西。 */
const squash = (text: string): string => text.replace(/\s+/g, "").toLowerCase();

/**
 * 工具名。一个工具在简历里可能有几种写法，同组任意一种出现就算"原文里有"。
 *
 * 这一类逐字比对、原文没有就拒：你要是真用过 Power BI，简历里一定会写出这个名字，
 * 不存在"换个说法"。所以它们受得起严格比对。
 *
 * ⚠️ 新加工具词之前先想清楚：它是不是**不可能有别的叫法**。
 * 不是的话（例如「数据分析」「财务分析」）别往这里放，会误报。
 */
const TOOL_GROUPS: string[][] = [
  ["Python"],
  ["SQL"],
  ["R 语言", "R语言"],
  ["MATLAB"],
  ["Stata"],
  ["SAS"],
  ["SPSS"],
  ["Java"],
  ["C++"],
  ["Excel"],
  ["PowerPoint", "PPT"],
  ["Word"],
  ["VBA"],
  ["Tableau"],
  ["Power BI", "PowerBI", "PowerQuery"],
  ["Wind", "万得"],
  ["Choice"],
  ["Bloomberg", "彭博"],
  ["同花顺", "iFinD", "iFind"],
  ["SAP"],
  ["DCF"],
  ["CAPM"],
  ["NLP"],
];

/** 找出"改写里用了、原文里完全没有"的工具，返回命中的工具组。 */
function findInventedToolGroups(rewritten: string, groundTruth: string): string[][] {
  const flatRewritten = squash(rewritten);
  const flatGround = squash(groundTruth);

  return TOOL_GROUPS.filter((aliases) => {
    const usedInRewrite = aliases.some((alias) => flatRewritten.includes(squash(alias)));
    const existsInSource = aliases.some((alias) => flatGround.includes(squash(alias)));
    return usedInRewrite && !existsInSource;
  });
}

/** 把若干工具组摊成"已经报过的写法"集合，后面用来去重，免得一个词被报两遍。 */
function aliasSetOf(groups: string[][]): Set<string> {
  return new Set(groups.flatMap((aliases) => aliases.map(squash)));
}

/** 判断一个词是不是工具或证书类——这类没有第二种叫法，逐字比对站得住。 */
function isHardFact(word: string): boolean {
  const flat = squash(word);
  return (
    TOOL_GROUPS.some((aliases) => aliases.some((alias) => squash(alias) === flat)) ||
    CREDENTIAL_DICT.some((item) => squash(item) === flat)
  );
}

/**
 * 奖项和证书。
 *
 * 跟数字一样属于「非常具体的事实」——有就是有，没有就是没有，不接受"适度扩写"。
 * 词表故意只收高信号的写法，不收"证书""奖项"这种泛称，
 * 免得把用户原文里的「资格证书」跟改写里的「证书」当成两回事，误报。
 */
const CREDENTIAL_DICT = [
  "奖学金",
  "国家奖学金",
  "三好学生",
  "优秀学生干部",
  "优秀毕业生",
  "优秀员工",
  "一等奖",
  "二等奖",
  "三等奖",
  "金奖",
  "银奖",
  "铜奖",
  "CPA",
  "CFA",
  "ACCA",
  "FRM",
  "CET-4",
  "CET-6",
  "雅思",
  "托福",
];

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * 校验返回的 JSON 结构。类型不对返回 null，由调用方视为"格式非法"，
 * 跟简历解析那边 normalizeAIResume 的思路一致：宽进，但字段类型必须对。
 */
export function normalizeStyleResult(data: unknown): StyleRewriteResult | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;
  if (typeof raw.rewrittenText !== "string") return null;
  if (!Array.isArray(raw.usedFactIds)) return null;
  if (!Array.isArray(raw.usedKeywords)) return null;
  if (!Array.isArray(raw.warnings)) return null;
  if (!Array.isArray(raw.addedClaims)) return null;

  return {
    rewrittenText: raw.rewrittenText.trim(),
    usedFactIds: asStringArray(raw.usedFactIds),
    usedKeywords: asStringArray(raw.usedKeywords),
    warnings: asStringArray(raw.warnings),
    addedClaims: asStringArray(raw.addedClaims),
  };
}

/** 把事实清单拼成一段文字，所有"是否原文里有"的判断都基于它。 */
export function factsToText(facts: ResumeFact[]): string {
  return facts.map((fact) => fact.text).join("\n");
}

/** 抓阿拉伯数字，带百分号也算一个整体。用来在报错里展示，方便人看。 */
export function extractNumbers(text: string): string[] {
  return [...new Set(text.match(/\d+(?:\.\d+)?%?/g) ?? [])];
}

/**
 * 抓"数字片段"——把一段数字拆成独立的数字串。
 *
 * 为什么要拆：2024.11 和 2024年11月 说的是同一件事，但整串比对认不出来。
 * 拆成 2024 和 11 之后，两种写法都能对上，误报会少很多。
 * 代价是松了一点：只要 2024 和 11 在原文任何地方出现过就算数。
 * 这是有意的取舍——宁可漏报，也不要天天误报让用户不敢相信校验。
 */
export function extractNumberParts(text: string): string[] {
  return [...new Set(text.match(/\d+/g) ?? [])];
}

/** 职责等级的弱动词和强动词。原文是弱的上，改写里出现强的且原文没有，就是升级。 */
const WEAK_DUTY = ["参与", "协助", "配合", "支持", "跟进", "跟随"];
const STRONG_DUTY = ["负责", "主导", "独立完成", "独立负责", "牵头", "统筹", "全权", "主持"];

/**
 * 校验一条风格改写结果。
 *
 * 基准是**简历原文**（sourceText），不是模型抽出来的 facts。
 * 原因：facts 是模型自己抽的，会漏。漏了就会把原文里明明有的东西判成编造——
 * 用户看到"2024.11 疑似编造"但简历里就写着 2024.11，只会觉得这个功能坏了。
 * facts 只在拿不到原文时兜底。
 *
 * 返回的 issues 里 blocking 为 true 的表示必须拒绝；blocking 为 false 的是提醒。
 */
export function validateStyleResult(
  result: StyleRewriteResult,
  facts: ResumeFact[],
  allowedKeywords: string[] = [],
  /** 简历原文（含用户补充的其他经历）。校验的最终依据。 */
  sourceText = "",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // 有原文就用原文，没有才退回模型抽的 facts。
  const groundTruth = sourceText.trim().length > 0 ? sourceText : factsToText(facts);
  const rewritten = result.rewrittenText;

  // ① 数字：拆成数字片段比对，2024.11 和 2024年11月 能对上。
  //    只报"整串里至少有一个片段在原文找不到"的，报错时展示原文的写法，方便人核对。
  const sourceParts = new Set(extractNumberParts(groundTruth));
  const suspiciousNumbers = extractNumbers(rewritten).filter((token) =>
    extractNumberParts(token).some((part) => !sourceParts.has(part)),
  );
  if (suspiciousNumbers.length > 0) {
    issues.push({
      kind: "number",
      blocking: true,
      message: "改写里出现了简历原文中没有的数字，疑似编造。",
      detail: suspiciousNumbers,
    });
  }

  // ② 工具：改写里用了、原文里完全没有的工具名 → 拒。
  //    只查工具这种"不可能有第二种叫法"的东西，能力描述词不在这里，理由见文件头。
  const inventedToolGroups = findInventedToolGroups(rewritten, groundTruth);
  if (inventedToolGroups.length > 0) {
    issues.push({
      kind: "tool",
      blocking: true,
      message: "改写里出现了简历原文中没有的工具。",
      detail: inventedToolGroups.map((aliases) => aliases[0]),
    });
  }

  // ③ 奖项与证书：跟数字一样是"非常具体的事实"，原文里没有就不许出现
  const flatRewritten = squash(rewritten);
  const flatGround = squash(groundTruth);
  const inventedCredentials = CREDENTIAL_DICT.filter(
    (item) => flatRewritten.includes(squash(item)) && !flatGround.includes(squash(item)),
  );
  if (inventedCredentials.length > 0) {
    issues.push({
      kind: "credential",
      blocking: true,
      message: "改写里出现了简历原文中没有的奖项或证书。",
      detail: inventedCredentials,
    });
  }

  // ④ 职责等级：原文是"参与/协助"，改写里冒出"负责/主导"且原文没有 → 升级
  const usedWeak = WEAK_DUTY.filter((word) => groundTruth.includes(word));
  if (usedWeak.length > 0) {
    const upgraded = STRONG_DUTY.filter((word) => rewritten.includes(word) && !groundTruth.includes(word));
    if (upgraded.length > 0) {
      issues.push({
        kind: "responsibility",
        blocking: true,
        message: `原文写的是「${usedWeak.join("、")}」，改写里却出现了更高等级的说法。`,
        detail: upgraded,
      });
    }
  }

  // ⑤ 模型自报的补充内容。默认非空就拒；新增经历允许扩写时会降级成提醒，见 judgeStyleResult
  if (result.addedClaims.length > 0) {
    issues.push({
      kind: "claim",
      blocking: true,
      message: "模型自己申报了简历原文之外的补充内容。",
      detail: result.addedClaims,
    });
  }

  // ⑥ usedFactIds 里有没有不存在的 id
  const knownIds = new Set(facts.map((fact) => fact.id));
  const badIds = result.usedFactIds.filter((id) => !knownIds.has(id));
  if (badIds.length > 0) {
    issues.push({
      kind: "shape",
      blocking: true,
      message: "这轮改写引用了不存在的事实编号。",
      detail: badIds,
    });
  }

  // ⑦ JD 关键词：原文不支持就不能用。只查"既写进了正文、原文里又找不到"的，
  //    纯记账错误（申报了却没写进正文）不算。
  //
  //    这一关分两档，分界线还是"这个词有没有第二种叫法"：
  //    - 工具、证书：不可能换说法，原文里没有就是编的 → 拒。
  //    - 能力、领域词：简历里换个说法写太常见了（「建立财务指标对比表」就是财务分析），
  //      逐字比对必然误报 → 只提醒，让用户自己判断做没做过。
  const unsupported = allowedKeywords.filter(
    (word) =>
      result.usedKeywords.includes(word) &&
      flatRewritten.includes(squash(word)) &&
      !flatGround.includes(squash(word)),
  );

  // ② 和 ③ 已经报过的词，这里不再重复报一遍，免得同一个「Wind」在红框里出现两次。
  const alreadyReported = new Set<string>([
    ...aliasSetOf(inventedToolGroups),
    ...inventedCredentials.map(squash),
  ]);

  const unsupportedHard = unsupported.filter((word) => isHardFact(word) && !alreadyReported.has(squash(word)));
  const unsupportedSoft = unsupported.filter((word) => !isHardFact(word));

  if (unsupportedHard.length > 0) {
    issues.push({
      kind: "tool",
      blocking: true,
      message: "用了 JD 关键词里指名的工具或证书，但简历原文里找不到依据。",
      detail: unsupportedHard,
    });
  }

  if (unsupportedSoft.length > 0) {
    issues.push({
      kind: "skill",
      blocking: false,
      message: "改写里用到了 JD 里的词，但简历原文里没有一模一样的写法。请确认你确实做过这件事。",
      detail: unsupportedSoft,
    });
  }

  return issues;
}

export type StyleVerdict = {
  accepted: boolean;
  /** 需要重试的原因；accepted 为 true 时是空数组。 */
  blocking: ValidationIssue[];
  /** 不阻断、但要展示给用户的提醒。 */
  warnings: ValidationIssue[];
};

export type JudgeOptions = {
  /**
   * 允许"适度扩写"：模型自报的补充内容不拦截，只当提醒交给用户确认。
   *
   * 新增经历（add）用得上。其他经历本来就是用户写的一句梗概，Prompt 明确要模型适度扩写、
   * 并把补出来的每一处如实申报——它照做却被一律拒掉，等于这个功能没法用。
   *
   * 但**事实类的东西仍然硬拦**：数字、技能工具、奖项证书、职责等级、没有依据的 JD 关键词。
   * 那些是"非常具体的事实"，编了就是编了，不存在"适度"。
   */
  allowExpansion?: boolean;
};

/**
 * 综合判断一条结果收不收。
 *
 * 默认规则：数字、技能、奖项证书、职责等级、addedClaims、事实编号这六类，踩中任何一条都拒。
 * 开了 allowExpansion 之后，只有 addedClaims 这一类降级成提醒，其余照旧硬拦。
 */
export function judgeStyleResult(
  result: StyleRewriteResult,
  facts: ResumeFact[],
  allowedKeywords: string[] = [],
  sourceText = "",
  options: JudgeOptions = {},
): StyleVerdict {
  const issues = validateStyleResult(result, facts, allowedKeywords, sourceText);

  // 被降级的那些，从"拦截"挪到"提醒"，调用方要把它们展示出来让用户逐条确认。
  const downgraded = options.allowExpansion ? issues.filter((issue) => issue.kind === "claim") : [];
  const blocking = issues.filter((issue) => issue.blocking && !downgraded.includes(issue));

  return {
    accepted: blocking.length === 0,
    blocking,
    warnings: [...issues.filter((issue) => !issue.blocking), ...downgraded],
  };
}
