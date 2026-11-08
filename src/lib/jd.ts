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

/** 含这些词的片段多半是整句描述，不是技能名。 */
const VAGUE_KEYWORD = /较|很|非常|十分|能够|可以|接受|具备|良好|一定/;

/**
 * 职责行的开头动词。只在没写分区标题、只能逐行猜的时候用。
 * 不带"分析""研究""设计"这类两头都能用的词：它们也常出现在要求行开头（"分析能力强"）。
 */
const DUTY_PREFIX =
  /^(负责|参与|协助|承担|跟进|完成|支持|推动|对接|配合|跟踪|撰写|整理|收集|编制|制作|推进|执行|维护|输出|开展|策划|组织|协调|处理|录入|归档|汇报)/;

/** 要求行的特征词。 */
const REQUIRE_HINT =
  /(任职资格|岗位要求|任职要求|职位要求|要求如下|优先|熟悉|掌握|了解|精通|具备|学历|本科|硕士|博士|经验|专业|CET|英语)/;

/**
 * 到岗时间、实习时长、每周出勤这类"排期"要求。
 * 只回答什么时候到岗、能干多久、一周来几天，别的都归到"其他信息"去。
 * 判定见 isScheduleLine：光出现"实习期"这种词不算数，
 * 否则"实习期间表现优异可转正"也会被塞进排期栏。
 */
const SCHEDULE_START = /(到岗|上岗|报到|开始实习|开始工作|入职时间|入职日期)/;

/** 本身就说明时长的说法，出现即算。 */
const SCHEDULE_DURATION = /(长期实习|短期实习|连续实习|可实习|实习时长|实习期限|出勤|坐班|每周|每星期|一周)/;

/** 时间量，例如 3个月、每周3天。 */
const SCHEDULE_AMOUNT = /\d+\s*(?:个?\s*月|周|天|年|次|小时)/;

/** 时间量要挂在讲实习、上班的句子上才算排期。 */
const SCHEDULE_ANCHOR = /(实习|工作|上班|作息|排班|时间|到岗|入职|起|开始|上旬|中旬|下旬)/;

/**
 * 一天的上下班时段，例如 9:00-18:00。
 * 光有时刻不算，得挂在上班、作息这类说法上，
 * 免得把"面试时间：14:00-17:00"当成排期要求。
 */
const SCHEDULE_HOURS =
  /(?:上班|下班|作息|办公|坐班|考勤|工作).{0,6}?\d{1,2}\s*[:：]\s*\d{2}\s*[-—~～至到]\s*\d{1,2}\s*[:：]\s*\d{2}|朝九晚六/;

/**
 * 投递方式、简历命名、联系地址这类内容跟排期无关。
 * 这些句子经常自带"可实习""时长"之类的词（例如"命名格式：姓名-学校-可实习时长"），
 * 会骗过下面的判定，所以先一票否决。
 */
const DELIVERY_HINT =
  /(投递|简历命名|命名格式|命名要求|邮件主题|邮件标题|邮件名|发送至|发至|简历请|联系方式|联系电话|联系人|邮箱|@|地址|邮编|网址|链接|二维码|扫描)/;

/**
 * 这条要求是不是在讲什么时候到岗、能干多久、一周来几天。
 * 宁可判得严一点：判不出来的落到"其他信息"，也别硬塞进排期栏。
 */
function isScheduleLine(line: string): boolean {
  if (DELIVERY_HINT.test(line)) return false;

  if (SCHEDULE_START.test(line) || SCHEDULE_DURATION.test(line) || SCHEDULE_HOURS.test(line)) {
    return true;
  }

  return SCHEDULE_AMOUNT.test(line) && SCHEDULE_ANCHOR.test(line);
}

/**
 * 一句话里用逗号连着排期和别的事情时，按逗号拆开分别归栏。
 *
 * 只在"排期加非排期"混着的时候拆："一周现场实习4天以上，有实习补贴"要拆成两条，
 * 否则补贴跟着排期跑。全是个人条件的不拆，"工作细致踏实，积极主动，沟通能力强"
 * 拆了反而碎成三截。拆的时候同类相邻的还合并回去，
 * "国内在校本科或硕士研究生，专业不限，一周现场实习4天以上"只断一刀。
 */
