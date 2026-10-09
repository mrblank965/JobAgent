/**
 * 金融求职的八个方向。
 *
 * 每个方向给一组关键词，用简历里的技能去比，命中越多适配度越高。
 * 这套数据沿用参考页 jobagent 的设计，属于本地规则，不调用模型。
 */
export type Direction = {
  id: string;
  name: string;
  kw: string[];
  gap: string[];
  act: string;
};

export const DIRECTIONS: Direction[] = [
  {
    id: "ibd",
    name: "投资银行 IBD",
    kw: ["投行", "IPO", "并购", "重组", "估值", "财务模型", "尽职调查", "招股", "债券", "融资", "DCF", "Wind", "Excel", "法律"],
    gap: ["财务模型/DCF 建模", "招股书与尽调报告阅读", "Wind/Excel 高频操作", "投行实习经历"],
    act: "优先投递券商投行部或精品投行实习；补一门估值建模实操，准备两个可讲透的建模案例。",
  },
  {
    id: "er",
    name: "行业研究 / 券商行研",
    kw: ["行业研究", "行研", "研究报告", "财务模型", "深度报告", "调研", "宏观", "Wind", "Excel", "PPT", "数据分析", "写作"],
    gap: ["独立深度报告", "行业数据搜集与交叉验证", "盈利预测模型", "PPT 汇报表达"],
    act: "写一篇十五页以上的行业深度作为敲门砖；投递卖方行研实习，准备三分钟行业观点口述。",
  },
  {
    id: "pevc",
    name: "PE / VC 股权投资",
    kw: ["尽职调查", "估值", "商业计划书", "BP", "一级市场", "私募", "股权投资", "行业分析", "财务模型", "融资", "谈判", "法律"],
    gap: ["项目 sourcing 经验", "商业判断与案例库", "尽调全流程", "交易条款理解"],
    act: "积累两到三个行业 mapping 作品；多投早期机构实习，面试准备看过的项目与投资逻辑。",
  },
  {
    id: "am",
    name: "投研 / 资管 / 基金",
    kw: ["投研", "基本面", "宏观经济", "行业配置", "证券", "基金", "资产配置", "量化", "Wind", "Python", "财务分析", "Excel"],
    gap: ["投资框架体系", "模拟组合与复盘记录", "宏观指标跟踪", "Python 数据处理"],
    act: "建立公开模拟盘并周度复盘；投递买方研究或资管实习，准备推荐一只股票的完整逻辑。",
  },
  {
    id: "bank",
    name: "银行管培 / 金融机构",
    kw: ["银行", "管培", "信贷", "客户", "风险管理", "合规", "金融市场", "营销", "沟通", "抗压", "写作"],
    gap: ["对私/对公业务理解", "金融市场产品知识", "客户沟通场景演练", "银行业实习"],
    act: "投递总分行管培或金市实习；准备为什么选银行加职业规划的行为面答案。",
  },
  {
    id: "consult",
    name: "战略 / 管理咨询",
    kw: ["咨询", "行业分析", "商业分析", "PPT", "Excel", "逻辑思维", "沟通", "访谈", "调研", "建模", "写作"],
    gap: ["Case Interview 训练", "结构化框架库", "图表化 PPT 输出", "英文 case"],
    act: "每周三个 mock case；准备一份咨询风格的桌面研究作品。",
  },
  {
    id: "audit",
    name: "审计 / 财务 / 事务所",
    kw: ["审计", "会计", "财务报表", "CPA", "税务", "内部控制", "尽职调查", "Excel", "财务分析", "风控"],
    gap: ["CPA 会计与审计科目", "底稿与函证流程", "Excel 函数与透视表", "事务所实习"],
    act: "推进 CPA 报名与科目进度；投递四大或内资所寒假实习，准备群面与英文自我介绍。",
  },
  {
    id: "fintech",
    name: "金融科技 / 量化 / 数据",
    kw: ["Python", "SQL", "Java", "C++", "机器学习", "深度学习", "量化", "数据分析", "NLP", "数据挖掘", "统计", "算法", "Wind"],
    gap: ["可运行的策略或模型项目", "SQL 与工程化能力", "因子研究与回测经历", "刷题量"],
    act: "在 GitHub 放一个完整的量化或数据项目；投递量化研究或金工实习，准备代码面与统计推导。",
  },
];

export type DirectionMatch = {
  direction: Direction;
  /** 适配度百分比。 */
  score: number;
  /** 命中的关键词。 */
  strong: string[];
  /** 还缺的关键词，最多取六个。 */
  missing: string[];
};

/**
 * 用技能去比八个方向。
 * 只做关键词包含判断，不做语义联想，所以结果完全可解释。
 */
export function matchDirections(skills: string[]): DirectionMatch[] {
  const normalized = skills.map((skill) => skill.toLowerCase());

  return DIRECTIONS.map((direction) => {
    const strong = direction.kw.filter((word) =>
      normalized.some((skill) => skill.includes(word.toLowerCase())),
    );
    const missing = direction.kw.filter((word) => !strong.includes(word));

    return {
      direction,
      score: Math.round((strong.length / direction.kw.length) * 100),
      strong,
      missing: missing.slice(0, 6),
    };
  }).sort((left, right) => right.score - left.score);
}
