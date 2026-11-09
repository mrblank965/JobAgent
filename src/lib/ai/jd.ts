/**
 * JD 工作职责深度拆解。
 *
 * 零 Key 双模式，和简历模块同一套思路：本地拼好 Prompt，复制给任意大模型，
 * 把返回的 JSON 粘回来，再过一遍这里写的校验。
 *
 * 字段按能不能从 JD 原文读到分成两类：source、surface 必须来自原文；
 * essence、workflow、business、abilities 和面试题是解读和生成。
 * tools、deliverable、collaboration 这三类事实字段用 supplemented 标记区分，
 * 原文写了的标 false，按岗位常识补的标 true，界面上补的会灰显。
 */

/** 长度和数量上限。Prompt 和校验函数共用同一套数字，两边不许各写各的。 */
const LIMITS = {
  duties: 6,
  source: 240,
  surface: 40,
  essence: 60,
  workflowSteps: 5,
  workflowStep: 120,
  tools: 3,
  toolName: 20,
  toolPurpose: 20,
  business: 3,
  businessItem: 30,
  deliverable: 20,
  collaboration: 2,
  abilityCount: 8,
  abilityName: 12,
  question: 50,
  generalQuestions: 3,
  infoField: 60,
  requirements: 12,
  requirementItem: 60,
} as const;

export type DutyTool = {
  name: string;
  /** 用在第几步，对应 workflow 的序号，从 1 开始。 */
  step: number;
  purpose: string;
  /** true 表示 JD 原文没提，是按岗位常识补的。 */
  supplemented: boolean;
};

export type DutyCollaboration = {
  who: string;
  how: string;
  supplemented: boolean;
};

export type DutyDeliverable = {
  form: string;
  supplemented: boolean;
};

export type JDDuty = {
  source: string;
  surface: string;
  essence: string;
  workflow: string[];
  tools: DutyTool[];
  business: string[];
  deliverable: DutyDeliverable;
  collaboration: DutyCollaboration[];
  /**
   * 这条职责整体主要依据什么得出：
   * jd = JD 原文直接写了；kb = 岗位知识库提供的从业者内容；infer = 大模型自身常识推断。
   * 由模型在输出里标注，normalize 兜底为 infer。
   */
  sourceTag: "jd" | "kb" | "infer";
};

export type JDAbility = {
  name: string;
  /** 来自第几条职责，序号从 1 开始；不是从某条具体职责推出来的就是空数组。 */
  from: number[];
};

/** 招聘贴里能直接抄下来用的投递信息。字段含义和本地的 JDInfo 一致。 */
export type JDInfoExtract = {
  company: string;
  title: string;
  /** 城市名，只写城市，例如 深圳。 */
  city: string;
  /** 门牌号级别的详细地址，例如 深圳市南山区科苑路15号。原文没写到这么细就留空。 */
  workplace: string;
  /** 到岗时间、每天的上下班时段、实习时长、每周来几天，拼成一句。 */
  workTime: string;
  email: string;
  namingFormat: string;
};

/** 任职要求按"是对人的条件还是对时间的安排"分栏，剩下的归到其他。 */
export type JDRequirements = {
  ability: string[];
  schedule: string[];
  other: string[];
};

export type JDDutyBreakdown = {
  jobTitle: string;
  /** 模型没给出可用内容时为 undefined，界面回退到本地提取的结果。 */
  info?: JDInfoExtract;
  requirements?: JDRequirements;
  duties: JDDuty[];
  abilities: {
    hard: JDAbility[];
    soft: JDAbility[];
    knowledge: JDAbility[];
  };
  interviewQuestions: {
    perDuty: { duty: number; question: string }[];
    general: string[];
  };
};

export const JD_DUTY_SYSTEM_PROMPT =
  "你是 JobAgent 的岗位拆解助手。你要把一份招聘 JD 拆成结构化的工作内容，帮求职者看清这个岗位实际在干什么。只输出严格 JSON，不要输出 markdown 代码块，不要任何解释。";