function splitScheduleMix(line: string): string[] {
  const parts = line
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  if (parts.length < 2) return [line];

  const kindOf = (text: string) =>
    isScheduleLine(text) ? "schedule" : ABILITY_HINT.test(text) ? "ability" : "other";

  const kinds = parts.map(kindOf);
  if (!kinds.includes("schedule") || kinds.every((kind) => kind === "schedule")) return [line];

  const groups: { kind: string; text: string }[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const last = groups[groups.length - 1];
    if (last && last.kind === kinds[index]) last.text += `，${parts[index]}`;
    else groups.push({ kind: kinds[index], text: parts[index] });
  }

  return groups.map((group) => group.text);
}

/**
 * 对个人条件的硬要求：能力、经历、技能、学历、性格这些。
 * 只认这类词，认不出来的一律进"其他信息"，免得把福利待遇、工作内容混进能力清单。
 */
const ABILITY_HINT =
  /(能力|经验|经历|技能|素质|性格|学历|学位|专业|本科|硕士|博士|专科|研究生|院校|成绩|GPA|排名|证书|资格|CPA|CFA|FRM|ACCA|英语|四级|六级|雅思|托福|GRE|GMAT|CET|熟练|掌握|精通|熟悉|了解|具备|擅长|沟通|表达|写作|逻辑|分析|抗压|学习|团队|协作|责任心|细致|严谨|主动|勤奋|踏实|有志|志向|热情|热爱|认同|兴趣|愿意|意愿|理解|价值观)/;

/**
 * JD 里的分区标题。招聘贴通常用【职位描述】和【职位要求】把内容分成两段，
 * 按这个切比逐行猜准得多。
 */
const JD_SECTION_MARKERS: { pattern: RegExp; kind: "duty" | "req" | "none" }[] = [
  { pattern: /职位描述|岗位描述|工作内容|岗位职责|工作职责|职责描述|你将做什么/, kind: "duty" },
  { pattern: /职位要求|任职要求|岗位要求|任职资格|招聘要求|申请要求|资格条件|我们希望你/, kind: "req" },
  // 投递方式、联系方式不是任职要求，遇到就把当前分区关掉，别让后面的内容混进来
  { pattern: /申请方式|投递方式|应聘方式|投递方法|简历投递|联系方式/, kind: "none" },
];

/**
 * 分区里的小标题，例如"实习安排""岗位说明"。
 * 它本身不是一条要求，收进列表里会变成一条莫名其妙的内容。
 *
 * 整串匹配，前面只允许接一个限定词，所以"能接受出差安排"这种真要求不会被误伤。
 */
const JD_SUBHEADING =
  /^(?:实习|工作|岗位|职位|项目|其他|应聘|任职|招聘|面试|福利|待遇|薪资|时间|入职|到岗|简历|投递|加分)?(?:安排|说明|条件|描述|职责|要求|内容|信息|流程|方式|时间|地点|概况|须知)$/;

/** 条目开头的序号，例如 "1." "1、" "（1）"。 */
const JD_ITEM_PREFIX = /^[0-9０-９]{1,2}\s*[.、．)）]\s*/;

/**
 * 去掉条目开头残留的序号。
 *
 * 原文常写成"1. 参与…"，解析时已经剥过一道，但模型返回的要求里也可能带。
 * 界面上是按顺序重新编号的，留着原文的序号会出现"2. 2. 跟踪市场动态"这种。
 */
export function stripItemOrdinal(text: string): string {
  return text.replace(JD_ITEM_PREFIX, "").trim();
}

/** 公司后缀。正文里也可能出现，所以只算一个信号，不单独定案。 */
const LAYOUT_COMPANY = /(有限责任公司|股份有限公司|有限公司|集团|事务所)/;

/** 招几个人，例如"招日常实习生1名"。 */
const LAYOUT_HIRING = /招\s*[^，。；\n]{0,12}?\d+\s*(?:名|人|位)/;

/** 地点标签。 */
const LAYOUT_PLACE = /(?:工作地点|办公地点|上班地点|工作城市)\s*[:：]/;

/** 待遇标签。 */
const LAYOUT_PAY = /(?:薪资|薪酬|待遇|日薪|月薪|工资|报酬|补贴|福利|五险一金)\s*[:：]/;

/** 投递和联系方式的说法。 */
const LAYOUT_CONTACT =
  /(?:投递|简历命名|命名格式|联系方式|联系电话|联系人|邮箱|发送至|发至|邮编)/;

