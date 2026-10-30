"use client";

import type { KbMatch } from "@/lib/kb/types";

type Props = {
  match: KbMatch | null;
  loading: boolean;
};

/** 置信度只决定提示语气，不做硬门槛：匹配是靠相似度算的，说「高度相似」比说「就是」更诚实。 */
function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return "同一岗位";
  if (confidence >= 0.75) return "高度相似";
  return "较为相似";
}

/**
 * 更多资讯：JD 里通常不写、但知识库里有的补充信息。
 *
 * 只放三类：典型的一天、坑与经验、技能工具。
 * 核心职责与业务流程归「岗位职责」卡片，不在这里重复。
 * 内容直接取自知识库原文，不经过大模型二次生成，所以每条都能追溯到具体岗位的原始分享。
 * 知识库没覆盖这个岗位时照实说明，不硬凑，也不联网——联网补充只服务于职责拆解，不在这里展示。
 */
export function KbMoreInfo({ match, loading }: Props) {
  if (loading) {
    return <div className="tiny muted mt8">正在检索岗位知识库……</div>;
  }

  if (!match || !match.matched) {
    return (
      <div className="tiny muted mt8">
        知识库暂未覆盖这个岗位，暂无更多资讯。上面的职责拆解会由模型依据 JD 与联网公开资料生成，
        带「补」标记的内容属于推测。补充一个同名岗位的分享后即可命中。
      </div>
    );
  }

  return (
    <div className="mt8">
      <div className="row" style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="tag hit">知识库命中</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {match.positionTitle}
        </span>
        <span className="tiny">
          依据 {match.sourceCount} 篇从业者分享 · {match.pointCount} 条知识点
        </span>
        {match.matchedBy === "llm" ? (
          <span className="tag partial" style={{ fontSize: 10, padding: "1px 6px" }}>
            智能匹配
          </span>
        ) : null}
        <span className="tiny">{confidenceLabel(match.confidence)}</span>
      </div>

      {match.matchedBy === "llm" && match.matchReason ? (
        <div className="tiny muted mt8">匹配理由：{match.matchReason}</div>
      ) : null}

      <div className="tiny mt8">
        以下是 JD 通常不会写、但从业者反复提到的部分。内容取自知识库原文，未经模型改写。
      </div>

      {match.groups.map((group) => (
        <div key={group.key} className="mt12">
          <b className="tiny">{group.label}</b>
          <ul className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
            {group.items.map((item, index) => (
              <li key={index}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}

      {match.groups.length === 0 ? (
        <div className="tiny mt8">
          这个岗位的分享主要集中在职责与流程上，见上面的「岗位职责」，没有额外的日常或踩坑记录。
        </div>
      ) : null}

      {match.sources.length > 0 ? (
        <div className="mt12">
          <b className="tiny">知识库主要来源</b>
          <ul className="muted" style={{ paddingLeft: 20, fontSize: 12, marginTop: 4 }}>
            {match.sources.map((source, index) => (
              <li key={index} style={{ wordBreak: "break-all" }}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title || "未命名文章"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