/**
 * 拼出发给模型的 Prompt。
 *
 * 第 2 条和第 4 条是这份 Prompt 的关键：不写第 2 条，模型会直接复述 JD，
 * 拆出来还是原来那些话；不写第 4 条，模型补的工具会和原文写的混在一起分不清。
 *
 * 依据的优先级从高到低：JD 原文 → 岗位知识库（真实从业者）→ 联网检索（公开资料）→ 模型常识。
 * kbContext 和 webContext 传了就按这个顺序用，没传就退回模型自己的理解。
 * 凡是超出 JD 原文的内容，一律要求模型把 supplemented 标成 true。
 */
export function buildJDDutiesPrompt(raw: string, kbContext?: string, webContext?: string): string {
  const hasKb = typeof kbContext === "string" && kbContext.trim().length > 0;
  const hasWeb = typeof webContext === "string" && webContext.trim().length > 0;

  const kbBlock = hasKb
    ? `
下面这份是岗位知识库里的真实从业者内容，拆解时必须优先依据它：

"""
${kbContext.trim()}
"""

知识库使用规则（优先级最高，写在最前面执行）：

A. essence、workflow、tools、business、deliverable、collaboration 这几个字段，
   只要知识库里写了，就必须按知识库的说法来写，不许另编一套。知识库描述更具体时，
   保留它的具体动作和数字（比如用哪个表、看哪个指标、按什么维度比）。
B. 知识库没写到的部分，才允许用你自己的岗位常识补，并且必须把 supplemented 标成 true。
   知识库写了、JD 也写了的，标 false。
C. 知识库里没出现的工具、系统、交付物，不要凭印象写进 tools 和 deliverable。
D. 如果 JD 描述的岗位和知识库这个岗位明显不是一回事（比如 JD 是实习岗但知识库是全职），
   只借用知识库里通用的工作方式，涉及职级、周期、考核的部分不要照抄。
`
    : "";

  const webBlock = hasWeb
    ? `
下面是通过联网检索到的公开资料，用于补充知识库没覆盖的部分：

"""
${webContext.trim()}
"""

联网资料使用规则：

E. 当上面的知识库没有覆盖、或者知识库压根没命中时，优先从这批公开资料里取事实，
   不要直接跳到自己的常识。
F. 公开资料是二手信息，只有多篇说法一致、或者与 JD 原文不冲突时才采用；
   互相矛盾的部分不要写进结论。
G. 采用公开资料的内容同样要把 supplemented 标成 true——它们不是 JD 原文说的。
   不要编造链接、公司名、薪资数字，资料里没写的一律不补。
`
    : "";

  return `请把下面这份 JD 拆解成严格 JSON，结构如下：

{
  "jobTitle": "",
  "info": {
    "company": "招聘公司名",
    "title": "岗位名",
    "city": "只写城市名，例如 深圳",
    "workplace": "门牌号级别的详细地址，原文没写到这么细就留空",
    "workTime": "到岗时间、每天的上下班时段、实习时长、每周来几天，拼成一句",
    "email": "投递邮箱",
    "namingFormat": "简历或邮件的命名格式"
  },
  "requirements": {
    "ability": ["对个人的条件和经历"],
    "schedule": ["时间怎么安排"],
    "other": ["既不是个人条件也不是时间安排的其余要求"]
  },
  "duties": [
    {
      "source": "JD 原文原句，不许改写",
      "sourceTag": "jd | kb | infer",
      "surface": "这条职责表面上在干什么",
      "essence": "这条职责实际上在干什么",
      "workflow": ["第一步做什么", "第二步做什么"],
      "tools": [{ "name": "", "step": 1, "purpose": "", "supplemented": false }],
      "business": ["要理解什么", "要分析什么", "要做什么"],
      "deliverable": { "form": "产出是什么形式", "supplemented": false },
      "collaboration": [{ "who": "和谁", "how": "怎么协作", "supplemented": false }]
    }
  ],
  "abilities": {
    "hard": [{ "name": "", "from": [1] }],
    "soft": [{ "name": "", "from": [] }],
    "knowledge": [{ "name": "", "from": [] }]
  },
  "interviewQuestions": {
    "perDuty": [{ "duty": 1, "question": "" }],
    "general": [""]
  }
}
${kbBlock}${webBlock}
硬性要求：

1. source 必须是 JD 原文原句，一个字都不许改。
2. sourceTag 标明这条职责整体主要依据什么得出，三选一：
   - jd：这条职责的内容 JD 原文里基本都写清楚了，只是做了归纳；
   - kb：这条职责的关键做法（流程、动作、工具、交付）主要来自上面给出的岗位知识库；
   - infer：既不是 JD 原文写的、知识库也没覆盖，是你按岗位常识推断的。
   判断标准是这条职责的「实际上做什么 + 完整流程」主要靠谁撑起来。
   知识库写了才标 kb，JD 写了才标 jd，两者都没有只能靠常识补的标 infer。
3. essence 和 workflow 必须落到具体动作，禁止复述 JD 原话。
   反例，不要这样写：收集数据、做分析、形成结论。
   正例，要这样写：用第三方数据平台拉用户时长数据，建 Excel 对比表算同比环比。
   判断标准是，一个没做过这个岗位的人，看完你的 workflow 应该知道明天上班具体要打开什么、操作什么、交出什么。
4. workflow 写 3 到 5 步，每步都要写成一整句话，把这一步的完整做法交代清楚：
   先查什么资料或数据，具体到去哪查、查哪一类；
   拿到之后看什么、算什么、怎么比，比如按什么维度分组、算同比还是环比、拆到哪一层；
   这一步要得出什么，比如要找到哪个问题、要确认哪个口径、要锁定哪个标的或客户；
   最后据此怎么往下推，怎么形成结论或方案。
   不要写成"收集数据""做分析""形成结论"这种只有动作名的短标签。
5. tools、deliverable、collaboration 这三个字段都要带 supplemented 标记。
   JD 原文明确提到的标 false，JD 没提到、你按这个岗位的常识补的标 true。
   补的内容要贴岗位，不要凭空发挥。tools 每条职责最多 3 个。
6. abilities 只列 JD 职位要求里没有的能力。JD 已经写明的分析能力、沟通能力、软件技能这些，不要再重复列一遍。
7. from 填这条能力来自第几条职责的序号，序号从 1 开始。如果这条能力不是从某条具体职责推出来的，填空数组。
8. 职责超过 6 条时，把相近的合并成一条，不要简单截断。遇到"完成其他工作"这类兜底条款，照实写，不要硬编内容。
9. 每条职责配 1 道针对它的情景面试题，放在 perDuty 并用 duty 字段标明对应第几条；另外出 2 到 3 道岗位综合题放在 general。
10. info 各字段都从原文里抄，原文没写的留空字符串，不许用常识补。
   company 必须是真正的公司名。原文开头常写"帮转""求扩散""转发"这类字眼，
   它们不是公司名，不许拿来顶替；开头整句是"某公司招聘实习生"这种标题的，
   只取其中的公司名。认不出公司名就留空，不要硬填。
   title 必须是岗位名，同样不要拿开头那句话顶。
   city 只写城市名，不带区和街道；workplace 只写门牌号级别的详细地址，
   原文只写了城市没写到门牌号的，workplace 留空，不要把城市抄进去。
   workTime 把到岗时间、每天的上下班时段、实习时长或起止日期、每周来几天拼成一句，
   这几样在原文哪一段都算，原文一样都没有就留空。
11. requirements 是把 JD 里的要求逐条归栏，不是重写。
   ability 是对人的条件和经历，比如学历、专业、年级、技能、证书、性格；
   schedule 是时间怎么安排，比如到岗时间、实习时长、每周来几天、上下班时间；
   other 是剩下的，比如福利、转正机会、投递方式、面试安排。
   每条保留原文措辞，去掉序号，纯小标题行不要收进来。
12. 同一条信息只许出现一次，不许在 info、requirements、duties 之间来回重复。
   唯一的例外是 workTime 和 schedule：这两处讲的是同一件事，都要写全，不用去重。
13. duties 只收"这个岗位要做什么"，requirements 只收"对应聘者的要求"，两边不要互相串。
   原文里"负责…""参与…""协助…"这类描述要做的事，才进 duties；
   "我们希望你…""要求…""优先…"这类描述对个人的条件，进 requirements。
   招聘贴开头的标题行、招几人、工作地点、薪资待遇、投递方式这些版式内容，
   既不是工作内容也不是对个人的要求，三个地方都不要收。
14. requirements 里一句话混着好几件事的，要拆成几条分别归栏。
   例如"本科以上学历，有 CPA 优先，一周来 4 天，有实习补贴"要拆成四条：
   前两条进 ability，第三条进 schedule，第四条进 other。
   拆的时候同类相邻的可以合成一条，不要拆得过于零碎。
15. schedule 只收真正讲了时间的：到岗时间、实习时长、起止日期、每周来几天、上下班时段。
   只是提到"实习"这个词、但没有时间信息的句子不算排期，
   按内容归到 ability 或 other，不要硬塞进 schedule。
16. 意愿、志向、认同这类也属于对个人的条件，归 ability。
   例如"有志于从事 PEVC 行业""对私募股权基金有较深刻的理解""愿意长期投入"，
   都进 ability，不要因为它们读起来像感想就丢进 other。

长度上限：
surface 不超过 40 字，essence 不超过 60 字，workflow 每步不超过 120 字，
tools 每条职责不超过 3 个、用途不超过 20 字，business 2 到 3 条每条不超过 30 字，
deliverable 不超过 20 字，collaboration 不超过 2 项，
abilities 三类各不超过 8 条每条不超过 12 字，面试题每题不超过 50 字，
info 每个字段不超过 60 字，requirements 每栏不超过 12 条每条不超过 60 字。

JD 原文：
"""
${raw}
"""`;
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** 超长就截断。模型写多了不至于把界面撑爆，末尾加省略号让人看得出被切了。 */
function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** 先丢掉空串，再截条数，最后逐条截长度，顺序不能反。 */
function clampList(items: string[], max: number, itemMax: number): string[] {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, max)
    .map((item) => clamp(item, itemMax));
}