/**
 * 这行是不是招聘贴的版式行：标题行、招几人、工作地点、薪资待遇、投递方式。
 *
 * 版式行既不是工作内容，也不是对应聘者的要求，两个栏目都不该收。
 * 公司后缀和投递字样在正文里也常出现（"协助基金经理"就含"基金"），
 * 所以这两样要凑够两个信号才算数；招几人、地点、薪资这些标签本身就够独特，一个就够。
 */
function isLayoutLine(line: string): boolean {
  if (LAYOUT_HIRING.test(line) || LAYOUT_PLACE.test(line) || LAYOUT_PAY.test(line)) return true;

  const signals = [LAYOUT_COMPANY, LAYOUT_CONTACT].filter((pattern) => pattern.test(line)).length;
  return signals >= 2;
}

/**
 * 一条里挤了好几件事时按句拆开，逐句归栏。
 *
 * 只按句号和分号拆，逗号不拆：逗号一拆，"参与项目执行，包括研究、撰写底稿"就碎成三截了。
 * 不拆的话，"本科以上学历，有 CPA 优先，一周来 4 天，有实习补贴"整句只能归到一栏，
 * 另外几件事就跟着跑错地方。
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[。；;]/)
    .map((part) => part.replace(JD_ITEM_PREFIX, "").trim())
    .filter((part) => part.length >= 4);
}

/** 邮箱。 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 【……】形式的方括号块，招聘贴常用来放标题行和命名格式。 */
const BRACKET_BLOCK = /【([^】]{2,60})】/g;

/** 看起来像简历命名格式的块，例如"姓名_学校_毕业年份_可工作时长"。 */
const NAMING_HINT = /姓名|学校|毕业|到岗|时长|岗位|专业/;

/** 正文里带标签的命名格式，例如"简历命名格式：姓名-学校-专业"。 */
const NAMING_LABELED =
  /(?:简历命名格式|简历命名要求|简历命名形式|邮件标题命名形式|邮件标题命名格式|邮件命名格式|邮件命名|邮件主题|命名格式|命名形式|简历名称|简历格式)\s*[:：]\s*([^\n。；;]{4,80})/;

/** 硬性条件，单独挑出来提醒。 */
const HARD_HINT = /(CPA|CFA|FRM|Python|SQL|Java|C\+\+|Excel|PPT|VBA|Wind|Choice|Bloomberg|彭博|四级|六级|雅思|托福|GRE|GMAT|本科|硕士|博士|经验|证书)/;

export type JDKeyword = { k: string; n: number };

