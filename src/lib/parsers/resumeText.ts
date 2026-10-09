import type {
  EducationDegree,
  EducationEntry,
  ExperienceCategory,
  ExperienceEntry,
  ResumeData,
} from "@/types/analysis";

/**
 * 成员 B 负责：把简历全文，按本地规则拆成 ResumeData。
 *
 * 这套规则只做搬运，不做联想。每一条结果都必须能在原文里找到出处，
 * 找不到就返回空数组，不填占位内容，也不根据上下文推测。
 *
 * 整体分两步走，先分桶再处理，避免不同段落的行互相串。
 * 第一步按标题把每一行丢进对应段落的桶里。
 * 第二步每个段落各自处理自己的行，互不干扰。
 *
 * 页面上那份"解析规则说明"直接读取本文件导出的常量，
 * 所以界面写的规则和这里跑的规则是同一份，不会各说各话。
 */

/** 允许解析的最短文本长度。少于这个字数直接拒绝，避免解析出一堆噪声。 */
export const MIN_RESUME_LENGTH = 30;

export type SectionKey = "education" | "honors" | "experiences" | "projects" | "skills" | "strengths";

/** 遍历顺序，仅用于让匹配结果稳定可复现。 */
export const SECTION_ORDER: SectionKey[] = [
  "education",
  "honors",
  "experiences",
  "projects",
  "skills",
  "strengths",
];

/**
 * 段落标题关键词表。
 *
 * 判定标题的条件是"整行完全等于下面某个词"，而不是"包含某个词"。
 * 用完全相等是为了避免"熟练掌握 Python 技能"这种正文行被误判成标题。
 *
 * 实习经历和项目经历分成两个字段，因为简历里它们本来就是两段不同的内容。
 */
export const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  education: ["教育背景", "教育经历", "学历", "教育", "Education"],
  honors: [
    "奖励荣誉",
    "荣誉奖励",
    "荣誉奖项",
    "奖项荣誉",
    "获奖情况",
    "获奖经历",
    "荣誉",
    "奖项",
    "奖励",
    "Awards",
    "Honors",
  ],
  experiences: [
    "实习经历",
    "工作经历",
    "实践经历",
    "实习",
    "工作",
    "经历",
    "Experience",
    "Work Experience",
    "Internship",
  ],
  projects: [
    "项目经历",
    "项目经验",
    "项目",
    "科研经历",
    "科研项目",
    "科研",
    "研究经历",
    "研究项目",
    "学术经历",
    "学术成果",
    "科研成果",
    "论文成果",
    "论文发表",
    "论文",
    "课题",
    "竞赛经历",
    "竞赛获奖",
    "竞赛",
    "比赛",
    "Projects",
    "Research",
    "Publications",
  ],
  skills: ["专业技能", "技能特长", "掌握技能", "技术栈", "技能", "Skills"],
  strengths: ["个人优势", "自我评价", "个人总结", "个人亮点", "优势", "亮点", "Strengths", "Summary"],
};

/**
 * 把所有关键词摊平并按长度从长到短排序。
 * 匹配时先试长词，避免"项目经历"被"项目"抢先匹配，把"经历"留在正文里。
 */
const KEYWORD_INDEX: { keyword: string; section: SectionKey }[] = SECTION_ORDER.flatMap((section) =>
  SECTION_KEYWORDS[section].map((keyword) => ({ keyword, section })),
).sort((left, right) => right.keyword.length - left.keyword.length);

/** 标题关键词后面允许跟的分隔符。 */
const HEADING_SEPARATOR = /^[\s：:、，,.\-—|｜]+/;

/** 学历层次在界面上的中文名。 */
export const DEGREE_LABELS: Record<EducationDegree, string> = {
  doctor: "博士",
  master: "硕士",
  bachelor: "本科",
  associate: "专科",
  other: "其他",
};

/** 学历层次的遍历顺序。 */
export const DEGREE_ORDER: EducationDegree[] = ["bachelor", "master", "doctor", "associate", "other"];

/**
 * 学历关键词。顺序有讲究，博士排在最前，
 * 因为"博士研究生"里同时含"博士"和"研究生"，先命中博士才对。
 */
const DEGREE_RULES: { pattern: RegExp; degree: EducationDegree }[] = [
  { pattern: /博士|phd|ph\.d|doctor/i, degree: "doctor" },
  { pattern: /硕士|研究生|专硕|学硕|mba|emba|master/i, degree: "master" },
  { pattern: /本科|学士|bachelor/i, degree: "bachelor" },
  { pattern: /专科|大专|高职/, degree: "associate" },
];

/** 可以单独成词的学历写法。命中就从文字里摘掉，不再当成学校或专业。 */
const STANDALONE_DEGREE_WORDS = [
  "博士",
  "博士研究生",
  "硕士",
  "硕士研究生",
  "研究生",
  "本科",
  "学士",
  "专科",
  "大专",
  "高职",
  "MBA",
  "EMBA",
  "PhD",
];

/**
 * 教育经历里的时间。和经历不同，教育的时间常写在最前面，所以这里从头找第一段时间。
 */
const EDUCATION_PERIOD =
  /(?:19|20)[0-9]{2}\s*[.\-/年]?\s*(?:[0-9]{1,2}\s*月?)?(?:\s*[—–~～\-至到]\s*(?:19|20)[0-9]{2}\s*[.\-/年]?\s*(?:[0-9]{1,2}\s*月?)?)?/;

/** 学业表现，从 GPA 这类词开始抓到下一个标点为止。 */
const PERFORMANCE_PATTERN = /(?:GPA|绩点|均分|平均分|成绩|排名)[^。；;，,\n]{0,24}/gi;

