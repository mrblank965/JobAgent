/**
 * JD → 知识库岗位的匹配，以及「更多资讯」的数据组装。
 *
 * 纯函数，不碰文件系统，前后端都能用。
 *
 * 匹配原则：宁可判「未覆盖」，也不许把不相干岗位的内容搬过来。
 * 所以不用「JD 里出现某个词就算命中」这种松口径，改成以岗位名为核心的相似度判断：
 *
 *   1. 岗位名（title 或别名）与 JD 岗位名完全相同 → 1.00；
 *   2. 岗位名是 JD 岗位名的一部分 → 按覆盖率打分，最长覆盖的那条赢
 *      （「产品经理」不会因为「基金产品经理」也含「产品经理」就被抢走）；
 *   3. 否则算字符二元组的 Dice 相似度，低于 0.62 直接不要；
 *   4. 行业闸门：岗位名本身不带行业信息时（如「管理培训生」「产品经理」），
 *      JD 里必须出现该岗位所在方向的行业词，否则判未覆盖——
 *      互联网公司的管培生不能被银行管培生的资料覆盖；
 *   5. 头两名分差小于 0.02、且行业证据一样多时判为「分不清」，
 *      返回未覆盖，不做猜测。同分但一方行业证据更多时，按证据裁决
 *      （「投资经理」JD 提到股权投资就是 PE，提到公募专户就是基金）。
 */

import type {
  KbMatch,
  KbMoreInfoGroup,
  KbMoreInfoItem,
  KbPosition,
} from "./types";

/** 模糊匹配的最低相似度。低于这个值说明不是同一个岗位。 */
const MIN_SIMILARITY = 0.62;

/** 最终得分门槛。低于它一律判未覆盖。 */
const MIN_SCORE = 0.6;

/** 头两名分差小于这个数、且行业证据相同时就算分不清，宁可不给。 */
const AMBIGUITY_MARGIN = 0.02;

/** 每个分组最多展示这么多条，再多界面就淹了。 */
const GROUP_LIMIT = 6;

/** 岗位角色词。只有带这些词的名字才可能参与模糊匹配。 */
const ROLE_WORDS =
  /经理|分析师|研究员|专员|主管|总监|助理|顾问|销售|交易员|运营|产品|风控|合规|精算|理赔|柜员|管培|培训生|实习|工程师|开发|设计|策略|研究|投资|审计|会计|出纳|客服|采购|人力|法务|市场|品牌|渠道|投顾|经纪|代理|柜面|信贷|承做|承销/;

/**
 * 各方向的行业词。
 *
 * 只放有区分度的词，不放「金融」「岗位」「业务」这种到处都有的。
 * 用来做两件事：判断岗位名是否自带行业信息；同分时裁决谁是真正的那个岗位。
 */
const DIRECTION_TOKENS: Record<string, string[]> = {
  银行: ["银行", "网点", "支行", "分行", "柜面", "存款", "贷款", "信用卡", "对公", "储蓄", "私人银行"],
  "证券/投行": ["券商", "证券公司", "投行", "投资银行", "研究所", "承做", "承销", "保荐", "并购", "IPO", "经纪", "营业部", "卖方"],
  "基金/资管": ["基金", "资管", "公募", "净值", "份额", "募集", "专户", "投研", "理财产品"],
  保险: ["保险", "寿险", "车险", "保单", "理赔", "精算", "核保", "代理人", "增员"],
  "互金/金融科技": ["金融科技", "互联网金融", "消费金融", "助贷", "小贷", "支付", "风控模型", "反欺诈", "信贷", "评分卡"],
  私募股权: ["私募股权", "股权投资", "投后", "募资", "被投企业", "并购基金", "基金募集"],
  风险投资: ["风险投资", "天使投资", "早期投资", "创始人", "创业公司", "融资轮"],
  运营: ["用户运营", "内容运营", "产品运营", "社群", "新媒体", "私域", "活动运营", "留存", "拉新", "增长"],
  产品: ["需求文档", "原型", "PRD", "用户调研", "版本迭代", "产品设计", "需求评审", "产品规划", "竞品"],
  数据分析: ["数据分析", "SQL", "指标体系", "报表", "埋点", "数仓", "取数"],
  "风控/反欺诈": ["反欺诈", "规则引擎", "黑产", "反作弊", "欺诈", "团伙"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\u3000·・,，.。/|｜、:：;；()（）【】\[\]"'“”]/g, "");
}

/** 字符二元组。中文没有空格分词，二元组是够用的近似。 */
function bigrams(text: string): Set<string> {
  const chars = [...text];
  const grams = new Set<string>();
  if (chars.length === 1) {
    grams.add(chars[0]);
    return grams;
  }
  for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars[i] + chars[i + 1]);
  return grams;
}