export type JDAnalysis = {
  keywords: string[];
  duties: string[];
  /** 任职要求。按求职者关心的点分成三堆，不属于前两堆的一律进 other。 */
  reqs: {
    /** 对个人条件的硬要求：能力、经历、技能、学历、性格。 */
    ability: string[];
    /** 到岗时间、实习时长、每周出勤。 */
    schedule: string[];
    /** 福利待遇、工作内容这类，既不是个人条件也不是排期。 */
    other: string[];
  };
  hard: string[];
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

/**
 * 要求条目去重。
 *
 * 同一句话可能从两个地方进来：分区切出来的带句号，正则抓「优先」抓到的没有句号。
 * 直接比字符串会留下两条，所以比之前先把结尾标点抹掉。
 */
function uniqueReqs(lines: string[]): string[] {
  const trim = (value: string) => value.replace(/[。．.；;，,、\s]+$/, "");
  const result: string[] = [];

  for (const line of lines) {
    const key = trim(line);
    if (key.length === 0) continue;
    // 原文里同一句写了两遍、或一条完整包含另一条时，只留先出现的
    const duplicated = result.some((existing) => {
      const existingKey = trim(existing);
      return existingKey === key || existingKey.includes(key) || key.includes(existingKey);
    });
    if (duplicated) continue;
    result.push(line);
  }

  return result;
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
      for (const sentence of splitSentences(line)) {
        if (isLayoutLine(sentence)) continue;
        if (DUTY_PREFIX.test(sentence)) duties.push(sentence);
        if (REQUIRE_HINT.test(sentence)) reqs.push(sentence);
      }
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
      // 超过 6 个字的多半是整句，不是技能词；带程度副词的也不是。
      if (part.length < 2 || part.length > 6) continue;
      if (VAGUE_KEYWORD.test(part)) continue;
      if (!counted.some((item) => item.k === part)) counted.push({ k: part, n: 1 });
    }
  }

  counted.sort((left, right) => right.n - left.n);
  const keywords = counted.slice(0, 18).map((item) => item.k);
  const hard = keywords.filter((word) => HARD_HINT.test(word));

  // 「优先」「加分」的条目不再单独成段，原文照搬并进任职要求里
  const preferred = (text.match(/[^。\n]*(?:优先|加分|best|plus)[^。\n]*/gi) ?? [])
    .map((line) => line.trim().replace(/^[·•\-—\d.、)）\s]+/, ""))
    .filter((line) => line.length > 3);

  const info = extractJDInfo(text);

  // 投递信息里已经写过的内容，就从任职要求里去掉，同一件事不在页面上出现两次
  const allReqs = uniqueReqs([...reqs, ...preferred]).filter((line) => !isCoveredByInfo(line, info));

  const reqs_ability: string[] = [];
  const reqs_schedule: string[] = [];
  const reqs_other: string[] = [];

  for (const line of allReqs) {
    for (const item of splitScheduleMix(line)) {
      if (isScheduleLine(item)) reqs_schedule.push(item);
      else if (ABILITY_HINT.test(item)) reqs_ability.push(item);
      else reqs_other.push(item);
    }
  }

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
    reqs: {
      ability: reqs_ability.slice(0, 10),
      schedule: reqs_schedule.slice(0, 6),
      other: reqs_other.slice(0, 8),
    },
    hard: unique(hard),
    info,
    match: { score, hits, partial, missing },
  };
}

/** 招聘贴里能直接抄下来用的投递信息。 */
export type JDInfo = {
  company: string;
  title: string;
  /** 城市，粗粒度，例如 深圳。 */
  city: string;
  /** 详细办公地址，比城市细，例如 深圳市南山区科技园。 */
  workplace: string;
  /** 什么时候开始工作，以及每天的上下班时间。 */
  workTime: string;
  email: string;
  /** 简历命名格式，例如 姓名_学校_毕业年份_可工作时长_最快到岗时间。 */
  namingFormat: string;
};

/**
 * 这条要求是不是已经在投递信息里写过了。
 *
 * 判断办法：里面出现了投递信息的某个字段，而且把那个字段挖掉之后剩下的内容很短，
 * 说明这条讲的就是那件事，删掉。剩下的还多，说明它另有内容，保留。
 *
 * 工作时间不参与去重：它和"到岗与时长要求"讲的是同一件事，两处都要写全，
 * 去重反而会把排期栏里的条目清空。
 */
function isCoveredByInfo(line: string, info: JDInfo): boolean {
  // 工作地点可能是几段拼起来的，拆开逐段比，否则原文只出现其中一段就比不中
  const fields = [info.city, info.workplace, info.email, info.namingFormat]
    .flatMap((field) => field.split(/[，,、；;]/))
    .map((field) => field.trim())
    .filter((field) => field.length >= 2);

  return fields.some((field) => {
    const at = line.indexOf(field);
    if (at < 0) return false;

    const rest = line.slice(0, at) + line.slice(at + field.length);
    return stripLabels(rest).length < 8;
  });
}

/** 挖掉字段之后剩下的常常只是个标签，例如"邮件及简历命名格式："。标签不算内容。 */
function stripLabels(text: string): string {
  return text
    .replace(
      /(简历|邮件|命名|格式|投递|发送|邮箱|地址|地点|城市|时间|要求|说明|备注|请|及|和|的|为|是|在)/g,
      "",
    )
    .replace(/[\s，,。.；;：:、（）()【】[\]]/g, "");
}

/** 详细办公地址。比城市细，所以要有明确的标签才认，免得把城市当成地址。 */
const WORKPLACE_PATTERN =
  /(?:工作地点|办公地点|工作地址|办公地址|上班地点|上班地址|公司地址)\s*[:：]\s*([^\n。；;】]{2,40})/;

/**
 * 门牌号级别地址的特征词。
 * 只写到城市或城区的（"工作地点：广州"）没有这些词，那不算详细地址，当城市用。
 */