/**
 * 荣誉奖励的特征词。
 *
 * 奖学金、荣誉称号这类东西经常被写进教育段落，但它们不是学历。
 * 命中这些词、又不含学校或学历字样的行，会被挑出来放进荣誉，不参与学历解析。
 */
const HONOR_PATTERN =
  /奖学金|奖助学金|助学金|优秀学生|三好学生|优秀毕业生|优秀班干部|优秀团员|优秀党员|先进个人|标兵|荣誉称号|荣誉证书|嘉奖|表彰/;

/**
 * 出现这些词说明这一行确实在讲学历，不要当成荣誉。
 *
 * 这里只认学历词，不认"大学""学院"这类校名特征词。
 * 因为奖项里也常带这些字，例如"中国国际大学生创新大赛"，
 * 用校名特征词做判断会把整条奖项汇总误判成学历。
 */
const DEGREE_HINT = /本科|硕士|博士|学士|研究生|专硕|学硕|MBA|EMBA|学位|学历/;

/**
 * 学院名。跟在大学或学校后面、以学院结尾的一小段。
 *
 * 用后行断言把"大学"排除在匹配之外，这样摘掉学院时不会把学校名一起切掉。
 * 中间允许有空格，所以"中山大学岭南学院"和"中山大学 岭南学院"都能命中。
 */
const COLLEGE_PATTERN = /(?<=大学|学校)\s*([一-龥A-Za-z]{2,10}学院)/;

/** 段落标题在界面上的中文名。 */
export const SECTION_LABELS: Record<SectionKey, string> = {
  education: "教育",
  honors: "荣誉",
  experiences: "经历",
  projects: "项目",
  skills: "技能",
  strengths: "优势",
};

/**
 * 技能词典。它本身不产生任何条目，只有在原文里确实出现这个词时才计入技能。
 * 所有词都不少于 3 个字符，避免 "R" 这类单字母在全文里大面积误命中。
 */
export const SKILL_DICTIONARY = [
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "C++",
  "SQL",
  "MySQL",
  "R语言",
  "Git",
  "Linux",
  "Excel",
  "Word",
  "PowerPoint",
  "WPS",
  "Office",
  "Tableau",
  "Power BI",
  "Wind",
  "Bloomberg",
  "Stata",
  "SPSS",
  "SAS",
  "MATLAB",
  "财务建模",
  "财务预测",
  "财务报表分析",
  "估值建模",
  "杜邦分析",
  "行业研究",
  "公司研究",
  "尽职调查",
  "财务尽调",
  "招股书",
  "底稿",
  "数据清洗",
  "数据挖掘",
  "数据分析",
  "统计分析",
  "回归分析",
  "因子分析",
  "时间序列",
  "数据可视化",
  "机器学习",
  "深度学习",
  "商业分析",
  "会计准则",
];

/**
 * 技能表述的动词前缀。
 * 简历里常写成"熟练使用 Wind 数据库""熟悉财务报表分析"这种完整句子，
 * 这种整句比单抽出"Wind"更有信息量，所以优先保留原句。
 */
export const SKILL_VERBS = ["熟练", "熟悉", "掌握", "精通", "了解", "会用", "善用", "具备"];

const SKILL_PHRASE = new RegExp(
  `(?:${SKILL_VERBS.join("|")})[^，。；;、\\n]{1,24}`,
  "g",
);

/**
 * 判定论文的关键词。命中任意一个，这条项目经历就算论文。
 * 第一作者、通讯作者、发表于这类词在论文条目里几乎必然出现。
 */
export const PAPER_KEYWORDS = [
  "第一作者",
  "第二作者",
  "第三作者",
  "第四作者",
  "通讯作者",
  "论文",
  "发表于",
  "期刊",
  "收录",
  "会议论文",
  "working paper",
  "CSSCI",
  "SSCI",
  "SCI",
  "EI",
  "DOI",
];

/**
 * 判定竞赛的关键词。
 *
 * 这里故意不收"国家级""省级"这类级别词，因为"国家级课题"是科研项目不是比赛，
 * 收进来会把科研项目误判成竞赛。获奖类词已经足够区分。
 */
export const COMPETITION_KEYWORDS = [
  "竞赛",
  "大赛",
  "比赛",
  "赛事",
  "参赛",
  "获奖",
  "一等奖",
  "二等奖",
  "三等奖",
  "特等奖",
  "优秀奖",
  "金奖",
  "银奖",
  "铜奖",
  "冠军",
  "亚军",
  "季军",
];

/** 项目类型的遍历顺序，用于让结果稳定。 */
export const CATEGORY_ORDER: ExperienceCategory[] = ["project", "paper", "competition"];

/** 项目类型在界面上的中文名。 */
export const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  project: "项目",
  paper: "论文",
  competition: "竞赛",
};

/**
 * 行首的项目符号，例如 - 或者 •。
 *
 * 带符号的行默认按正文处理。但如果去掉符号后正好是段落关键词，那它其实是标题，
 * 这种情况在 matchHeading 里单独处理，所以"◆ 科研竞赛"也能认出来。
 */
const BULLET_PREFIX = /^[-•·*●○◦▪▫■□◆◇★☆‣⁃–—]\s*/;

/**
 * 事项分点用的动作动词。
 *
 * 逗号后面如果跟着这些词，说明是另一件事，可以断成一点。
 * 这样"使用 Wind 整理数据，协助完成周报"会分成两点，
 * 而"协助整理行业数据，用 Excel 完成跟踪"不会分，因为"用"不在表里，
 * 后半句其实是前半句的补充说明。
 */