/** Dice 系数：2|A∩B| / (|A|+|B|)，结果在 0 到 1 之间。 */
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** 带角色词的名字才算岗位名；只有行业词的（如「券商资管」）不参与模糊匹配。 */
function hasRoleWord(term: string): boolean {
  return ROLE_WORDS.test(term);
}

/** 取某个方向的行业词，统一规范化后返回。 */
function directionTokens(direction: string): string[] {
  return (DIRECTION_TOKENS[direction] ?? []).map(normalize).filter((token) => token.length >= 2);
}

/** JD 正文里出现了几个该方向的行业词。 */
function evidenceCount(tokens: string[], jdText: string): number {
  let count = 0;
  for (const token of tokens) if (jdText.includes(token)) count += 1;
  return count;
}

type Hit = {
  position: KbPosition;
  score: number;
  term: string;
  /** 该岗位方向的行业词在 JD 里出现了几个。同分时用它裁决。 */
  evidence: number;
};

/**
 * 给单个岗位打分。
 *
 * jdTitle 是 JD 自带的岗位名（页面提取后传进来）。
 * 拿不到岗位名时只能做包含式匹配，要求锚点长度不小于 4 且带角色词。
 */
function scorePosition(position: KbPosition, jdTitle: string, jdText: string): Hit {
  const anchors = [position.title, ...position.aliases]
    .map((item) => item.trim())
    .filter((item) => normalize(item).length >= 2);

  const tokens = directionTokens(position.direction);
  const evidence = evidenceCount(tokens, jdText);
  let best: Hit = { position, score: 0, term: "", evidence };

  const consider = (term: string, score: number) => {
    if (score > best.score) best = { position, score, term, evidence };
  };

  if (jdTitle) {
    const title = normalize(jdTitle);
    const jdGrams = bigrams(title);

    for (const anchor of anchors) {
      const key = normalize(anchor);
      if (key.length < 2) continue;

      // 岗位名与 JD 岗位名完全相同：最可靠的信号
      if (key === title) {
        consider(anchor, 1);
        continue;
      }

      // 岗位名被 JD 岗位名完整包含：按覆盖率打分。
      // 覆盖率越高越像同一个岗位，「产品经理」覆盖 4/6，「经理」只覆盖 2/6
      if (title.includes(key)) {
        consider(anchor, 0.84 + 0.14 * (key.length / title.length));
        continue;
      }

      // 模糊相似度：要求锚点带角色词，避免「券商」「基金」这种行业词乱配。
      // 名字短的岗位（「投资经理」「募资经理」）差一个字就是另一个岗位，
      // 所以四个字以内要求更高的相似度，不给 0.67 这种擦边分过门
      if (!hasRoleWord(anchor)) continue;
      const similarity = dice(jdGrams, bigrams(key));
      const floor = key.length <= 4 ? 0.8 : MIN_SIMILARITY;
      if (similarity >= floor) {
        const scaled = MIN_SCORE + 0.28 * ((similarity - MIN_SIMILARITY) / (1 - MIN_SIMILARITY));
        consider(anchor, scaled);
      }
    }
  } else {
    // 没有岗位名时的兜底：只认「岗位名整词出现在 JD 正文里」，且名字要够长、带角色词
    for (const anchor of anchors) {
      const key = normalize(anchor);
      if (key.length < 4 || !hasRoleWord(anchor)) continue;
      if (jdText.includes(key)) consider(anchor, 0.72);
    }
  }

  if (best.score === 0) return best;

  // 岗位名里自带行业词，且这个行业词在 JD 里真的出现了，说明这条比别的更像。
  // 「基金研究员」压过共用的「行业研究员」，「信贷风控」压过泛泛的「风控策略」
  const termTokens = tokens.filter(
    (token) => normalize(best.term).includes(token) && jdText.includes(token),
  );
  if (termTokens.length > 0) {
    best = { ...best, score: Math.min(1, best.score + 0.03 * Math.min(termTokens.length, 2)) };
  }

  // 行业闸门：岗位名不带行业信息（「管理培训生」「产品经理」「投资经理」），
  // 就必须在 JD 里找到这个方向的行业词，否则它可能只是另一个行业的同名岗位
  const anchorHasDirection = tokens.some((token) => normalize(best.term).includes(token));
  if (!anchorHasDirection && evidence === 0) return { ...best, score: 0 };

  return best;
}