const WORKPLACE_DETAIL = /(路|街|道|巷|号|园|区|大厦|广场|中心|楼|层|室|栋|座)/;

/** 带标签的工作时间。 */
const WORK_TIME_LABELED =
  /(?:工作时间|上班时间|作息时间|实习时间|开始时间|到岗时间|入职时间)\s*[:：]\s*([^\n。；;】]{2,40})/;

/** 方括号里的时间，例如【时间：10月起】。 */
const WORK_TIME_BRACKET = /【\s*(?:时间|工作时间|实习时间)\s*[:：]\s*([^】]{2,40})】/;

/** 一天里的上下班时间，例如 9:00-18:00。 */
const WORK_TIME_HOURS = /\d{1,2}\s*[:：]\s*\d{2}\s*[-—~～至到]\s*\d{1,2}\s*[:：]\s*\d{2}/;

/** 时刻区间得挂在这类说法上才算上班时间，免得把"面试时间14:00-17:00"当成工作时间。 */
const WORK_TIME_CONTEXT = /(上班|下班|作息|工作时间|办公时间|坐班|考勤)/;

/** 实习多久，例如"连续实习3个月以上"；也认整段的起止年月。 */
const WORK_TIME_DURATION =
  /(?:连续|可)?实习(?:期|时间|时长|期限)?\s*(?:为|是)?\s*(?:至少|不少于|不低于)?\s*\d+\s*(?:个)?月(?:以上|以内|左右|起)?|\d{4}\s*年\s*\d{1,2}\s*月\s*[-—~～至到]\s*\d{4}\s*年\s*\d{1,2}\s*月/;

/** 一周来几天，例如"每周到岗4天""一周3天"，"4天以上"里的"以上"也要带上。 */
const WORK_TIME_ATTENDANCE = /(?:每周|每星期|一周)[^，。；\n]{0,8}?\d+\s*天(?:以上|以内|左右)?/;

/**
 * 把到岗时间、每天的上下班时间、实习多久、一周来几天拼成一句。
 * 原文没写就返回空字符串，交给页面显示"—"，不要拿别的句子凑。
 *
 * 实习时长和出勤天数和"到岗与时长要求"栏讲的是同一件事，两处都写全，不去重。
 */
function extractWorkTime(raw: string): string {
  const labeled =
    WORK_TIME_LABELED.exec(raw)?.[1]?.trim() ?? WORK_TIME_BRACKET.exec(raw)?.[1]?.trim() ?? "";

  const parts = [labeled];

  for (const line of raw.split(/\n+/)) {
    if (!WORK_TIME_CONTEXT.test(line)) continue;

    const hours = WORK_TIME_HOURS.exec(line)?.[0]?.trim();
    if (hours && !parts.some((part) => part.includes(hours))) parts.push(hours);
    break;
  }

  for (const pattern of [WORK_TIME_DURATION, WORK_TIME_ATTENDANCE]) {
    const found = pattern.exec(raw)?.[0]?.trim();
    if (found && !parts.some((part) => part.includes(found))) parts.push(found);
  }

  return parts.filter(Boolean).join("，");
}

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
      current = marker.kind === "none" ? null : marker.kind;
      if (!current) continue;
      // 标题和第一条挤在一行时，把后面的内容也收进来
      const rest = stripped.replace(marker.pattern, "").replace(/^[】\]\s:：]+/, "").trim();
      if (rest.length >= 4) pushItems(current === "duty" ? duties : reqs, rest);
      continue;
    }

    if (!current) continue;

    const item = line.replace(JD_ITEM_PREFIX, "").trim();
    if (item.length < 4) continue;

    pushItems(current === "duty" ? duties : reqs, item);
  }

  return { duties, reqs };
}

/**
 * 把一行收进列表。
 *
 * 先按句拆开，一条里混着的几件事才能各归各的；再逐句剔掉小标题和版式行。
 * 只按整行判的话，"本科以上学历，有 CPA 优先，一周来 4 天"会整句进同一栏。
 */
function pushItems(target: string[], line: string): void {
  for (const sentence of splitSentences(line)) {
    // "实习安排"这类小标题跳过，下面的条目继续归到当前分区
    if (JD_SUBHEADING.test(sentence)) continue;
    if (isLayoutLine(sentence)) continue;
    target.push(sentence);
  }
}