const ACTION_VERBS = [
  "负责",
  "参与",
  "协助",
  "完成",
  "撰写",
  "整理",
  "分析",
  "搭建",
  "设计",
  "使用",
  "掌握",
  "熟悉",
  "独立",
  "主导",
  "组织",
  "策划",
  "维护",
  "优化",
  "推动",
  "跟进",
  "支持",
  "配合",
  "对接",
  "管理",
  "统筹",
  "编制",
  "核对",
  "收集",
  "输出",
  "制作",
  "运营",
  "调研",
  "测试",
  "开发",
  "研究",
  "执行",
  "汇报",
  "沟通",
  "协调",
  "审核",
  "处理",
  "监控",
  "评估",
  "改进",
  "学习",
  "跟踪",
];

/** 句末标点，出现就断句。 */
const SENTENCE_END = /[。！？；;]+/;

/**
 * 行内的项目符号。PDF 提取经常把好几条事项挤成一行，靠它切开。
 * 这里故意不收间隔号 ·，因为它在中文里也用作分隔符，容易误伤。
 */
const INLINE_BULLET = /[•●○◦▪▫■□◆◇★☆‣⁃]+/;

/**
 * 标签冒号结构，例如"港股IPO行业概览：参与……"。
 *
 * 简历里常见一条事项写成"短标签 + 冒号 + 描述"，冒号后面的分号只是这条内部的层次，
 * 不是另一条事项。命中这个结构就整条保留，不再往下拆。
 * 标签限长 16 字，避免把正文里的冒号误当成标签。
 */
const LABEL_PREFIX = /^[^。！？；;：:，,]{2,16}[：:]/;

/**
 * 行内的序号，例如 ①②③、（1）、1.。
 * 数字前面不能紧跟数字，避免把 "2023.09" 这种日期从中间切开。
 */
const INLINE_NUMBER =
  /[①②③④⑤⑥⑦⑧⑨⑩]|[（(][0-9０-９一二三四五六七八九十]{1,2}[)）]|(?<![0-9０-９])[0-9０-９]{1,2}[.．](?![0-9０-９])/;

/**
 * 行首的序号，例如 "1." "一、" "（1）"。
 *
 * 这里有两条防误伤的约束，缺一不可。
 * 数字最多两位，避免把 "2023.09" 这类日期当成序号切掉。
 * 小数点后面不允许紧跟数字，避免把 "2.5 年经验" 切成 "5 年经验"，那是篡改原文。
 */
const ORDER_PREFIX =
  /^(?:[（(]\s*(?:[0-9０-９]{1,2}|[一二三四五六七八九十]{1,3})\s*[)）]|[0-9０-９]{1,2}\s*[、)）]|[0-9０-９]{1,2}\s*[.．](?![0-9０-９])|[一二三四五六七八九十]{1,3}\s*[、.．)）])\s*/;

/** 显式姓名写法，例如 "姓名：张三"。 */
const NAME_LABEL = /^(?:姓名|名字|Name)\s*[：:]\s*(.+)$/i;

/**
 * 技能段落的行内分隔符。
 * 技能习惯写成 "Python、SQL、Excel" 一行，所以顿号、逗号、分号、斜杠都要拆开。
 * 只有技能会这样拆，教育和经历是整句，不拆。
 */
const SKILL_SEPARATOR = /[、，,；;/／|｜·]+/;

/**
 * 行首日期，例如 "2025.06—2025.09 星河证券"。
 * 有些简历把时间写在最前面。
 */
const TITLE_DATE_PREFIX = /^(?:19|20)[0-9]{2}\s*[.\-年/／]/;

/**
 * 一行里出现完整日期区间，例如 "2026.03-2026.07"、"2023.09 - 2026.06"、"2024年6月-2024年8月"。
 *
 * 这是判断"这行是不是一条新经历"最可靠的信号。
 * 很多简历把时间写在公司名后面，只认行首日期会把后面的经历全吞成第一条的事项。
 * 正文事项里出现完整日期区间的概率很低，所以用这个规则误判很少。
 */
const DATE_RANGE =
  /(?:19|20)[0-9]{2}\s*[.\-/年]?\s*(?:[0-9]{1,2}\s*月?)?\s*[—–~～\-至到]\s*(?:19|20)[0-9]{2}/;

/**
 * 行尾日期，例如 "… 2024.05"、"… 2026.03-2026.07"。
 *
 * 简历条目的常见写法是"名称 + 角色 + 时间"，时间落在最后。
 * 注意和"正文里提到年份"区分开，这里只认行尾，
 * 所以"负责 2023 年度审计底稿整理"不会被误判成标题。
 */
const TRAILING_DATE =
  /(?:19|20)[0-9]{2}\s*(?:[.\-/年]\s*[0-9]{1,2}\s*月?)?(?:\s*[—–~～\-至到]\s*(?:19|20)[0-9]{2}\s*(?:[.\-/年]\s*[0-9]{1,2}\s*月?)?)?\s*$/;

/** 前几行里出现这些词，说明这一行是栏目名而不是人名。 */
const NAME_STOPWORDS = new Set([
  "简历",
  "个人简历",
  "求职简历",
  "中文简历",
  "个人信息",
  "基本信息",
  "联系方式",
  "求职意向",
  "教育背景",
  "教育经历",
  "自我评价",
  "个人优势",
  "专业技能",
  "工作经历",
  "实习经历",
  "项目经历",
  "姓名",
  "电话",
  "手机",
  "邮箱",
  "resume",
  "cv",
]);

const CJK_NAME = /^[一-龥]{2,4}$/;
const LATIN_NAME = /^[A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*){0,3}$/;

/** 姓名只从前 5 行里找。 */
const NAME_SEARCH_LINES = 5;

/** 段落标题行最长字符数。超过这个长度的一定是正文，不是小标题。 */
const MAX_HEADING_LENGTH = 16;

/** 经历标题最长字符数。超过这个长度、又没有日期区间的，按事项处理。 */
const MAX_ENTRY_TITLE_LENGTH = 40;

/** 解析过程中的中间形态。标题还没拆成名称、岗位和时间。 */
type RawEntry = { title: string; bullets: string[] };

