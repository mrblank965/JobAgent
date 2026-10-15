import type { JDAnalysis } from "@/lib/jd";
import { judgeStyleResult, type ResumeFact } from "@/lib/styleValidation";
import { EXPRESSION_STRENGTHS, type MergedStyle } from "@/lib/languageStyles";

/**
 * 简历定制（/optimize）的数据结构与规则。
 *
 * 这套类型只服务简历定制这一个页面，不被其他模块消费，
 * 所以不放进 src/types/analysis.ts —— 那是全员共享契约，改动要经集成人员协调。
 * 也不放进 src/lib/ai/ —— 那个目录在文档里划给成员 C（JD 与 AI）。
 *
 * 核心设计：AI 不直接改写简历，而是先给一份「变更清单」，
 * 每条变更带一个勾选框，用户同意哪条才应用哪条。
 * 变更的原料有两份：简历正文，以及用户手填的「其他经历」。
 */

/** 这条变更的材料来自哪里。 */
export type ChangeSource = "resume" | "extra";

/** 变更类型。rewrite = 原地改写，remove = 建议删除，add = 从其他经历新增进简历。 */
export type ChangeKind = "rewrite" | "remove" | "add";

export type ChangeItem = {
  /** 稳定 id，用于界面上的勾选框状态。 */
  id: string;
  source: ChangeSource;
  kind: ChangeKind;
  /**
   * 所属板块。
   * rewrite / remove 时是这条经历在简历里所属的板块；
   * add 时是**它应该插进简历的哪个板块**，必须与简历原文里的板块标题逐字一致。
   */
  section: string;
  /** 该段标题，用于人眼快速定位。 */
  heading: string;
  /**
   * 待替换的原文。
   * source=resume 时是简历里逐字存在的一段正文；
   * source=extra 时是用户在「其他经历」里写的那条。
   */
  original: string;
  /** rewrite/add 是改写后的文字；remove 为空字符串。 */
  rewritten: string;
  reasons: string[];
  keywordsEmbedded: string[];
  /**
   * ★ AI 自己补写出来的细节，必须逐条列出来交给用户确认。
   * 其他经历如果只是梗概（例如"帮导师做过 ESG 课题"），
   * 模型会想补成"负责数据收集与整理、产出课题报告"，
   * 这些补出来的部分全部落在这里，界面上单独高亮，用户确认后才写入。
   */
  aiAdded: string[];
  /** 需要用户自己补的真实信息（通常是该有数字而原文没有的地方）。 */
  evidenceNeeded: string[];
  /** 这条改写引用了事实清单里的哪些编号。 */
  usedFactIds: string[];
  /** 这条改写用了哪些 JD 关键词。 */
  usedKeywords: string[];
  /** 模型自己申报的、事实清单之外的补充。非空即整条拒绝。 */
  addedClaims: string[];
  /** 校验给出的提醒（不阻断的那类）。 */
  warnings: string[];
  /** 校验没过关的条目不能应用，界面上要标出来并说明原因。 */
  rejected: boolean;
  /** 被拒的原因，一条一句。 */
  rejectReasons: string[];
};

export type OptimizePlan = {
  summary: string;
  styleNotes: string[];
  /** 从简历里抽出来的事实清单，带编号，用来校验改写有没有编造。 */
  facts: ResumeFact[];
  changes: ChangeItem[];
  /** 整体上仍然缺失的 JD 要求。 */
  gaps: string[];
  warning: string;
};

/** 匹配度快照。改写前后用同一口径各算一次，所以两个分数可比。 */
export type MatchSnapshot = {
  score: number;
  hits: string[];
  missing: string[];
};

/** 拼 Prompt 需要的全部输入。analysis 来自 jd.ts 的本地拆解，可以为空。 */
export type OptimizeInput = {
  /** 简历正文。 */
  resume: string;
  /** 用户在「其他经历」里填的内容，可以为空。 */
  extra: string;
  /** 目标 JD 原文。 */
  jd: string;
  company?: string;
  title?: string;
  /** 画像里的目标方向，只作风格参考。 */
  target?: string;
  /** 校招 / 实习 / 社招，只作风格参考。 */
  jobType?: string;
  /** 已经合并好的语言风格设置（主风格 + 辅风格 + 力度 + 长度 + 量化开关）。 */
  style?: MergedStyle;
  analysis?: JDAnalysis | null;
};

const SOURCES: ChangeSource[] = ["resume", "extra"];
const KINDS: ChangeKind[] = ["rewrite", "remove", "add"];

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * 剥掉模型自己加的 markdown 标记。
 *
 * 模型经常把「加粗小标题」理解成写 markdown 的 **星号**，于是输出
 * 「**行业数据归集**：……」，星号会被原样写进 Word，很出戏。
 * 加粗应该由排版程序按「小标题：内容」这个格式自己完成，正文里不该出现标记符号。
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .trim();
}

const cleanString = (value: unknown): string => stripMarkdown(asString(value));