/**
 * 公司名简称前面挂着的动词。
 *
 * "协助基金经理跟踪行业数据"里的"基金"是"基金经理"的一半，不是公司后缀，
 * 光靠后缀匹配会切出"协助基金"这种假公司名。判断办法是看后缀前面那两个字的开头，
 * 是动词就说明这是个动宾短语，跳过，接着往后找。
 */
const COMPANY_VERB_HEAD =
  /^(?:协助|参与|负责|跟踪|配合|支持|加入|了解|熟悉|完成|推动|对接|从事|进行|开展|执行|提供|整理|撰写|收集|维护|准备)/;

/** 后缀型公司名，简称那几种要逐个出现的位置去试，第一个不一定是。 */
const COMPANY_SHORT_SUFFIX = /(集团|银行|证券|基金|事务所)/g;

/**
 * 正文里兜底找公司名。
 *
 * 带"有限公司"字样的直接认；"证券""基金"这类简称要防两种切错：
 * 后缀前面是动词，或者后缀前面根本没有名字（"基金经理"里没有公司）。
 */
function fallbackCompany(raw: string): string {
  const strong = /([一-龥A-Za-z]{2,20}(?:有限责任公司|股份有限公司|有限公司))/.exec(raw)?.[1];
  if (strong) return strong.trim();

  for (const matched of raw.matchAll(COMPANY_SHORT_SUFFIX)) {
    const end = matched.index ?? 0;
    const before =
      raw
        .slice(Math.max(0, end - 20), end)
        .match(/[一-龥A-Za-z]{2,20}$/)?.[0]
        ?.trim() ?? "";

    if (!before || COMPANY_VERB_HEAD.test(before)) continue;
    return `${before}${matched[1]}`;
  }

  return "";
}

/** 岗位名后缀。同样要防"协助基金经理"这种动宾被切成岗位名。 */
const TITLE_SUFFIX = /(实习生|分析师|研究员|经理|管培生|工程师|顾问|专员|主管)/g;

function fallbackTitle(raw: string): string {
  for (const matched of raw.matchAll(TITLE_SUFFIX)) {
    const end = matched.index ?? 0;
    const before =
      raw
        .slice(Math.max(0, end - 16), end)
        .match(/[一-龥A-Za-z]{2,16}$/)?.[0]
        ?.trim() ?? "";

    if (!before || COMPANY_VERB_HEAD.test(before)) continue;
    return `${before}${matched[1]}`;
  }

  return "";
}

/** 岗位名尾巴上的版式词，"债券业务实习生招聘"里的"招聘"不是岗位名的一部分。 */
const TITLE_TAIL = /(?:招聘|招募|招人|急招|急聘|诚聘|招聘中|招聘信息)+$/;

/**
 * 岗位名开头的版式词，"急招数据分析实习生"里的"急招"不是岗位名的一部分。
 * 这里故意不收"招聘"：那是真的岗位名，"招聘专员"去掉"招聘"就只剩"专员"了。
 */
const TITLE_HEAD = /^(?:急招|急聘|诚聘|高薪聘请)+/;

/** 方括号里可能装的是【地点：深圳】这类字段，不是标题行，挑标题时要跳过。 */
const BRACKET_FIELD =
  /^(?:地点|城市|工作地点|办公地点|base|时间|工作时间|薪资|待遇|邮箱|投递|联系方式|公司名称|公司名|公司|招聘人数|截止日期|招聘岗位|岗位名称|职位名称|岗位|职位)\s*(?:[:：]|$)/i;

/** 公司名和岗位名的字段标签，长的写在前面，避免"公司"抢先匹配"公司名称"。 */
const COMPANY_LABELS = "公司名称|公司名|公司";
const TITLE_LABELS = "招聘岗位|岗位名称|职位名称|岗位|职位";

/**
 * 读带字段标签的值，支持两种写法：
 * 【公司名称】华泰证券 —— 值在括号后面
 * 【公司：华泰证券】 —— 值在括号里面
 */
function readLabeledField(raw: string, labels: string): string {
  const inside = new RegExp(`【\\s*(?:${labels})\\s*[:：]\\s*([^【】\\n]+?)\\s*】`).exec(raw)?.[1];
  const after = new RegExp(`【\\s*(?:${labels})\\s*】\\s*[:：]?\\s*([^\\n【】]+)`).exec(raw)?.[1];
  return (inside ?? after ?? "").trim();
}