/** 从一段文字里逐个找出年月，用于把时间区间拆成起止月份。 */
const PERIOD_TOKEN = /(?:19|20)[0-9]{2}(?:\s*[.\-/年]\s*([0-9]{1,2}))?/g;

/**
 * 归一化文字。
 *
 * PDF 字体的 ToUnicode 映射经常把汉字指到"康熙部首"区（U+2F00–U+2FD5）
 * 或"中日韩部首补充"区（U+2E80–U+2EF3），例如把 人 写成 ⼈、大 写成 ⼤、用 写成 ⽤。
 * 这些字肉眼看着一模一样，码点却不同，会让关键词匹配全部失效，
 * 比如"个⼈优势"匹配不上"个人优势"，整个优势段落就识别不出来。
 *
 * 只对这两个区段做 NFKC 归一，其余字符原样保留，不改动全角标点和正常汉字。
 * 用户从 PDF 阅读器里直接复制文字粘贴过来也会带上这些字符，所以放在公共层处理。
 */
export function normalizeText(text: string): string {
  return text.replace(/[⺀-⻳⼀-⿕]/g, (char) => char.normalize("NFKC"));
}

/**
 * 把简历全文解析成 ResumeData。
 *
 * 第一步按标题把行分到各个段落的桶里，第二步每个段落各自处理。
 */
export function parseResumeText(rawText: string): ResumeData {
  const lines = splitLines(rawText);

  const headingLines = new Map<number, HeadingMatch>();
  lines.forEach((line, index) => {
    const heading = matchHeading(line);
    if (heading) headingLines.set(index, heading);
  });

  const buckets: Record<SectionKey, string[]> = {
    education: [],
    honors: [],
    experiences: [],
    projects: [],
    skills: [],
    strengths: [],
  };

  let currentSection: SectionKey | null = null;
  lines.forEach((line, index) => {
    const heading = headingLines.get(index);
    if (heading) {
      currentSection = heading.section;
      // 标题和内容挤在同一行时，把剩下的部分当作该段的第一行
      if (heading.rest.length > 0) buckets[heading.section].push(heading.rest);
      return;
    }
    if (currentSection) buckets[currentSection].push(line);
  });

  const { education: educationEntries, honors: honorLines } = parseEducation(buckets.education);

  return {
    name: extractName(lines, headingLines),
    education: educationEntries,
    // 荣誉有两个来源，一个是教育段落里被挑出来的奖学金之类，一个是荣誉段落本身。
    // 每行再拆成一条条，一条一个标签。
    honors: unique(
      [...honorLines, ...buckets.honors.map(stripPrefix)]
        .map(stripHonorLabel)
        .flatMap(splitHonorLine)
        .filter((line) => line.length > 0),
    ),
    experiences: parseEntries(buckets.experiences, false),
    projects: parseEntries(buckets.projects, true),
    skills: collectSkills(buckets.skills, rawText),
    strengths: unique(buckets.strengths.map(stripPrefix).filter((entry) => entry.length > 0)),
  };
}

/** 识别到的段落标题，带它归属的字段。 */
export type RecognizedHeading = { text: string; section: SectionKey };

/**
 * 列出识别到的段落标题。
 *
 * 界面上会显示这份清单。如果简历里某个小标题不在其中，说明它没被认出来，
 * 它下面的所有行会归入上一段，这时把那个标题补进 SECTION_KEYWORDS 就能修好。
 * 这个诊断是为了让"标题没认出"这种问题一眼可见，而不是悄悄出错。
 */
export function listRecognizedHeadings(rawText: string): RecognizedHeading[] {
  const result: RecognizedHeading[] = [];

  for (const line of splitLines(rawText)) {
    const heading = matchHeading(line);
    if (heading) result.push({ text: line, section: heading.section });
  }

  return result;
}

/**
 * 找出"看起来像小标题但没被识别"的行。
 *
 * 判据是短、带中文、不含数字、不以句末标点结尾，且不在已识别的标题里。
 * 这个清单只用于提示，不参与解析，所以允许有少量误报，
 * 目的是让"标题没认出来"这件事直接显示在界面上，而不是让人去猜。
 */
export function listSuspectedHeadings(rawText: string): string[] {
  const suspects: string[] = [];

  for (const line of splitLines(rawText)) {
    if (matchHeading(line)) continue;
    if (BULLET_PREFIX.test(line)) continue;

    const text = stripPrefix(line);
    if (text.length < 2 || text.length > 12) continue;
    if (/[0-9０-９]/.test(text)) continue;
    if (!/[一-龥]/.test(text)) continue;
    if (/[。！？，、；：]$/.test(text)) continue;
    // 姓名也会是这种短行，排除掉，避免误报
    if (isPlausibleName(text)) continue;

    suspects.push(text);
  }

  return unique(suspects);
}