function normalizeTools(value: unknown): DutyTool[] {
  if (!Array.isArray(value)) return [];

  const tools: DutyTool[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const name = clamp(asString(raw.name), LIMITS.toolName);
    if (!name) continue;

    // step 对应 workflow 的序号，模型给成字符串或越界值都按第 1 步处理
    const step = Number(raw.step);
    tools.push({
      name,
      step: Number.isInteger(step) && step >= 1 ? step : 1,
      purpose: clamp(asString(raw.purpose), LIMITS.toolPurpose),
      supplemented: raw.supplemented === true,
    });

    if (tools.length >= LIMITS.tools) break;
  }
  return tools;
}

function normalizeCollaboration(value: unknown): DutyCollaboration[] {
  if (!Array.isArray(value)) return [];

  const items: DutyCollaboration[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const who = clamp(asString(raw.who), LIMITS.toolName);
    if (!who) continue;

    items.push({
      who,
      how: clamp(asString(raw.how), LIMITS.businessItem),
      supplemented: raw.supplemented === true,
    });

    if (items.length >= LIMITS.collaboration) break;
  }
  return items;
}

/** 交付形式模型可能给对象，也可能图省事只给一个字符串，两种都要接住。 */
function normalizeDeliverable(value: unknown): DutyDeliverable {
  if (typeof value === "string") {
    return { form: clamp(value, LIMITS.deliverable), supplemented: false };
  }

  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    return {
      form: clamp(asString(raw.form), LIMITS.deliverable),
      supplemented: raw.supplemented === true,
    };
  }

  return { form: "", supplemented: false };
}