const cleanStringArray = (value: unknown): string[] => asStringArray(value).map(stripMarkdown);

/** 模型可能漏字段或把数组写成 null，这里逐条补全。 */
function normalizeChange(value: unknown, index: number): ChangeItem | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const source = asString(raw.source) as ChangeSource;
  const kind = asString(raw.kind) as ChangeKind;

  const item: ChangeItem = {
    id: `c${index}`,
    source: SOURCES.includes(source) ? source : "resume",
    kind: KINDS.includes(kind) ? kind : "rewrite",
    section: cleanString(raw.section),
    heading: cleanString(raw.heading),
    // original 要保持原样，一个字都不能动，否则没法在草稿里定位替换。
    original: asString(raw.original),
    rewritten: cleanString(raw.rewritten),
    reasons: cleanStringArray(raw.reasons),
    keywordsEmbedded: cleanStringArray(raw.keywordsEmbedded),
    aiAdded: cleanStringArray(raw.aiAdded),
    evidenceNeeded: cleanStringArray(raw.evidenceNeeded),
    usedFactIds: asStringArray(raw.usedFactIds),
    usedKeywords: cleanStringArray(raw.usedKeywords),
    addedClaims: cleanStringArray(raw.addedClaims),
    warnings: cleanStringArray(raw.warnings),
    // 校验在 normalizePlan 里统一做，这里先给默认值。
    rejected: false,
    rejectReasons: [],
  };

  // rewrite/add 没有改写后的文字就没法应用；remove 只需要原文。
  if (item.kind === "remove") return item.original ? item : null;
  return item.original && item.rewritten ? item : null;
}

/** 校验结果转成一句人话，附带具体是哪些词出了问题。 */
function describeIssue(message: string, detail?: string[]): string {
  return detail && detail.length > 0 ? `${message}（${detail.join("、")}）` : message;
}

function normalizeFact(value: unknown, index: number): ResumeFact | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const text = asString(raw.text).trim();
  if (!text) return null;
  return {
    id: asString(raw.id).trim() || `f${index + 1}`,
    text,
    section: cleanString(raw.section) || undefined,
  };
}

/**
 * 把模型返回的内容整理成 OptimizePlan，并逐条校验有没有越过事实边界。
 *
 * 宽进严出：少给字段一律补默认值，但一条可用的变更都没有时返回 null，
 * 交给界面提示重试，绝不返回半成品去覆盖用户的简历草稿。
 *
 * 校验需要事实清单（facts）和 JD 关键词。**事实清单为空时跳过校验**——
 * 没有事实就没法判断"哪些数字是编的"，硬校会把每一条都误判成违规。
 */
export type NormalizePlanOptions = {
  /** JD 里抽出来的关键词，用来查有没有硬塞无依据的词。 */
  jdKeywords?: string[];
  /**
   * 简历原文（含用户补充的其他经历）。
   * 这是校验的最终依据——模型抽的 facts 会漏，原文不会。
   */
  sourceText?: string;
};

export function normalizePlan(data: unknown, options: NormalizePlanOptions = {}): OptimizePlan | null {
  if (!data || typeof data !== "object") return null;

  const { jdKeywords = [], sourceText = "" } = options;
  const raw = data as Record<string, unknown>;

  const facts = Array.isArray(raw.facts)
    ? raw.facts.map((item, index) => normalizeFact(item, index)).filter((item): item is ResumeFact => item !== null)
    : [];

  const changes = Array.isArray(raw.changes)
    ? raw.changes
        .map((item, index) => normalizeChange(item, index))
        .filter((item): item is ChangeItem => item !== null)
    : [];

  if (changes.length === 0) return null;

  // 有原文就以原文为准；原文也没有（理论上不会）才退回模型抽的 facts。
  const hasGroundTruth = sourceText.trim().length > 0 || facts.length > 0;

  if (hasGroundTruth) {
    for (const item of changes) {
      // remove 只是删除，没有新内容要校验。
      if (item.kind === "remove") continue;

      const verdict = judgeStyleResult(
        {
          rewrittenText: item.rewritten,
          usedFactIds: item.usedFactIds,
          usedKeywords: item.usedKeywords,
          warnings: [],
          addedClaims: item.addedClaims,
        },
        facts,
        jdKeywords,
        sourceText,
        // 新增经历（其他经历）允许适度扩写：用户写的本来就是一句梗概，
        // Prompt 也是这么要求模型的，不能反过来把"如实申报"当成违规。
        // 改写已有经历不给这个口子，必须一个字都不多。
        { allowExpansion: item.kind === "add" },
      );

      item.rejected = !verdict.accepted;
      item.rejectReasons = verdict.blocking.map((issue) => describeIssue(issue.message, issue.detail));

      // 新增经历降级下来的那些"补充内容"，并进「AI 自己补的」清单展示，让用户逐条确认属实。
      // 只并这一份，界面上就只出一个黄框，不会跟 warnings 重复一遍。
      if (item.kind === "add") {
        const declared = verdict.warnings
          .filter((issue) => issue.kind === "claim")
          .flatMap((issue) => issue.detail ?? []);
        if (declared.length > 0) {
          item.aiAdded = [...new Set([...item.aiAdded, ...declared])];
        }
      }

      item.warnings = [
        ...item.warnings,
        ...verdict.warnings
          .filter((issue) => !(item.kind === "add" && issue.kind === "claim"))
          .map((issue) => describeIssue(issue.message, issue.detail)),
      ];
    }
  }

  return {
    summary: asString(raw.summary),
    styleNotes: asStringArray(raw.styleNotes),
    facts,
    changes,
    gaps: asStringArray(raw.gaps),
    warning: asString(raw.warning),
  };
}