/** 统一换行符，压掉多余空白，丢掉空行。 */
function splitLines(rawText: string): string[] {
  return normalizeText(rawText)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** 标题匹配结果。rest 是标题后面同一行里剩下的内容，没有就是空字符串。 */
type HeadingMatch = { section: SectionKey; rest: string };

/**
 * 判断一行是不是段落标题。
 *
 * 支持两种写法。一种是整行等于关键词，例如"项目经历"。
 * 另一种是行首是关键词、后面跟分隔符再接内容，例如"项目经历 《某论文》 第一作者 2024.11-2025.05"。
 * 后者是 PDF 提取时把标题和正文挤到同一行造成的，必须支持，
 * 否则标题认不出来，它下面的内容会整段归到上一段去。
 */
function matchHeading(line: string): HeadingMatch | null {
  const normalized = normalizeHeadingLine(line);
  if (normalized.length === 0) return null;

  const matched = matchKeyword(normalized) ?? matchCompoundHeading(normalized);
  if (matched) return matched;

  // 带项目符号的行，去掉符号后再试一次，但只认"正好等于关键词"这一种。
  //
  // 这里不能走完整的 matchKeyword，否则"• 奖励荣誉：国家奖学金两次，校二等奖学金……"
  // 这种带标签的正文会被当成"关键词加冒号加内容"的标题，
  // 一旦误判成标题，它下面的行会被整段带进错误的段落。
  if (BULLET_PREFIX.test(line)) {
    const withoutBullet = normalizeHeadingLine(line.replace(BULLET_PREFIX, ""));
    if (withoutBullet.length === 0) return null;

    const exact = matchKeyword(withoutBullet);
    return exact && exact.rest.length === 0 ? exact : null;
  }

  return null;
}

/** 拼合标题里允许出现的连接词。 */
const CONNECTOR_CHARS = "与和及、·";

/** 小标题最长字符数。 */
const MAX_COMPOUND_HEADING_LENGTH = 12;

/**
 * 兜底规则：整行由两个以上已知关键词拼成，例如"科研竞赛"是"科研"加"竞赛"，
 * "科研与竞赛"中间夹了个连接词。
 *
 * 要求完整覆盖整行，所以"熟练掌握技能"不会命中，因为"熟练"不是关键词。
 * 要求命中的关键词必须全部指向同一个段落，指向两个段落的（例如"项目与竞赛经历"里的"经历"）
 * 就判为有歧义，不当作标题。
 */
function matchCompoundHeading(normalized: string): HeadingMatch | null {
  if (normalized.length < 4 || normalized.length > MAX_COMPOUND_HEADING_LENGTH) return null;
  if (/[0-9０-９]/.test(normalized)) return null;

  const sections = decompose(normalized.toLowerCase());
  if (!sections || sections.length < 2) return null;

  const distinct = new Set(sections);
  if (distinct.size !== 1) return null;

  return { section: [...distinct][0], rest: "" };
}

/** 把一行拆成若干关键词，拆不动就返回 null。返回每个关键词所属的段落。 */
function decompose(text: string): SectionKey[] | null {
  if (text.length === 0) return [];

  for (const item of KEYWORD_INDEX) {
    const keyword = item.keyword.toLowerCase();
    if (!text.startsWith(keyword)) continue;

    const rest = decompose(text.slice(keyword.length));
    if (rest) return [item.section, ...rest];
  }

  if (CONNECTOR_CHARS.includes(text[0])) {
    return decompose(text.slice(1));
  }

  return null;
}

/** 去掉行首序号、结尾冒号和结尾的括号补充说明。 */
function normalizeHeadingLine(line: string): string {
  return line
    .replace(ORDER_PREFIX, "")
    .replace(/[：:]\s*$/, "")
    // 去掉结尾的括号补充说明，例如"项目经历（论文与竞赛）"要能匹配上"项目经历"
    .replace(/[（(][^）)]*[）)]\s*$/, "")
    .trim();
}

/**
 * 在归一化后的文字里找段落关键词。
 *
 * 三种命中方式。
 * 整行等于关键词，例如"项目经历"。
 * 关键词后面跟分隔符再接内容，例如"项目经历 《某论文》"。
 * 关键词后面直接跟标点，例如"项目经历《某论文》"，这是 PDF 提取时不留空格的常见结果。
 *
 * 第三种要求关键词至少 4 个字，且后面第一个字符不是汉字。
 * 这两条限制是为了让"项目经验丰富"这种正文不会被误判成标题。
 */
function matchKeyword(normalized: string): HeadingMatch | null {
  const lowered = normalized.toLowerCase();

  if (normalized.length <= MAX_HEADING_LENGTH) {
    const exact = KEYWORD_INDEX.find((item) => item.keyword.toLowerCase() === lowered);
    if (exact) return { section: exact.section, rest: "" };
  }

  for (const item of KEYWORD_INDEX) {
    if (!lowered.startsWith(item.keyword.toLowerCase())) continue;
    const tail = normalized.slice(item.keyword.length);
    if (tail.length === 0) continue;

    if (HEADING_SEPARATOR.test(tail)) {
      const rest = tail.replace(HEADING_SEPARATOR, "").trim();
      if (rest.length > 0) return { section: item.section, rest };
      continue;
    }

    if (item.keyword.length >= 4 && !/^[一-龥]/.test(tail)) {
      return { section: item.section, rest: tail.trim() };
    }
  }

  return null;
}

/** 去掉正文行开头的项目符号和序号，保留剩下的原文。 */
function stripPrefix(line: string): string {
  return line.replace(BULLET_PREFIX, "").replace(ORDER_PREFIX, "").trim();
}

/**
 * 把一行事项拆成多个点。
 *
 * 简历里的描述经常被写成一大段，或者 PDF 提取时把几条合并成一行。
 * 这里按三种信号断句。句末标点。行内序号，例如 ①②③ 或 1.。逗号后面跟着动作动词。
 * 逗号那条最保守，只有后半句以"负责""参与"这类词开头才断，
 * 避免把"协助整理数据，用 Excel 完成跟踪"这种补充说明切散。
 */
function splitBulletPoints(text: string): string[] {
  return text
    .split(INLINE_BULLET)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    // 带标签的整条保留，其余再按标点拆
    .flatMap((piece) => (LABEL_PREFIX.test(piece) ? [piece] : splitByPunctuation(piece)));
}

/** 按标点把一段话拆成多个点。 */
function splitByPunctuation(text: string): string[] {
  const rough = text
    .split(SENTENCE_END)
    .flatMap((piece) => piece.split(INLINE_NUMBER))
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);

  return rough.flatMap(splitByActionVerb);
}