/**
 * 从 JD 正文里捞一个岗位名。
 *
 * 仅在上层没传岗位名时使用。按三种写法依次找：
 *   1. 「岗位：XX」「职位名称：XX」这类带标签的；
 *   2. 「招聘 XX，」这种动词后面紧跟岗位名的；
 *   3. 前几行里长度像岗位名、又带角色词的那一行。
 * 认不出来就返回空串——宁可退回正文包含式匹配，也别瞎猜一个名字。
 */
function guessTitleFromText(jdText: string): string {
  const flat = jdText.replace(/\s+/g, " ");

  const labelled = flat.match(/(?:岗位名称|职位名称|岗位|职位)[：:]\s*([^\s，,。；;（(]{2,20})/);
  if (labelled && hasRoleWord(labelled[1])) return labelled[1];

  // 「招聘银行客户经理，负责…」：截到第一个标点或括号为止
  const verb = flat.match(
    /(?:招聘|招募|诚聘|急聘|聘请|寻找|求)[\s]*([\u4e00-\u9fa5A-Za-z0-9/+·]{2,16}?)(?=[，,。；;（(）)\s]|$)/,
  );
  if (verb && hasRoleWord(verb[1])) return verb[1];

  const lines = jdText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 30);

  for (const line of lines.slice(0, 6)) {
    if (ROLE_WORDS.test(line)) return line;
  }
  return "";
}

/** 把长段落拆成条目。典型的一天常写成一大段，直接塞进列表会看不出重点。 */
function splitParagraph(text: string): string[] {
  return text
    .split(/[\n。；]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6);
}

function toItems(values: string[]): KbMoreInfoItem[] {
  return values
    .map((text) => text.trim())
    .filter((text) => text.length > 0 && text !== "暂缺（输入帖子未涉及）")
    .slice(0, GROUP_LIMIT)
    .map((text) => ({ text }));
}

/**
 * 组装「更多资讯」。
 *
 * 只放 JD 不写、从业者才会提到的三类：典型的一天、坑与经验、技能工具。
 * 核心职责和工作流程不放这儿——它们属于「岗位职责」，由页面单独展示。
 */
function buildGroups(position: KbPosition): KbMoreInfoGroup[] {
  const groups: KbMoreInfoGroup[] = [];

  const typicalDay = splitParagraph(position.sections.typicalDay);
  if (typicalDay.length > 0) {
    groups.push({
      key: "typicalDay",
      label: "典型的一天",
      items: typicalDay.slice(0, GROUP_LIMIT).map((text) => ({ text })),
    });
  }

  const pitfalls = toItems(position.sections.pitfalls);
  if (pitfalls.length > 0) groups.push({ key: "pitfalls", label: "坑与经验", items: pitfalls });

  const tools = toItems(position.sections.tools);
  if (tools.length > 0) groups.push({ key: "tools", label: "技能工具", items: tools });

  return groups;
}

/**
 * 拼给大模型的知识库上下文。
 *
 * 只放要点，不放来源链接——链接对模型没用，占 token；
 * 但要在开头写清楚来源篇数，让模型知道这是真实从业者内容，不是它自己的常识。
 */