/** 应用一条变更时用户做的决定。 */
export type ChangeDecision = {
  item: ChangeItem;
  /**
   * 只有 add 类型用得上：true 表示采用 AI 改写后的措辞，
   * false 表示只用这条经历、但保留用户自己的原话。
   */
  useRewrite: boolean;
  /** 用户在【待补：…】里填的真实内容，键是占位符里的说明文字。 */
  fills: Record<string, string>;
};

export type ApplyResult = {
  text: string;
  /** 成功应用的条数。 */
  applied: number;
  /** 原文在草稿里找不到、没能应用的条目，交给用户手动处理。 */
  missed: ChangeItem[];
  /** 没找到合适板块、最后放在末尾「其他经历」下面的条数。 */
  unplaced: number;
  /** 内容在简历里已经有了、跳过没插的条数。 */
  duplicated: number;
};

/** 简历里常见的板块标题。用来判断一段经历到哪里结束，导出 Word 时也靠它分板块。 */
export const SECTION_TITLES = [
  "教育背景", "教育经历", "学历背景", "实习经历", "工作经历", "实习与工作经历", "实践经历",
  "项目经历", "项目经验", "科研经历", "研究经历", "校园经历", "社团经历", "学生工作",
  "获奖情况", "荣誉奖项", "专业技能", "技能特长", "技能", "证书", "个人优势", "自我评价",
  "个人总结", "其他信息", "其他经历",
];

/** 去掉行首行尾的 【】 [] 和冒号，用来比对板块标题。 */
export function cleanTitle(line: string): string {
  return line.trim().replace(/^[【\[]+/, "").replace(/[】\]]+$/, "").replace(/[:：]\s*$/, "").trim();
}

export function isSectionTitle(line: string): boolean {
  const title = cleanTitle(line);
  return SECTION_TITLES.some((item) => title === item);
}

/**
 * 把一条经历插进简历里指定的板块下面。
 *
 * 做法：先找到那一行板块标题，再往下找下一个板块标题（或文末），
 * 插到那之前。找不到这个板块就返回 null，由调用方放到末尾兜底。
 */
function insertIntoSection(text: string, section: string, body: string): string | null {
  const target = cleanTitle(section);
  if (!target) return null;

  const lines = text.split("\n");
  const start = lines.findIndex((line) => cleanTitle(line) === target);
  if (start === -1) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isSectionTitle(lines[index])) {
      end = index;
      break;
    }
  }

  // 插到该板块末尾的最后一个非空行之后，别插在一串空行后面。
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;

  return [...lines.slice(0, insertAt), body, ...lines.slice(insertAt)].join("\n");
}

/** 取一段文字里第一行非空内容，用来粗略判断经历的表头。 */
export function firstLineOf(text: string): string {
  return (text.split("\n").find((line) => line.trim().length > 0) ?? "").trim();
}

/**
 * 粗查改写后是不是把这段经历的表头（公司、职位、起止时间）弄丢了。
 *
 * 只比对表头开头的一小段，宁可漏报也不误报；命中时界面给个提醒，
 * 由用户自己判断，不自动往文字里塞东西。
 */
export function looksLikeHeaderLost(original: string, rewritten: string): boolean {
  const header = firstLineOf(original);
  if (header.length < 4) return false;

  const probe = header.slice(0, 8);
  return !rewritten.includes(probe);
}

/**
 * 占位符：提示用户这里要补一个真实数字或时间，由用户自己填。
 * 格式固定成【待补：说明文字】，模型会被要求另起一句写，不嵌在句子中间，
 * 这样用户不填的时候整句删掉，不会留下「覆盖个赛道」这种残缺句子。
 */
const PLACEHOLDER_PATTERN = /【待补：([^】]{1,60})】/g;

/** 找出文字里所有待补占位符的说明文字。 */
export function findPlaceholders(text: string): string[] {
  const labels = [...text.matchAll(PLACEHOLDER_PATTERN)].map((matched) => matched[1].trim());
  return [...new Set(labels)].filter(Boolean);
}