/** 在逗号或顿号处断句，但只在后半句以动作动词开头时才断。 */
function splitByActionVerb(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!"，,、".includes(text[index])) continue;

    const rest = text.slice(index + 1).trimStart();
    if (!ACTION_VERBS.some((verb) => rest.startsWith(verb))) continue;

    const piece = text.slice(start, index).trim();
    if (piece.length > 0) pieces.push(piece);
    start = index + 1;
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) pieces.push(tail);

  return pieces.length > 0 ? pieces : [text.trim()];
}

/**
 * 解析教育经历。
 *
 * 带日期的一行算一条学历，没有日期的行归入上一条，通常那是 GPA 或者主修课程。
 */
function parseEducation(lines: string[]): { education: EducationEntry[]; honors: string[] } {
  const education: EducationEntry[] = [];
  const honors: string[] = [];
  let group: string[] = [];

  function flush() {
    if (group.length === 0) return;
    education.push(buildEducationEntry(group));
    group = [];
  }

  for (const line of lines) {
    const text = stripPrefix(line);
    if (text.length === 0) continue;

    // 奖学金、荣誉称号这类不是学历，挑出来单独放
    if (HONOR_PATTERN.test(text) && !DEGREE_HINT.test(text)) {
      honors.push(stripHonorLabel(text));
      continue;
    }

    if (group.length > 0 && EDUCATION_PERIOD.test(text)) flush();
    group.push(text);
  }

  flush();

  return { education, honors };
}

function buildEducationEntry(lines: string[]): EducationEntry {
  const title = lines[0];
  const matched = EDUCATION_PERIOD.exec(title);

  let rest = title;
  let period = "";

  if (matched) {
    period = matched[0];
    rest = `${title.slice(0, matched.index)} ${title.slice(matched.index + period.length)}`;
  }

  const cleaned = rest.replace(/\s+/g, " ").trim();
  const { degree, rest: withoutDegree } = extractDegree(cleaned);
  const { school, college, major } = splitEducation(withoutDegree);
  const { start, end } = parsePeriod(period);

  return {
    degree,
    school,
    college,
    major,
    periodStart: start,
    periodEnd: end,
    performance: extractPerformance(lines.join(" ")),
  };
}

/**
 * 摘出学历层次。
 *
 * 先找能单独成词的学历写法，例如"某大学 会计学 本科"里的"本科"，找到就从文字里去掉，
 * 免得后面把它当成专业。找不到再退一步，从剩下的文字里推断，
 * 例如"某大学 金融专硕"里的"专硕"能推断出硕士，但"专硕"留在专业名里不动。
 */
function extractDegree(text: string): { degree: EducationDegree; rest: string } {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  const kept: string[] = [];
  let degree: EducationDegree = "other";

  for (const token of tokens) {
    const isStandalone =
      degree === "other" &&
      STANDALONE_DEGREE_WORDS.some((word) => word.toLowerCase() === token.toLowerCase());

    if (isStandalone) {
      const rule = DEGREE_RULES.find((item) => item.pattern.test(token));
      if (rule) {
        degree = rule.degree;
        continue;
      }
    }

    kept.push(token);
  }

  if (degree === "other") {
    for (const token of kept) {
      const rule = DEGREE_RULES.find((item) => item.pattern.test(token));
      if (rule) {
        degree = rule.degree;
        break;
      }
    }
  }

  return { degree, rest: kept.join(" ") };
}

/** 教育那一行的字段分隔符。空格之外，简历里还常用竖线，例如"岭南学院｜金融专硕"。 */
const EDUCATION_SEPARATOR = /[\s｜|]+/;

/**
 * 把教育那一行拆成学校、学院、专业。
 *
 * 分两步。
 * 先处理学校和学院连写的情况，例如"中山大学岭南学院"，这种没空格，只靠切分会切不开。
 * 再按分隔符切词，然后看词尾判断归属：带"大学"或"学校"的是学校，以"学院"结尾的是学院，
 * 最后一个词是专业。
 */
function splitEducation(text: string): { school: string; college: string; major: string } {
  let rest = text;
  const parts: string[] = [];

  const concatenated = COLLEGE_PATTERN.exec(rest);
  if (concatenated) {
    parts.push(concatenated[1].trim());
    rest = `${rest.slice(0, concatenated.index)} ${rest.slice(concatenated.index + concatenated[0].length)}`;
  }

  const tokens = rest.split(EDUCATION_SEPARATOR).filter((token) => token.length > 0);

  if (tokens.length === 0) return { school: "", college: parts.join(" "), major: "" };

  const major = tokens.length >= 2 ? tokens[tokens.length - 1] : "";
  const head = tokens.slice(0, tokens.length >= 2 ? -1 : 1);

  let school = "";

  for (const token of head) {
    if (!school && (token.includes("大学") || token.includes("学校"))) {
      school = token;
      continue;
    }
    parts.push(token);
  }

  return { school, college: parts.join(" "), major };
}

/** 荣誉条目之间的分隔符。 */
const HONOR_SEPARATOR = /[，,、；;]+/;

/**
 * 纯计数的汇总片段，例如"七项省级奖项"。
 * 这是对奖项数量的概括，不是一条具体荣誉，拆成标签没有意义。
 */
const HONOR_COUNT_ONLY = /^[0-9０-９一二三四五六七八九十百千]+项/;

/**
 * 行尾的汇总说法，例如"……国家二等奖等共计七项国家级奖项"。
 *
 * 注意"一等奖""二等奖"里也含"等"字，所以只在"等"后面跟着共、计、合计、总计
 * 或者正好到行尾时才截断，避免把奖名切坏。
 */
const HONOR_TAIL = /等(?:\s*(?:共计|合计|总计|共|计).*)?$/;

/**
 * 把一行荣誉拆成一条条，一条一个标签。
 * 一行里常写成"国家奖学金两次，校二等奖学金，三好学生"，拆开更好看也更好改。
 */