function buildContext(position: KbPosition): string {
  const lines: string[] = [
    `【岗位知识库】匹配到《${position.title}》，基于 ${position.sourceCount} 篇真实从业者分享整理。`,
  ];

  if (position.aliases.length > 0) lines.push(`该岗位在招聘中的常见叫法：${position.aliases.join("、")}`);

  const s = position.sections;
  if (s.coreDuties.length > 0) {
    lines.push("", "〔核心职责〕");
    for (const item of s.coreDuties.slice(0, 10)) lines.push(`- ${item}`);
  }
  if (s.workflow.length > 0) {
    lines.push("", "〔从业者描述的完整流程〕");
    for (const item of s.workflow.slice(0, 10)) lines.push(`- ${item}`);
  }
  if (s.tools.length > 0) {
    lines.push("", "〔常用工具与技能〕");
    for (const item of s.tools.slice(0, 8)) lines.push(`- ${item}`);
  }
  if (s.typicalDay) {
    lines.push("", "〔典型的一天〕", s.typicalDay.slice(0, 800));
  }
  if (s.pitfalls.length > 0) {
    lines.push("", "〔坑与经验〕");
    for (const item of s.pitfalls.slice(0, 10)) lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

/** 未命中的空结果。字段要齐，界面靠 matched 判断状态。 */
export function emptyMatch(): KbMatch {
  return {
    matched: false,
    positionId: "",
    positionTitle: "",
    matchedTerm: "",
    confidence: 0,
    sourceCount: 0,
    pointCount: 0,
    duties: { core: [], workflow: [] },
    groups: [],
    sources: [],
    context: "",
    matchedBy: "rule",
    matchReason: "",
  };
}

/**
 * 走一遍匹配。
 *
 * 没达到阈值、或者头两名分不清时，返回 matched=false：
 * 让界面照实说「知识库暂未覆盖」，绝不用一个不相干的岗位糊上去。
 */
export function matchPosition(jdText: string, positions: KbPosition[], jdTitle = ""): KbMatch {
  const text = normalize(jdText);
  const title = jdTitle.trim() || guessTitleFromText(jdText.trim());

  const hits = positions
    .map((position) => scorePosition(position, title, text))
    .filter((hit) => hit.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.evidence - a.evidence ||
        normalize(b.term).length - normalize(a.term).length,
    );

  const best = hits[0];
  if (!best) return emptyMatch();

  const runnerUp = hits[1];
  // 头两名咬得太紧、行业证据和名字长度都一样，说明光看岗位名分不清是哪一个。
  // 名字更长的那个是更具体的岗位名（「金融数据分析师」压过「数据分析师」），不算分不清
  const ambiguous =
    Boolean(runnerUp) &&
    best.score - runnerUp.score < AMBIGUITY_MARGIN &&
    best.evidence === runnerUp.evidence &&
    normalize(best.term).length === normalize(runnerUp.term).length;

  if (ambiguous) return emptyMatch();

  const position = best.position;

  return {
    matched: true,
    positionId: position.positionId,
    positionTitle: position.title,
    matchedTerm: best.term,
    confidence: Number(best.score.toFixed(3)),
    sourceCount: position.sourceCount,
    pointCount: position.knowledgePoints.length,
    duties: {
      core: position.sections.coreDuties.slice(0, 10),
      workflow: position.sections.workflow.slice(0, 10),
    },
    groups: buildGroups(position),
    sources: position.sources.slice(0, 3),
    context: buildContext(position),
    matchedBy: "rule",
    matchReason: "",
  };
}

/**
 * 用指定的岗位构造完整匹配结果。
 *
 * 供大模型匹配使用：模型只负责挑出 positionId，这里负责把该岗位的
 * 职责、流程、更多资讯、来源、上下文完整拼出来。
 * positionId 不存在时返回未命中。
 */
export function buildMatchForPosition(
  positionId: string,
  positions: KbPosition[],
  matchedBy: KbMatch["matchedBy"],
  matchReason: string,
): KbMatch {
  const position = positions.find((item) => item.positionId === positionId);
  if (!position) return emptyMatch();

  return {
    matched: true,
    positionId: position.positionId,
    positionTitle: position.title,
    matchedTerm: position.title,
    confidence: 1,
    sourceCount: position.sourceCount,
    pointCount: position.knowledgePoints.length,
    duties: {
      core: position.sections.coreDuties.slice(0, 10),
      workflow: position.sections.workflow.slice(0, 10),
    },
    groups: buildGroups(position),
    sources: position.sources.slice(0, 3),
    context: buildContext(position),
    matchedBy,
    matchReason,
  };
}