/** 用用户填的内容替换占位符；没填的，整个占位符连同它占的那一行一起删掉。 */
export function fillPlaceholders(text: string, fills: Record<string, string>): string {
  return text
    .replace(/【待补：([^】]{1,60})】/g, (_whole, label: string) => (fills[label.trim()] ?? "").trim())
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

/**
 * 把用户勾选的变更应用到简历草稿。
 *
 * rewrite 原地替换；remove 删掉那一段；add 的条目统一追加到末尾的「其他经历」板块下。
 * add 类型支持"只用这条经历、不用 AI 的措辞"，这时写入用户自己的原话。
 * 命不中原文的条目记进 missed，交给用户手动处理，绝不静默丢弃。
 */
export function applyChanges(base: string, decisions: ChangeDecision[]): ApplyResult {
  let text = base;
  let applied = 0;
  let unplaced = 0;
  let duplicated = 0;
  const missed: ChangeItem[] = [];
  const leftovers: string[] = [];

  for (const { item, useRewrite, fills } of decisions) {
    // add 的内容不在简历里，没法用原文定位，按 section 指定的板块插入。
    if (item.kind === "add") {
      const body = fillPlaceholders(useRewrite ? item.rewritten : item.original, fills).trim();
      if (!body) continue;

      // 这段内容简历里已经有了，就不再插一遍。
      // add 没有原文可以定位，用户多点一次「应用」就会把同一段经历插第二次，
      // 界面上也会挡住重复应用，这里再兜一层，保证这个函数自己是幂等的。
      if (text.includes(body)) {
        duplicated += 1;
        continue;
      }

      const inserted = insertIntoSection(text, item.section, body);
      if (inserted !== null) {
        text = inserted;
      } else {
        // 简历里没有这个板块，先攒着，最后统一放到末尾兜底。
        leftovers.push(body);
        unplaced += 1;
      }
      applied += 1;
      continue;
    }

    const original = item.original.trim();
    if (!original || !text.includes(original)) {
      missed.push(item);
      continue;
    }

    text =
      item.kind === "rewrite"
        ? text.replace(original, fillPlaceholders(item.rewritten, fills).trim())
        : text.replace(original, "");
    applied += 1;
  }

  if (leftovers.length > 0) {
    const block = leftovers.map((body) => `- ${body}`).join("\n");
    text = `${text.trimEnd()}\n\n其他经历\n${block}`;
  }

  // 删段之后可能留下连续空行，收拢一下。
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), applied, missed, unplaced, duplicated };
}

/**
 * 按「关键词是否出现在简历正文里」这个口径算匹配度。
 *
 * 不复用 jd.ts 的 analyzeJD：那个函数判断命中靠的是画像里的 skills 技能标签，
 * 改写简历正文不会让它的分数变化，拿它做前后对比会得出「改了也白改」的假结论。
 * 这里换成正文口径，才是改写真正能影响的东西，改写前后两个分数也才可比。
 */
export function scoreByText(analysis: JDAnalysis, text: string): MatchSnapshot {
  const keywords = analysis.keywords;
  const hits = keywords.filter((keyword) => text.includes(keyword));
  const missing = keywords.filter((keyword) => !text.includes(keyword));

  return {
    score: keywords.length ? Math.round((hits.length / keywords.length) * 100) : 0,
    hits,
    missing,
  };
}

/**
 * 找出改写里出现、而原文没有的数字。
 *
 * 这是独立于 aiAdded 的第二道网：aiAdded 靠模型自报，
 * 万一它补了细节却没申报，这里还能抓出来。只提示、不阻断。
 */
export function findNewNumbers(original: string, rewritten: string): string[] {
  const numbers = (text: string) => text.match(/\d+(?:\.\d+)?%?/g) ?? [];

  const before = new Set(numbers(original));
  return [...new Set(numbers(rewritten))].filter((item) => !before.has(item));
}

/**
 * 从模型返回的文字里取出 JSON 对象。
 *
 * 为什么不直接用共用的 parsePastedJSON：模型经常在 JSON 前后再写点东西，
 * 比如开头一句「好的，以下是结果」，或者结尾补一段解释，
 * 甚至把 JSON 包在 ``` 里、外面还留着说明。整段直接 JSON.parse 会报
 * "Unexpected non-whitespace character after JSON"，用户看到的就是一句天书。
 *
 * 这里的做法是：先按原样试一次；不行就去掉代码块围栏，
 * 截取从第一个 { 到最后一个 } 之间的内容再试一次。
 * 改在本地而不是改共用的那个函数，是为了不影响简历解析模块。
 */
export function parseJsonBlock(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  if (!cleaned) throw new Error("粘贴的内容是空的");

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    // 整段不是合法 JSON，继续往下截取
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("里面找不到 JSON 对象（需要一对花括号 { } 包起来）");
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "JSON 解析失败");
  }
}

/** 简历和 JD 拼进 Prompt 前的截断上限，防止超出模型上下文。 */
export const MAX_RESUME_CHARS = 6000;
export const MAX_EXTRA_CHARS = 3000;
export const MAX_JD_CHARS = 3000;