function splitHonorLine(text: string): string[] {
  return text
    .split(HONOR_SEPARATOR)
    .map((piece) => piece.trim())
    .map((piece) => piece.replace(HONOR_TAIL, "").trim())
    .filter((piece) => piece.length >= 3 && !HONOR_COUNT_ONLY.test(piece));
}

/**
 * 去掉荣誉行开头的栏目名。
 * 简历里常写成"奖励荣誉：国家奖学金两次……"，前面的栏目名和字段标签重复，去掉更清爽。
 * 只在这个标签正好是荣誉类关键词时才去掉，避免误删正文。
 */
function stripHonorLabel(text: string): string {
  const matched = /^([^：:]{2,16})[：:]\s*/.exec(text);
  if (!matched) return text;

  const label = matched[1].trim().toLowerCase();
  const isSectionName = SECTION_KEYWORDS.honors.some((word) => word.toLowerCase() === label);

  return isSectionName ? text.slice(matched[0].length).trim() : text;
}

/** 从教育段落的文字里抽 GPA、排名这类学业表现。 */
function extractPerformance(text: string): string {
  const found = [...text.matchAll(PERFORMANCE_PATTERN)]
    .map((matched) => matched[0].trim())
    .filter((value) => value.length > 0);

  return unique(found).join("，");
}

/**
 * 解析实习经历或项目经历。
 *
 * 一条经历由标题行和它下面的事项行组成。
 * 判定标题行看三点，带项目符号的一定是事项，含完整日期区间的一定是新标题，
 * 段落里的第一行也一定是标题。
 */
function parseEntries(lines: string[], withCategory: boolean): ExperienceEntry[] {
  const rawEntries: RawEntry[] = [];
  let current: RawEntry | null = null;

  for (const line of lines) {
    const isBullet = BULLET_PREFIX.test(line);
    const entry = stripPrefix(line);
    if (entry.length === 0) continue;

    if (!isBullet && startsNewEntry(entry, current)) {
      if (current) rawEntries.push(current);
      current = { title: entry, bullets: [] };
      continue;
    }

    if (!current) current = { title: "", bullets: [] };
    current.bullets.push(...splitBulletPoints(entry));
  }

  if (current) rawEntries.push(current);

  return uniqueExperiences(rawEntries).map((entry) => buildEntry(entry, withCategory));
}

/** 把中间形态转成最终结构，拆出岗位和时间，项目经历还要打上类型标签。 */
function buildEntry(raw: RawEntry, withCategory: boolean): ExperienceEntry {
  const parts = splitEntryTitle(raw.title);

  return {
    ...(withCategory ? { category: classifyEntry(raw.title, raw.bullets) } : {}),
    title: parts.title,
    role: parts.role,
    periodStart: parts.periodStart,
    periodEnd: parts.periodEnd,
    bullets: raw.bullets,
  };
}

/**
 * 把一条经历的原始标题拆成名称、岗位和时间。
 *
 * 时间优先取行尾的，因为"名称 + 岗位 + 时间"是最常见的写法。
 * 行尾没有才退而求其次找行内的日期区间，避免把正文里顺口提到的年份当时间。
 */
function splitEntryTitle(raw: string): {
  title: string;
  role: string;
  periodStart: string;
  periodEnd: string;
} {
  const matched = TRAILING_DATE.exec(raw) ?? DATE_RANGE.exec(raw);

  let rest = raw;
  let period = "";

  if (matched) {
    period = matched[0];
    rest = `${raw.slice(0, matched.index)} ${raw.slice(matched.index + period.length)}`;
  }

  const { name, role } = splitNameAndRole(rest.replace(/\s+/g, " ").trim());
  const { start, end } = parsePeriod(period);

  return { title: name, role, periodStart: start, periodEnd: end };
}

/**
 * 在第一个括号外的空格处切开，前半是机构或事项名称，后半是岗位。
 *
 * 之所以要跳过括号内的空格，是因为"弗若斯特沙利文（Frost & Sullivan） IPO咨询实习生"
 * 如果按第一个空格切，会把公司名切碎。
 */
function splitNameAndRole(text: string): { name: string; role: string } {
  const openers = "（(《【[";
  const closers = "）)》】]";
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (openers.includes(char)) {
      depth += 1;
    } else if (closers.includes(char)) {
      depth = Math.max(0, depth - 1);
    } else if (char === " " && depth === 0) {
      return { name: text.slice(0, index).trim(), role: text.slice(index + 1).trim() };
    }
  }

  return { name: text.trim(), role: "" };
}

/**
 * 把 "2026.03-2026.07" 这类文字拆成起止日期，统一成 YYYY-MM-DD。
 *
 * 简历一般只写到月份，日期一律补 01，用户可以自己改。
 * 只写年份没有月份的场合会留空，因为补一个月份等于编数据。
 */
function parsePeriod(text: string): { start: string; end: string } {
  if (text.length === 0) return { start: "", end: "" };

  const dates: string[] = [];

  for (const matched of text.matchAll(PERIOD_TOKEN)) {
    const month = matched[1];
    if (!month) continue;
    dates.push(`${matched[0].slice(0, 4)}-${month.padStart(2, "0")}-01`);
  }

  return { start: dates[0] ?? "", end: dates[1] ?? "" };
}

/**
 * 判断一条项目经历属于论文、竞赛还是普通项目。
 * 先看标题，标题没有线索再看下面的事项，两边都没有就按普通项目处理。
 */
function classifyEntry(title: string, bullets: string[]): ExperienceCategory {
  return classifyText(title) ?? classifyText(bullets.join(" ")) ?? "project";
}

