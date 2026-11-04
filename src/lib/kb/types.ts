/**
 * 岗位知识库的数据契约。
 *
 * 字段与 kb/store/kb-bundle.json 一一对应，由 kb/scripts/build-bundle.cjs 产出。
 * 这里的结构改了就同步改那个脚本，两边不许各写各的。
 */

/** 五类归档。缺项说明采集到的帖子没覆盖这个维度，不是数据错误。 */
export type KbSections = {
  coreDuties: string[];
  workflow: string[];
  tools: string[];
  typicalDay: string;
  pitfalls: string[];
};

export type KbKnowledgePoint = {
  kpId: string;
  category: keyof KbSections;
  text: string;
};

export type KbSource = {
  title: string;
  url: string;
};

export type KbPosition = {
  positionId: string;
  title: string;
  aliases: string[];
  keywords: string[];
  industry: string;
  direction: string;
  sourceCount: number;
  sources: KbSource[];
  sections: KbSections;
  knowledgePoints: KbKnowledgePoint[];
};

export type KbBundle = {
  builtAt: string;
  positionCount: number;
  pointCount: number;
  positions: KbPosition[];
};

/** 一条「更多资讯」条目。sourceKpId 便于回溯到知识点与原文链接。 */
export type KbMoreInfoItem = {
  text: string;
  kpId?: string;
};

/** 更多资讯的一个分组，例如「典型的一天」「坑与经验」。职责与流程不放这里，归岗位职责板块。 */
export type KbMoreInfoGroup = {
  key: "typicalDay" | "pitfalls" | "tools";
  label: string;
  items: KbMoreInfoItem[];
};

/** 匹配结果。matched 为 false 时说明知识库没覆盖这个岗位，界面要照实说。 */
export type KbMatch = {
  matched: boolean;
  positionId: string;
  positionTitle: string;
  /** 命中的词，例如「银行客户经理」。没用上知识库时为空串。 */
  matchedTerm: string;
  /** 0 到 1，只用于界面提示可信度，不参与业务判断。 */
  confidence: number;
  sourceCount: number;
  pointCount: number;
  /** 岗位职责板块要用的两块：核心职责与从业者描述的完整流程。 */
  duties: {
    core: string[];
    workflow: string[];
  };
  groups: KbMoreInfoGroup[];
  sources: KbSource[];
  /** 送给大模型的上下文文本，已在服务端拼好。 */
  context: string;
  /** 匹配方式：llm 是大模型语义匹配，rule 是词表匹配。 */
  matchedBy: "llm" | "rule";
  /** 大模型匹配时的一句理由，词表匹配为空串。 */
  matchReason: string;
};