/**
 * 投递信息。七个字段全空就返回 undefined，让界面回退到本地提取的结果，
 * 免得模型漏了这一块、界面上反而比本地还空。
 */
function normalizeInfo(value: unknown): JDInfoExtract | undefined {
  if (!value || typeof value !== "object") return undefined;

  const raw = value as Record<string, unknown>;
  const info: JDInfoExtract = {
    company: clamp(asString(raw.company), LIMITS.infoField),
    title: clamp(asString(raw.title), LIMITS.infoField),
    city: clamp(asString(raw.city), LIMITS.infoField),
    workplace: clamp(asString(raw.workplace), LIMITS.infoField),
    workTime: clamp(asString(raw.workTime), LIMITS.infoField),
    email: clamp(asString(raw.email), LIMITS.infoField),
    namingFormat: clamp(asString(raw.namingFormat), LIMITS.infoField),
  };

  return Object.values(info).some(Boolean) ? info : undefined;
}

/** 任职要求三栏。三栏都空就返回 undefined，理由同上。 */
function normalizeRequirements(value: unknown): JDRequirements | undefined {
  if (!value || typeof value !== "object") return undefined;

  const raw = value as Record<string, unknown>;
  const requirements: JDRequirements = {
    ability: clampList(asStringArray(raw.ability), LIMITS.requirements, LIMITS.requirementItem),
    schedule: clampList(asStringArray(raw.schedule), LIMITS.requirements, LIMITS.requirementItem),
    other: clampList(asStringArray(raw.other), LIMITS.requirements, LIMITS.requirementItem),
  };

  return Object.values(requirements).some((list) => list.length > 0) ? requirements : undefined;
}

