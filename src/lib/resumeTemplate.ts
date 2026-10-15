import { cleanTitle, isSectionTitle } from "@/lib/optimize";

/**
 * 简历模板骨架。
 *
 * 解决的问题：模型不许编造，所以**原文没料的地方，改写也变不出料来**。
 * 与其逼模型硬凑，不如把「这里缺什么」直接摆到用户面前，让他自己填真话。
 *
 * 三条设计原则：
 * 1. 不丢内容。用户草稿里已有的板块原样搬过去，只按规格顺序重排，一个字都不删。
 *    不认识的板块（个人优势、获奖情况等）一律保留，原序放到最后。
 * 2. 空缺用「灰色提示」标出来，导出 Word 后是灰色斜体，用户对着改。
 * 3. 提示能一次清干净。导出的「去掉灰色提示」会把整行提示删掉、行内提示挖空，
 *    得到的是一份没有多余文字的正式简历。
 *
 * 提示的两种写法：
 * - 「〔提示〕」或「〔待写〕」开头的**整行提示**，删的时候一次删一行。
 * - 句子中间的**行内待填**，例如「〔电话〕」，只挖掉括号里那几个字。
 * 两种情况都靠一对〔〕识别，所以正文里不要用这对符号。
 */

/** 整行提示的前缀。 */
const HINT = "〔提示〕";
const BLANK = "〔待写〕";

/** 行内待填的标记。整行提示也是它，所以只需要一个正则。 */
const HINT_PATTERN = /〔[^〕\n]*〕/g;
/** 整行都是提示的，导出时整行删掉，而不是留一个空行。 */
const WHOLE_LINE_HINT = /^\s*〔(?:提示|待写)〕/;

export const TEMPLATE_HINT_PREFIX = HINT;

export function hasHints(text: string): boolean {
  return text.includes("〔") && text.includes("〕");
}

export type LineToken = { text: string; hint: boolean };

/**
 * 把一行按〔〕切成若干段，标明哪段是提示。
 * 排版时提示段渲染成灰色斜体，其余段正常颜色。
 */
export function tokenizeHints(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  let last = 0;

  for (const matched of line.matchAll(HINT_PATTERN)) {
    const start = matched.index ?? 0;
    if (start > last) tokens.push({ text: line.slice(last, start), hint: false });
    tokens.push({ text: matched[0], hint: true });
    last = start + matched[0].length;
  }

  if (last < line.length) tokens.push({ text: line.slice(last), hint: false });
  return tokens;
}

/**
 * 去掉所有灰色提示，得到一份可以直接投递的干净正文。
 *
 * 整行提示整行删掉；行内提示只挖掉括号本身，并把挖空留下的连续空格收拢成一个全角空格。
 * 原本就有的空行保留，避免把板块黏在一起。
 */
export function stripHints(text: string): string {
  const kept: string[] = [];

  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      kept.push("");
      continue;
    }
    if (WHOLE_LINE_HINT.test(line)) continue;

    if (!hasHints(line)) {
      kept.push(line);
      continue;
    }

    const cleaned = line
      .replace(HINT_PATTERN, "")
      .replace(/[ \t　]{2,}/g, "　")
      .replace(/^[ \t　]+|[ \t　]+$/g, "");

    if (cleaned.length > 0) kept.push(cleaned);
  }

  // 板块标题下面一条内容都没有的，连标题一起去掉，对应规格里的「隐藏所有空字段」。
  // 只在导出时做：模板本身要留着空标题，当作填写的落点。
  const visible: string[] = [];
  for (let index = 0; index < kept.length; index += 1) {
    const line = kept[index];
    if (line.trim().length > 0 && isSectionTitle(line) && !sectionHasContent(kept, index)) {
      continue;
    }
    visible.push(line);
  }

  return visible.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 从标题的下一行开始找，碰到下一个板块标题或文末，就说明这个板块是空的。 */
function sectionHasContent(lines: string[], titleIndex: number): boolean {
  for (let index = titleIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim().length === 0) continue;
    return !isSectionTitle(lines[index]);
  }
  return false;
}

/** 用户画像里可以自动填进模板的字段。 */
export type TemplateProfile = {
  name: string;
  phone: string;
  email: string;
  location: string;
  target: string;
  school: string;
  major: string;
  degree: string;
  gradYear: string;
  skills: string[];
};

export type TemplateInput = {
  profile: TemplateProfile;
  /** 当前简历草稿。已有的板块会原样搬进模板。 */
  draft: string;
};

type RawBlock = { title: string; lines: string[] };

/**
 * 按板块标题把正文切开，保留每行原文。
 *
 * 跟 optimizeDocx 里那个 parseResumeText 是两件事：那个要拼 Word 段落，
 * 把头部压成了「姓名 + 一行联系方式」；这里要原样搬运，所以自己留一份。
 */
function parseBlocks(text: string): { head: string[]; blocks: RawBlock[] } {
  const head: string[] = [];
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;

    if (isSectionTitle(line)) {
      current = { title: cleanTitle(line), lines: [] };
      blocks.push(current);
      continue;
    }

    if (current) current.lines.push(line);
    else head.push(line);
  }

  return { head, blocks };
}