function classifyText(text: string): ExperienceCategory | null {
  if (text.length === 0) return null;

  const lowered = text.toLowerCase();
  if (PAPER_KEYWORDS.some((word) => lowered.includes(word.toLowerCase()))) return "paper";
  if (COMPETITION_KEYWORDS.some((word) => lowered.includes(word.toLowerCase()))) return "competition";
  return null;
}

/** 判断一个非项目符号行是不是新经历的标题。 */
function startsNewEntry(entry: string, current: RawEntry | null): boolean {
  if (DATE_RANGE.test(entry)) return true;
  if (TITLE_DATE_PREFIX.test(entry)) return true;
  if (TRAILING_DATE.test(entry)) return true;
  if (!current) return entry.length <= MAX_ENTRY_TITLE_LENGTH;
  return false;
}

/** 技能段落：一行里可能用顿号分隔多个技能，先拆再收集。 */
function parseSkills(lines: string[]): string[] {
  const skills: string[] = [];

  for (const line of lines) {
    const entry = stripPrefix(line);
    if (entry.length === 0) continue;

    for (const part of entry.split(SKILL_SEPARATOR)) {
      const value = part.trim();
      if (value.length > 0) skills.push(value);
    }
  }

  return skills;
}

/** 姓名：先看有没有"姓名："写法，再从前几行里找第一个像人名的短行。找不到返回空字符串。 */
function extractName(lines: string[], headingLines: Map<number, HeadingMatch>): string {
  const limit = Math.min(lines.length, NAME_SEARCH_LINES);

  for (let index = 0; index < limit; index += 1) {
    const matched = NAME_LABEL.exec(lines[index]);
    if (!matched) continue;
    const picked = pickName(matched[1]);
    if (picked) return picked;
  }

  for (let index = 0; index < limit; index += 1) {
    if (headingLines.has(index)) continue;
    const picked = pickName(lines[index]);
    if (picked) return picked;
  }

  return "";
}

/**
 * 一行里可能有多个字段，用竖线隔开，例如 "张三 | 某银行 | 数据分析实习"。
 * 只按竖线切分，不按斜线切分，避免把 "金融/会计" 里的"金融"当成人名。
 */
function pickName(candidate: string): string {
  for (const part of candidate.split(/[|｜]/)) {
    const value = part.trim();
    if (isPlausibleName(value)) return value;
  }
  return "";
}

/** 看起来像人名才接受：中文 2 到 4 个字，或者最多 4 个单词的拉丁文姓名，且不含数字和联系方式符号。 */
function isPlausibleName(value: string): boolean {
  if (value.length === 0 || value.length > 20) return false;
  if (NAME_STOPWORDS.has(value.toLowerCase())) return false;
  if (/[0-9]/.test(value)) return false;
  if (/[@：:|｜，,。;；、()（）[\]【】]/.test(value)) return false;
  return CJK_NAME.test(value) || LATIN_NAME.test(value);
}

/**
 * 汇总技能，三个来源按优先级合并。
 *
 * 一是技能段落本身，二是全文里"熟练使用 Wind 数据库"这种完整表述，
 * 三是词典里被原文提到的单个词。
 *
 * 第三步会跳过已经被前两步覆盖的词，所以有了"熟练使用 Wind 数据库"就不会再单独加一个"Wind"。
 */
function collectSkills(skillLines: string[], rawText: string): string[] {
  const merged = [...parseSkills(skillLines), ...collectSkillPhrases(rawText)];

  const bareTerms = collectDictionaryHits(rawText).filter(
    (term) => !merged.some((item) => item.toLowerCase().includes(term.toLowerCase())),
  );

  return unique([...merged, ...bareTerms]);
}

/** 从全文里抽"熟练使用 Wind 数据库"这类完整表述，只保留确实含词典词的句子。 */
function collectSkillPhrases(rawText: string): string[] {
  const phrases: string[] = [];

  for (const matched of rawText.matchAll(SKILL_PHRASE)) {
    const phrase = matched[0].trim();
    if (phrase.length === 0) continue;
    if (!SKILL_DICTIONARY.some((term) => findTermIndex(phrase, term) >= 0)) continue;
    phrases.push(phrase);
  }

  return phrases;
}

/** 技能词典命中：只收集原文里真实出现的词，并按它们在原文中第一次出现的位置排序。 */
function collectDictionaryHits(rawText: string): string[] {
  const hits: { term: string; index: number }[] = [];

  for (const term of SKILL_DICTIONARY) {
    const index = findTermIndex(rawText, term);
    if (index >= 0) hits.push({ term, index });
  }

  return hits.sort((left, right) => left.index - right.index).map((hit) => hit.term);
}

/** 用词边界匹配，避免 "Word" 命中 "Password" 这类情况。 */
function findTermIndex(rawText: string, term: string): number {
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, "i");
  const matched = pattern.exec(rawText);
  return matched ? matched.index + matched[1].length : -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去重，保留第一次出现的顺序，忽略大小写差异。 */
function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim();
    if (value.length === 0) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

/**
 * 经历去重。标题去重，标题相同的经历合并，各自 bullets 去重并集。
 * 标题为空但 bullets 非空的条目保留，避免用户手动加了 bullet 没写标题时内容丢失。
 */
function uniqueExperiences(items: RawEntry[]): RawEntry[] {
  const result: RawEntry[] = [];
  const titleIndex = new Map<string, number>();

  for (const entry of items) {
    const title = entry.title.trim();
    const bullets = unique(entry.bullets);

    if (title.length === 0) {
      result.push({ title, bullets });
      continue;
    }

    const key = title.toLowerCase();
    const existing = titleIndex.get(key);
    if (existing === undefined) {
      titleIndex.set(key, result.length);
      result.push({ title, bullets });
    } else {
      result[existing].bullets = unique([...result[existing].bullets, ...bullets]);
    }
  }

  return result;
}