/**
 * 转发、扩散这类字眼。
 *
 * 招聘贴常在开头写"帮转""求扩散"，它们既不是公司名也不是岗位名。
 * 标题行以前直接取方括号里的第一段，遇上【帮转】就把"帮转"当成了公司名。
 */
const FORWARD_WORD = /帮转|求转|代转|帮忙转|帮转一下|转发|扩散|转需|帮发|转起|求扩散|帮忙扩散/;

/** 开头挂着的转发字眼，连同它后面的冒号顿号一起剥掉。 */
const FORWARD_LEAD = new RegExp(`^(?:${FORWARD_WORD.source})[\\s:：,，、。.!！?？~～—\\-]*`);

/** 结尾挂着的转发字眼。 */
const FORWARD_TAIL = new RegExp(`[\\s:：,，、。.!！？~～—\\-]*(?:${FORWARD_WORD.source})$`);

/**
 * 把一段标题文字里夹带的转发字眼剥掉。
 *
 * 剥完可能是空串（"帮转"本身就只剩这些字），调用方要按空串处理。
 * 反复剥几轮是因为前后可能各挂一个，写成"帮转 转发"。
 */
function stripForward(text: string): string {
  let result = text.trim();
  for (let round = 0; round < 3; round += 1) {
    const next = result.replace(FORWARD_LEAD, "").replace(FORWARD_TAIL, "").trim();
    if (next === result) break;
    result = next;
  }
  return result;
}

/** 这一段是不是在写岗位名。 */
function looksLikeTitle(part: string): boolean {
  return /实习|分析|研究|经理|管培|工程|顾问|运营|产品|招聘/.test(part);
}

/** 公司名后缀。标题行里靠它认出哪一段是公司。 */
const COMPANY_TAIL =
  /(有限责任公司|股份有限公司|有限公司|公司|集团|控股|银行|证券|基金|信托|保险|资管|资产管理|资本|创投|投资|事务所|研究院|研究所|科技|实业|传媒|地产|教育|医疗|咨询|会计|律所)$/;

/**
 * 这一段像不像公司名。
 *
 * 标题行通常写成"公司_岗位_城市"，但顺序不保证，开头还可能挂着"帮转"，
 * 所以不能直接拿第一段当公司。带公司后缀的定案；没后缀的短中文名当简称认，
 * 转发字眼和岗位名要排除掉。
 */
function looksLikeCompany(part: string): boolean {
  if (!part || FORWARD_WORD.test(part)) return false;
  if (COMPANY_TAIL.test(part)) return true;
  return part.length <= 12 && /^[一-龥A-Za-z]{2,12}$/.test(part) && !looksLikeTitle(part);
}

/**
 * 从 JD 原文里抽投递信息。
 *
 * 招聘贴的标题行常写成【公司_岗位_城市】，命名格式也放在【】里，
 * 所以先扫所有方括号块，再找邮箱，最后用公司名后缀和岗位名后缀兜底。
 */