function normalizeDuty(value: unknown): JDDuty | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const source = asString(raw.source).trim();

  // source 是回头核对原文的锚点，没有它这条职责没法验证，直接丢掉
  if (!source) return null;

  // sourceTag 模型给的不是三选一就兜底成 infer，避免未知值跑进界面
  const tag = asString(raw.sourceTag);
  const sourceTag: JDDuty["sourceTag"] = tag === "jd" || tag === "kb" ? tag : "infer";

  return {
    source: clamp(source, LIMITS.source),
    sourceTag,
    surface: clamp(asString(raw.surface), LIMITS.surface),
    essence: clamp(asString(raw.essence), LIMITS.essence),
    workflow: clampList(asStringArray(raw.workflow), LIMITS.workflowSteps, LIMITS.workflowStep),
    tools: normalizeTools(raw.tools),
    business: clampList(asStringArray(raw.business), LIMITS.business, LIMITS.businessItem),
    deliverable: normalizeDeliverable(raw.deliverable),
    collaboration: normalizeCollaboration(raw.collaboration),
  };
}

function normalizeAbilities(value: unknown): JDAbility[] {
  if (!Array.isArray(value)) return [];

  const abilities: JDAbility[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const name = clamp(asString(raw.name), LIMITS.abilityName);
    if (!name) continue;

    const from = Array.isArray(raw.from)
      ? raw.from.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1)
      : [];

    abilities.push({ name, from });

    if (abilities.length >= LIMITS.abilityCount) break;
  }
  return abilities;
}

/**
 * 把模型返回的内容整理成本项目的结构。
 *
 * 模型可能少给字段、把数组写成 null、把数字写成字符串，这里统一补全和截断。
 * 补完一条职责都没有，说明这份返回没法用，返回 null 让界面提示重试。
 */