/** 头部：姓名 + 一行联系方式。画像里有的直接填，没有的留灰提示。 */
function buildHead(profile: TemplateProfile, existing: string[]): string {
  const name = profile.name.trim();

  // 画像完全是空的，就把用户草稿里原本的头部照搬，不要用一堆空括号盖掉他自己写的东西。
  if (!name && !profile.phone.trim() && !profile.email.trim() && existing.length > 0) {
    return existing.join("\n");
  }

  const contact = [
    profile.phone.trim() || "〔电话〕",
    profile.email.trim() || "〔邮箱〕",
  ];
  if (profile.location.trim()) contact.push(profile.location.trim());
  if (profile.target.trim()) contact.push(profile.target.trim());

  let line = contact.join("　");
  // 城市和求职方向都是可选项，缺了就用一行合并提示，不要拆成两个括号把头部撑得很乱。
  if (!profile.location.trim() && !profile.target.trim()) {
    line += "　〔可选：意向城市｜求职方向｜作品链接〕";
  }

  return `${name || "〔姓名〕"}\n${line}`;
}

/** 教育背景的空骨架。学校专业学历画像里有就直接填，其余留白。 */
function educationSkeleton(profile: TemplateProfile): string[] {
  const known = [profile.school, profile.major, profile.degree]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("｜");

  return [
    known ? `${BLANK}起止时间　${known}` : `${BLANK}起止时间　学校｜学院｜专业｜学历`,
    `${HINT}有多段学历就按时间倒序排，最高学历放最前面`,
    `${HINT}可选补充：GPA 或专业排名｜3–6 门与目标岗位相关的课程｜重要奖项`,
  ];
}

function internshipSkeleton(): string[] {
  return [
    `${BLANK}起止时间　公司｜职位`,
    `${HINT}每段写 2–5 条要点，一条占一行，写成「关键词：行动 + 方法 + 结果」`,
    `${HINT}例：财务核查：核对三年期报表与工商档案，比对公司披露口径`,
    `${HINT}原文没有的数字就留空，不要自己编；和岗位无关的经历可以不写`,
  ];
}

function projectSkeleton(): string[] {
  return [
    `${BLANK}起止时间　项目名称｜你的角色`,
    `${HINT}每段写 2–5 条要点，突出你个人做了什么、用了什么方法、产出了什么`,
    `${HINT}论文、竞赛、课程大作业都可以写在这里`,
  ];
}

function skillSkeleton(profile: TemplateProfile): string[] {
  const skills = profile.skills.map((item) => item.trim()).filter(Boolean);

  return [
    skills.length > 0
      ? `工具与专业能力：${skills.join("、")}`
      : `${BLANK}工具与专业能力：〔如 Excel、Wind、Python、财务建模、估值〕`,
    `${BLANK}语言：〔如 英语 CET-6、雅思 7.0〕`,
    `${BLANK}证书：〔如 CPA 专业阶段、CFA 一级〕`,
  ];
}

/**
 * 板块顺序按用户给的规格排。
 * optional 的板块没有内容时不占位置，只在原地留一行提示，避免导出后多一个空标题。
 */
const SECTION_GROUPS: {
  title: string;
  keys: string[];
  optional?: boolean;
  skeleton?: (profile: TemplateProfile) => string[];
}[] = [
  { title: "教育背景", keys: ["教育背景", "教育经历", "学历背景"], skeleton: educationSkeleton },
  { title: "实习经历", keys: ["实习经历", "工作经历", "实习与工作经历"], skeleton: internshipSkeleton },
  { title: "项目经历", keys: ["项目经历", "项目经验", "科研经历", "研究经历"], skeleton: projectSkeleton },
  {
    title: "校园经历",
    keys: ["校园经历", "社团经历", "学生工作", "实践经历"],
    optional: true,
  },
  { title: "专业技能", keys: ["专业技能", "技能特长", "技能"], skeleton: skillSkeleton },
];

/** 粗判表头：行里带四位年份的当表头，其余当要点。只用来判断这段经历是不是写得太单薄。 */
const looksLikeHeader = (line: string) => /\d{4}/.test(line);

function countBullets(lines: string[]): number {
  return lines.filter((line) => !looksLikeHeader(line)).length;
}

/**
 * 生成模板骨架。
 *
 * 拿当前草稿来拆，已有的板块原样保留，缺的板块补空骨架，
 * 认不出来的板块（个人优势、获奖情况……）不丢，原序放到最后。
 */
export function buildResumeTemplate(input: TemplateInput): string {
  const { head, blocks } = parseBlocks(input.draft ?? "");

  const assigned = new Map<string, RawBlock>();
  const leftovers: RawBlock[] = [];

  for (const block of blocks) {
    const group = SECTION_GROUPS.find((item) => item.keys.includes(block.title));
    // 同名的板块只认第一个，后面重复出现的放进 leftovers，保证一个字都不丢。
    if (group && !assigned.has(group.title)) assigned.set(group.title, block);
    else leftovers.push(block);
  }

  const parts: string[] = [buildHead(input.profile, head)];

  for (const group of SECTION_GROUPS) {
    const existing = assigned.get(group.title);

    if (existing) {
      parts.push([group.title, ...existing.lines].join("\n"));

      // 这段经历本身太单薄，就地提醒一句。
      // 只对实习和项目提醒：教育背景和专业技能本来就不是一条条要点。
      if (
        (group.title === "实习经历" || group.title === "项目经历") &&
        countBullets(existing.lines) < 2
      ) {
        parts.push(`${HINT}这个板块看起来只有一条要点。每段经历写 2–5 条，一行一条，写清行动、方法、结果。`);
      }
      continue;
    }

    if (group.optional) {
      parts.push(
        `${HINT}可选板块：有校园经历、社团或学生工作就写在这里；没有就整块不要写，导出时这几行会一起删掉。`,
      );
      continue;
    }

    parts.push([group.title, ...(group.skeleton?.(input.profile) ?? [])].join("\n"));
  }

  for (const block of leftovers) {
    parts.push([block.title, ...block.lines].join("\n"));
  }

  return `${parts.join("\n\n").trim()}\n`;
}