/** 简历太短就没法改写，界面用这个值做前置校验。 */
export const MIN_RESUME_CHARS = 30;

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * 把合并好的风格渲染成 Prompt 里的说明段。
 *
 * 主风格决定结构、句式和长度；辅风格只补最多两个强调点；力度由用户选；
 * 要避开的词是主辅合并去重后的结果。
 *
 * 最后一句"风格只决定怎么读"是刻意写的：风格管的是信息怎么摆、用什么动词，
 * 不管写什么——事实永远来自简历原文。
 */
/** 把一个数组渲染成带缩进的清单，让 Prompt 里有清楚的层次。 */
function renderPoints(items: string[], indent = "    "): string[] {
  return items.map((item) => `${indent}- ${item}`);
}

function renderStyleSection(style: MergedStyle | undefined): string {
  if (!style) {
    return "【语言风格】\n本次没有指定风格。用中性、专业、动词开头的表达，并在 styleNotes 里说明你的判断依据。";
  }

  const strength = EXPRESSION_STRENGTHS.find((item) => item.id === style.expressionStrength);
  const primary = style.primary;

  const lines = [
    "【语言风格（用户已选定，必须遵守）】",
    "这一节只决定「怎么读」，不决定「写什么」。事实永远来自简历原文。",
    "",
    "■ 主风格",
    `名称：${primary.name}`,
    `定位：${primary.positioning}`,
    `读起来的感觉：${primary.description}`,
    `这条经历按它写出来，整体该有的骨架（第一条是表头，从第二条起才是要点）：`,
    ...primary.structure.map((item, index) => `  ${index + 1}. ${item}`),
    "",
    `信息摆放顺序：${primary.informationOrder.join(" → ")}`,
    "要强调的点：",
    ...renderPoints(primary.emphasis),
    "句式参考：",
    ...renderPoints(primary.sentencePatterns),
    `偏好的动词：${primary.verbs.join("、")}`,
    "简历原文里出现下面这类事实时，优先挑出来写进要点：",
    ...renderPoints(primary.factPriority),
    "    ※ 这张表是「挑」的依据，不是「补」的依据。原文里没有的，照这张表也不许写。",
    `尽量避开的空话和模糊词：${primary.avoid.join("、")}`,
    `    原因：${primary.avoidNote}`,
  ];

  lines.push("", "■ 辅风格");
  if (style.secondary) {
    lines.push(
      `名称：${style.secondary.name}`,
      `定位：${style.secondary.positioning}`,
      "它只补充下面这几条强调点，**不改变主风格定下的骨架、信息顺序和句式**：",
      ...renderPoints(style.extraEmphasis, "    "),
    );
  } else {
    lines.push("用户没有启用。只按主风格写，结构保持干净。");
  }

  lines.push(
    "",
    "■ 通用设置（覆盖主风格自带的默认值）",
    `表达力度：${strength?.name ?? "适中"} —— ${strength?.hint ?? ""}`,
    `单条要点字数上限：${style.maxLength} 字。超了就压缩措辞，不要靠删掉事实来凑。`,
    style.preferNumbers
      ? "优先量化：是。原文已有的数量、比例、金额、效率要尽量写进要点；原文没有的数字仍然不许编，按第 4 条用【待补：…】占位符。"
      : "优先量化：否。按原文的信息量写，不刻意往数字上靠。",
    "",
    "■ 一条不受风格影响的硬规则",
    "上面那份「避开的词」只针对空话和修饰词。**描述事实等级的动词不在其中**——原文写「参与 / 协助」，就必须保留这个等级，不许为了显得有力而升级成「负责 / 主导」。",
  );

  return lines.join("\n");
}

/**
 * 生成简历定制的变更清单指令。
 *
 * 事实红线全部写在用户 Prompt 里，故意不改 lib/ai/resume.ts 里那个共用的
 * SYSTEM_PROMPT —— 那个文件被简历解析功能共用，改了会牵连别的模块。
 *
 * 三条最重要的约束：
 * 1. 不许编造，数字尤其不许编，缺数字的写进 evidenceNeeded 让用户自己补。
 * 2. 「其他经历」里用户可能只写了梗概，允许适度扩写，但扩写出来的每一处细节
 *    都必须逐条列进 aiAdded，让用户自己确认真伪，不许悄悄写进去。
 * 3. original 必须是原文里逐字存在的一段，且不含板块标题行，否则系统没法定位替换。
 */