export function normalizeJDDuties(data: unknown): JDDutyBreakdown | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as Record<string, unknown>;

  const duties = (Array.isArray(raw.duties) ? raw.duties : [])
    .map(normalizeDuty)
    .filter((duty): duty is JDDuty => duty !== null)
    .slice(0, LIMITS.duties);

  if (duties.length === 0) return null;

  const abilities = (raw.abilities ?? {}) as Record<string, unknown>;
  const questions = (raw.interviewQuestions ?? {}) as Record<string, unknown>;

  const perDuty = (Array.isArray(questions.perDuty) ? questions.perDuty : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const entry = item as Record<string, unknown>;
      const question = clamp(asString(entry.question), LIMITS.question);
      if (!question) return null;

      const duty = Number(entry.duty);
      return { duty: Number.isInteger(duty) && duty >= 1 ? duty : 0, question };
    })
    .filter((item): item is { duty: number; question: string } => item !== null)
    .slice(0, LIMITS.duties);

  return {
    jobTitle: asString(raw.jobTitle).trim(),
    info: normalizeInfo(raw.info),
    requirements: normalizeRequirements(raw.requirements),
    duties,
    abilities: {
      hard: normalizeAbilities(abilities.hard),
      soft: normalizeAbilities(abilities.soft),
      knowledge: normalizeAbilities(abilities.knowledge),
    },
    interviewQuestions: {
      perDuty,
      general: clampList(asStringArray(questions.general), LIMITS.generalQuestions, LIMITS.question),
    },
  };
}

/**
 * 大模型岗位匹配：把一份 JD 和知识库岗位清单一起交给模型，
 * 让它判断「哪个岗位干的活最接近」。
 *
 * 和拆解 Prompt 分开，是因为职责拆解要产出结构化字段，这里只产出岗位 ID。
 * 岗位名不同但工作内容相似（如「研究」「风控」）时，靠模型读职责来判，
 * 比关键词规则准得多。
 */

export const KB_MATCH_SYSTEM_PROMPT =
  "你是 JobAgent 的岗位匹配助手。你要判断一份招聘 JD 对应知识库里哪个岗位最接近。只输出严格 JSON，不要输出 markdown 代码块，不要任何解释。";

/** 岗位清单条目，只保留模型判断需要的字段。 */
export type KbCandidateInfo = {
  id: string;
  title: string;
  aliases: string[];
  coreDuties: string[];
};

/**
 * 拼匹配 Prompt。
 *
 * 给每个候选岗位附上它的别名和核心职责，模型据此判断「JD 干的活和谁最像」。
 * 不追求岗位名一字不差，而是看职责实质。
 */
export function buildKbMatchPrompt(jdText: string, candidates: KbCandidateInfo[]): string {
  const list = candidates
    .map((c) => {
      const duties = c.coreDuties
        .slice(0, 3)
        .map((d) => `    - ${d}`)
        .join("\n");
      return `- id: ${c.id}\n  岗位名: ${c.title}\n  别名: ${c.aliases.join("、")}\n  职责:\n${duties}`;
    })
    .join("\n");

  return `下面是一份招聘 JD，以及一个岗位知识库的岗位清单。

你的任务：从清单里选出「工作内容与这份 JD 最接近」的一个岗位。

判断依据是职责的实质，不是岗位名字是否相同。岗位名不同、但干的事情是同一类（例如都在做研究、都在做风控、都在做销售），就应该选它。如果清单里确实没有任何一个岗位和 JD 干的事情接近，就返回 id 为空字符串。

岗位清单：
${list}

JD 原文：
"""
${jdText}
"""

只输出严格 JSON，格式如下：
{
  "positionId": "选中的岗位 id，没有接近的就返回空字符串",
  "reason": "一句话说明为什么选它"
}
`;
}

/** 解析模型返回，拿到岗位 ID。解析失败返回 null，调用方退回词表匹配。 */
export function parseKbMatch(data: unknown): { positionId: string; reason: string } | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const positionId = typeof raw.positionId === "string" ? raw.positionId.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  // 必须拿到一个非空 id 才算有效，否则退回词表匹配
  if (!positionId) return null;
  return { positionId, reason };
}