export function extractJDInfo(raw: string): JDInfo {
  // 方括号块里的转发字眼先剥掉，【帮转】这种剥完就空了，直接丢掉
  const blocks = [...raw.matchAll(BRACKET_BLOCK)]
    .map((matched) => stripForward(matched[1]))
    .filter(Boolean);

  // 标题行取第一个方括号块，按常见分隔符拆成公司、岗位、城市。
  // 【地点：深圳】这种字段块不是标题，往后找，全是被跳过就留给正文兜底
  const headerParts = (blocks.find((block) => !BRACKET_FIELD.test(block)) ?? "")
    .split(/[_｜|/·]+/)
    .map((part) => stripForward(part))
    .filter(Boolean);

  // 先看带字段标签的写法：【公司名称】华泰证券 / 【岗位：行业研究员】
  let company = readLabeledField(raw, COMPANY_LABELS);
  let title = readLabeledField(raw, TITLE_LABELS);

  if (headerParts.length >= 2) {
    // 公司不一定是排在最前面的那段，认带公司后缀的那段；一段都不像就留给正文兜底
    company ||= headerParts.find(looksLikeCompany) ?? "";
    title ||= headerParts.find((part) => part !== company && looksLikeTitle(part)) ?? "";
  } else if (headerParts.length === 1) {
    // 方括号里只有一整串、没有分隔符，公司和岗位拆不开。
    // 以前两边都取这一串，标题就成了"某某公司 · 某某公司"，所以只按内容认一边，另一边留给下面的兜底。
    // 标签已经给出一边时，这一串只用来补另一边。
    if (!title && looksLikeTitle(headerParts[0])) title = headerParts[0];
    else if (!company && !looksLikeTitle(headerParts[0])) company = headerParts[0];
  }

  let city = "";

  // 城市可能写在"需base杭州"这类片段里
  const basePart = headerParts.find((part) => /base|城市|地点/i.test(part)) ?? "";
  const cityMatch = /(?:base|城市|地点)[\s:：]*([一-龥]{2,6})/i.exec(basePart);
  if (cityMatch) city = cityMatch[1];

  // 命名格式：先看方括号块里含"姓名""学校"这类词的那一个，再看正文里带标签的写法
  const namingFormat =
    cleanNaming(
      blocks.find((block) => NAMING_HINT.test(block) && /[_｜|/·\-—－]/.test(block)) ??
        NAMING_LABELED.exec(raw)?.[1] ??
        "",
    );

  // 兜底：从正文里找公司名和岗位名
  if (!company) company = fallbackCompany(raw);
  if (!title) title = fallbackTitle(raw);
  if (!city) {
    // 前面的"地点"要排除"工作地点"，那是详细地址，不能只取六个字当城市
    city = raw.match(/(?:base|城市|工作城市|(?<!工作)地点)[\s:：]*([一-龥]{2,6})/i)?.[1]?.trim() ?? "";
  }

  // 岗位名里常带着公司名，例如"华泰联合证券债券业务实习生招聘"。公司单独认出来之后，把它从岗位名里去掉
  if (company && title.startsWith(company) && title.length > company.length) {
    title = title.slice(company.length).trim();
  }

  // 岗位名末尾的括号备注（"行业研究员（新能源）"）不是岗位名本身，去掉
  title = title.replace(/[（(][^（）()]{1,20}[）)]\s*$/, "").trim() || title;

  // 再去掉头尾的"急招""招聘"这类版式词。整串都是版式词就去没了，那就留着原样
  const trimmedTitle = title.replace(TITLE_HEAD, "").replace(TITLE_TAIL, "").trim();
  if (trimmedTitle) title = trimmedTitle;

  // 详细地址要有明确标签才认。城市那行兜底只取两到六个字，这里取的是完整一句
  let workplace = WORKPLACE_PATTERN.exec(raw)?.[1]?.trim() ?? "";

  // 只写到城市或城区的（"工作地点：广州"）不算详细地址：城市归城市栏，工作地点留空
  if (workplace && !WORKPLACE_DETAIL.test(workplace)) {
    if (!city && /^[一-龥]{2,4}[市省]?$/.test(workplace)) city = workplace.replace(/[市省]$/, "");
    workplace = "";
  }

  // 只写了详细地址、没单独写城市时，从地址开头把城市抠出来
  if (!city && workplace) {
    city = /^([一-龥]{2,6}?[市省])/.exec(workplace)?.[1] ?? "";
  }

  const email = EMAIL_PATTERN.exec(raw)?.[0] ?? "";

  return {
    company,
    title,
    city: normalizeCity(city),
    workplace,
    workTime: extractWorkTime(raw),
    email,
    namingFormat,
  };
}

/** 命名格式里常带方括号，取括号里的内容。 */
function cleanNaming(value: string): string {
  const inner = /【([^】]+)】/.exec(value)?.[1] ?? value;
  return inner.replace(/^[【\[]|[】\]]$/g, "").trim();
}

/** 「深圳市南山区」这类写法只保留城市本身。 */
function normalizeCity(value: string): string {
  return value.replace(/[市省].*$/, "").trim();
}

/** 兼容旧调用：只取公司名和岗位名。 */
export function guessJDTitle(raw: string): { company: string; title: string } {
  const info = extractJDInfo(raw);
  if (info.company || info.title) return { company: info.company, title: info.title };

  // 认不出公司名就留空，不要拿开头那句话顶上——它常是"帮转"或者整条标题
  const firstLine = stripForward((raw.split(/\n+/)[0] ?? "").trim());
  return { company: looksLikeCompany(firstLine) ? firstLine : "", title: "" };
}