export function buildOptimizePrompt(input: OptimizeInput): string {
  const analysis = input.analysis ?? null;
  const hits = analysis?.match.hits.map((item) => item.k) ?? [];
  const missing = analysis?.match.missing ?? [];
  const duties = analysis?.duties ?? [];

  const resume = truncate(input.resume.trim(), MAX_RESUME_CHARS);
  const extra = truncate(input.extra.trim(), MAX_EXTRA_CHARS);
  const jd = truncate(input.jd.trim(), MAX_JD_CHARS);
  const jobLabel = `${input.company ?? ""} ${input.title ?? ""}`.trim();

  const styleSection = renderStyleSection(input.style);

  const extraSection = extra
    ? `【用户补充的其他经历】
这些是用户自己写上来、但简历里没有的经历。判断其中哪一条对目标岗位最有价值，
值不值得写进简历；不值得就不要硬塞。
"""
${extra}
"""`
    : "【用户补充的其他经历】\n用户没有填写。本次只在简历正文范围内改写，不要提出 add 类型的变更。";

  return `你是一名深耕金融与泛商科招聘的资深简历顾问。请根据目标岗位 JD，比较候选人的简历和补充经历，产出一份「变更清单」，交给用户自己勾选决定要不要采纳。

注意：你不是直接改写简历，而是先提出建议。用户会逐条勾选，只采纳他同意的。

【先说清本次要交付什么：写到"具体"，不是写到"安全"】
下面有大量「不许」的规则，那是**底线**，规定你不能越过哪条线，不代表写得越短越保险。
用户找你改简历，就是嫌原来写得太干、太空。你的正事是把原文已有的动作、方法、工具、
范围、产出尽量写足，让 HR 看得出这个人具体干了什么。
在红线之内，**不要因为怕出错就把句子写短、写虚、写成套话。** 那等于没改。
判断标准很简单：改写后如果和原文一样空，这次改写就是失败的。

【第一步：先把简历拆成事实清单】
在提出任何改写建议之前，先逐字把简历拆成一条条「事实」，写进输出里的 facts 数组。
- 每条事实给一个编号：f1、f2、f3……
- text 必须**逐字来自简历原文**，一个字都不要改写、不要概括、不要把几件事合成一条。
- 数字、时间、公司名、职位名、技能名各自成条，方便后面逐项核对。
- 这一步只做切分，不做任何改写。
之后每一条改写建议，都要在 usedFactIds 里写清用了 facts 里的哪些编号。

系统会拿**简历原文逐字核对**，不是拿 facts 核对：
- 原文里有的，大胆写——日期、数字、工具名、公司名，照原文的写法写就行；
- 原文里没有的，一个字都不要补。
凡是原文里找不到的数字、技能、时间、成果，一律判定为编造，并把这条改写直接拒掉。

【第一优先级：事实红线，任何情况都不得违反】
1. 简历部分的改动，只能使用简历原文里已经出现的信息：公司、机构、项目、职位、时间、学历、证书、奖项、数字。一个字都不许新增或篡改。
2. 简历部分你只允许做三件事：改写措辞；把 JD 关键词以自然的方式嵌进原有的真实描述；建议删除与目标岗位明显无关的段落。
3. 严禁虚构公司、项目、职位、学历、证书、奖项；也严禁编造任何数字和时间（金额、百分比、人数、时长、日期、起止时间、排名、增长率、覆盖范围）。
4. 当某段经历缺少量化数据或具体时间、而 JD 又看重这些时，不要自己填，改用占位符交给我补：
   在 rewritten 的末尾另起一行，写【待补：这里需要什么样的真实数字或时间】，例如【待补：处理的数据条数】、【待补：这段实习的起止时间】。
   三条硬性要求：
   - 占位符必须独立成行、独立成句，不要嵌在句子中间，也不要在它前面加逗号。用户不填时这一行会被整体删掉，嵌在中间会让句子残缺。
   - 一条变更里最多写两个占位符。
   - 每个占位符只针对一个具体信息，不要写【待补：各种数据】这种含糊说法。
5. 原文没有的影响描述和自我评价一律不许新增，例如「支撑业务决策」「提升效率」「显著改善」这类拔高说法。确有必要保留时，标在 aiAdded 里让用户确认。

【关于「其他经历」的特殊规则，必须严格遵守】
6. 用户填的其他经历往往只是梗概。你可以适度扩写，但**扩写出来的每一处具体细节，都必须逐条列进 aiAdded**，说清你补了什么、依据是什么。不许把补出来的细节直接混在 rewritten 里当作既成事实。
   例：用户写「帮导师做过 ESG 课题」，你可以写成「参与 ESG 评级体系课题研究，负责数据收集与整理」，但「负责数据收集与整理」必须出现在 aiAdded 里，写明「用户未提及，需要你确认是否属实」。
   例：用户写「做过一段券商实习」，你不知道他具体干了什么，这时应该把「具体做了什么」列进 evidenceNeeded 让用户补，而不是自己编一个。
7. 其他经历如果和简历里已有的经历重复，不要提出 add；如果它明显不如简历里的相关，也不要硬塞进来，宁可不提。

【改写的单位：一整段经历，不是单条要点】
- original 必须从这段经历的表头那一行开始（含公司/机构、职位/角色、起止时间），一直到这段的最后一条要点，整段逐字复制，不要只取其中一两条要点。
- 注意区分两种标题：
  - 「板块标题」如「教育背景」「实习经历」「项目经历」，**不要**放进 original，系统会自己保留。
  - 「经历自己的表头」如「2025.06—2025.09 星河证券 研究助理」或「星河证券 · 研究助理（2025.06—2025.09）」，**必须**包含在 original 里。
- rewritten 的**第一行必须是原文表头**，公司、职位、起止时间一字不改地保留，**表头绝不能省**。
- **rewritten 的要点条数不要少于原文。** 原文已有的要点都要保留下来，不要为了"显得简洁"而合并或删掉。
  只有确实与目标岗位无关的要点才可以删，删了要在 reasons 里写明删的是哪条、为什么。
  这条经历本来有几条要点，改写后就该有几条，只能更充实，不能更单薄。
- **rewritten 里，表头下面的每一条要点都要以「- 」开头，一条要点占一行。**
  排版程序就是靠行首这个符号给每条要点画项目符号的。不写的话，整段会排成一坨没有层次的平铺文字，简历会显得很挤。
  表头那一行不加任何符号，原样保留。
- 不要为了改一条要点就单独列一条变更。要改就改整段。

【变更类型】
- rewrite：改写简历里已有的一整段经历。source 填 "resume"。
- remove：建议删除简历里与目标岗位明显无关的一整段经历。source 填 "resume"，rewritten 留空字符串。
- add：建议把「其他经历」里的某一条写进简历。source 填 "extra"。
  这一条的 section **必须填它应该归入的板块标题**，并且与简历原文里的标题逐字一致，例如「实习经历」「项目经历」「校园经历」。
  判断依据是这条经历的性质，不是它原来放在哪里。简历里确实没有合适的板块时，才留空字符串。

${styleSection}

【这张 JD 自己的用词也读一下】
在 styleNotes 里说明：这份 JD 反复用哪些词？语气偏"结果与影响"还是偏"流程与合规"？
用户选的主风格优先，你读到的 JD 特征只用来微调用词（比如它偏好的名词），不要拿它去改结构。
用户画像里的求职方向是「${input.target || "未填写"}」，求职类型是「${input.jobType || "未填写"}」，仅作参考。

【核心任务：把每条要点写到"具体"】
简历读起来干巴，通常不是词不够专业，而是没写清"做了什么、怎么做的、做到什么范围"。
**这一段的要求比上面所有格式要求都重要，请认真执行。**

一条要点写得算到位，至少要交代出这三样：
1. 具体动作：用动词说清做了什么，不要只写"负责""参与"这类不交代内容的词。
   「搭建」「测算」「核查」「梳理」「撰写」「比对」「归集」比「负责」「参与」「协助」有信息量。
   原文写「参与」时，可以在不改变事实的前提下换成更准确的动作词，但不要升级成「主导」「独立负责」。
2. 方法或工具：说清用什么做的。原文里提到了工具、口径、方法、依据，就一定要写进去，不要省。
3. 范围或产出：说清覆盖到什么程度、交付了什么。原文有数量、时长、频次、对象、产出物，都写进去。

**每写完一条要点，回头自己查一遍：上面这三样，原文提供了的，我是不是都写进去了？**
有漏的就补上。这一步是这次改写质量的关键，不要跳过。

另外两条写法要求：
4. 别堆名词。把「完成数据可视化展示」改成「用 Power BI 把结果做成图表」这种读得出口的说法。
5. 一句话里不要塞超过三个专业名词，否则读起来像术语清单。

底线提醒（这条是防止你写过头，不是让你写少）：
上面那三样**只能从原文已有的事实里挑**。原文没有数字、没有工具、没有产出，就让它没有，不要补；
缺的地方按第 4 条用【待补：…】交给用户自己补。
**但反过来也不对——原文里明明有的事实，不要因为怕出错就省略。**
既不许写多，也不许写少。原文给了多少料，就要用足多少料。

【每条要点尽量带一个加粗小标题】
简历排版时会把「小标题：具体内容」里冒号前面的部分加粗，让 HR 一眼看到重点。所以：
- 能自然概括的，就写成「四到八个小标题：具体内容」，例如「财务状况核查：核对三年期报表与工商档案」「可比公司测算：搭建估值对比表，测算市盈率区间」。
- 小标题接在行首那个「- 」后面，整行只有这一个冒号：「- 财务状况核查：核对三年期报表」。不要写成「- 财务状况核查 - 核对……」这种两个分隔符的写法。
- 小标题必须**如实概括这条本身做了什么**，不许为了好看硬套一个不相干的名词。
- 概括不出来就不要加，直接写内容，不要硬凑。
- 一条要点最多一个冒号，不要写成层层嵌套。
- **不要用 markdown 的星号或井号来标记加粗**，直接写「小标题：内容」这五个字加一个冒号就行。排版程序会自己把冒号前面变粗；你要是在文字里加 ** 或 ##，这些符号会原样印在简历上。

【写法参考，只看句式，一个字都不许抄】
下面几组是「干巴」和「写得具体」的对照。请模仿右边那一种的**句式**，但**绝对不要使用里面出现的任何内容**：

- 干巴：负责数据的收集和整理工作
  具体：从公开渠道归集三年可比公司经营数据，按业务线分类，整理成可复核的底稿
- 干巴：参与了项目的分析工作
  具体：测算可比公司市盈率与市销率区间，比对招股书披露口径，输出估值结论
- 干巴：使用 Excel 完成表格制作
  具体：用 Excel 搭建财务指标对比表，按毛利率与周转率两个维度排列同业公司
- 干巴：提升了沟通协调能力
  具体：对接两个部门核对数据口径，把差异项整理成清单逐条确认

再次强调：上面例子里的公司、数字、口径、场景**全是编造的示例**，一个字都不许出现在输出里。你只能把**原文已有的动作、工具和范围**，用上面那种具体的方式讲出来。

【本 JD 的已知信息】
命中关键词（请自然地嵌入，不要硬塞）：${hits.join("、") || "无"}
目前缺失的要求：${missing.join("、") || "无"}
岗位职责：${duties.slice(0, 6).join("；") || "无"}
说明：上面「缺失」指简历和补充经历里目前都找不到证据的要求。缺就让它缺，不要为了凑齐而编造。

【输出格式】只输出严格 JSON，不要 markdown 代码块，不要任何解释文字。结构如下：
{
  "summary": "整体判断和改写思路，两三句话",
  "styleNotes": ["本次语言风格要点，以及你从这份 JD 里读到的用词特征"],
  "facts": [
    {
      "id": "f1",
      "section": "所属板块，例如 实习经历",
      "text": "逐字来自简历原文的一句话、一个数字或一个技能名，一个字都不许改写"
    }
  ],
  "changes": [
    {
      "source": "resume | extra",
      "kind": "rewrite | remove | add",
      "section": "教育经历 | 实习经历 | 项目经历 | 专业技能 | 个人优势 | 其他",
      "heading": "该段标题，例如 星河证券 · 研究助理；识别不到就写板块名",
      "original": "要替换的原文，逐字复制，不要包含板块标题行。rewrite 和 remove 时取自简历，add 时取自用户的其他经历",
      "rewritten": "改写后的文字。第一行是原文表头、不加符号，下面每一条要点以「- 」开头、一条占一行。kind 是 remove 时留空字符串。需要用户补数字或时间的地方，在末尾另起一行写【待补：具体要补什么】",
      "reasons": ["为什么这样改，一条一句"],
      "keywordsEmbedded": ["本次嵌入的 JD 关键词"],
      "aiAdded": ["你补写出来、用户原文没有的细节，逐条列出；没有就空数组"],
      "evidenceNeeded": ["需要用户自己补的真实信息；没有就空数组"],
      "usedFactIds": ["这条改写用到了 facts 里的哪些编号，例如 f2、f5；一条都用不上就空数组"],
      "usedKeywords": ["这条改写里实际用到的 JD 关键词；没有就空数组"],
      "addedClaims": ["你自己承认的、简历原文里找不到的补充内容。判断基准是原文，不是 facts —— 原文里写着的不要写进来，否则会被误判"],
      "warnings": ["你想提醒用户注意的地方；没有就空数组"]
    }
  ],
  "gaps": ["整体上仍然缺的 JD 关键要求，建议用真实经历补，不要编"],
  "warning": "可选的整体提醒，没有就空字符串"
}

硬性要求：
- 每一条的 original 必须能在对应来源里逐字找到，否则用户无法自动替换。不要包含「教育背景」「实习经历」这类板块标题行。
- 每一条 rewrite / add 都要填 usedFactIds，指回 facts 里的编号。系统会拿它核对改写有没有超出事实。
- **addedClaims 必须诚实填写，但只填原文里真的没有的。** 判断基准是**简历原文**，不是 facts。
  原文里写着的日期、数字、工具名、公司名，即使你没把它抽进 facts，也**不算**补充内容，不要写进 addedClaims。
  只有原文确实找不到、而是你自己推出来的影响、范围或成果，才写进 addedClaims。
  写多了会误伤（原文有的被拒），写少了会漏（编造没被拦），按"原文里有没有"这个唯一标准判断。
- **rewritten 的要点条数不得少于原文**，只能更充实或持平。原文的要点被合并或删掉，这次改写就是失败的。
- 「不要单独列一条」指的是**不要为了很小的改动新开一个变更条目**，不是让你少写。
  每条 rewrite 的 rewritten 内部，照样要按上面的【核心任务】把内容写足。
- 全部变更控制在 12 条以内，按对匹配度的贡献从高到低排列。
- 如果实在找不出值得改的地方，也要至少返回一条最关键的改写建议。
- **最后自检一遍**：你写出来的这段经历，读完以后是不是比原文更看得出"这个人具体做了什么"？
  如果信息量和原文一样空、只是换了个说法，说明没做到，请重写这一段再输出。

【简历原文】
"""
${resume}
"""

${extraSection}

【目标岗位 JD${jobLabel ? `：${jobLabel}` : ""}】
"""
${jd}
"""`;
}
