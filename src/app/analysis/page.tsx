"use client";

import Link from "next/link";
import { buildDirectionCandidate, matchDirections } from "@/lib/career";
import { useStore } from "@/lib/store";

export default function AnalysisPage() {
  const { profile, resumeVariants, resumeDraft } = useStore();
  const resumes = [
    ...resumeVariants.flatMap((item) => item.structuredData ? [item.structuredData] : []),
    ...(resumeDraft.resume ? [resumeDraft.resume] : []),
  ];
  const candidate = buildDirectionCandidate({ profile, resumes });
  const matches = matchDirections(candidate);
  const hasEvidence = Object.values(candidate).some((items) => items.length > 0);

  if (!hasEvidence) {
    return (
      <>
        <div className="view-head">
          <h1>🧭 方向分析</h1>
        </div>
        <div className="empty">
          <span className="big">🪶</span>
          先到「简历解析」校对内容并保存到资料库，才能算八个方向的适配度。
          <div className="mt12">
            <Link className="btn primary" href="/resume">
              去简历解析
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="view-head">
        <h1>🧭 方向分析</h1>
        <p>综合教育背景、实习工作、项目论文、技能和个人优势，识别你可以重点尝试的金融求职方向。</p>
      </div>

      <div className="cards">
        {matches.map((item) => {
          const tone = item.score >= 60 ? "hit" : item.score >= 30 ? "partial" : "miss";
          const level = item.score >= 75 ? "强匹配" : item.score >= 55 ? "较匹配" : item.score >= 30 ? "有一定基础" : "当前证据较少";

          return (
            <div className="card" key={item.direction.id}>
              <div className="spread">
                <h3>{item.direction.name}</h3>
                <span className={`tag ${tone}`}>{level} · {item.score}</span>
              </div>

              <div className="scorebar">
                <i style={{ width: `${item.score}%` }} />
              </div>

              <label className="fl">简历中的匹配依据</label>
              <div>
                {item.evidence.length > 0 ? (
                  item.evidence.slice(0, 4).map((evidence) => (
                    <div className="nextstep mt8" key={`${evidence.source}-${evidence.label}`}>
                      <div className="spread">
                        <b>{evidence.label}</b>
                        <span className="tag hit">{evidence.source} +{evidence.score}</span>
                      </div>
                      <div className="tiny mt8">{evidence.excerpt}</div>
                    </div>
                  ))
                ) : (
                  <span className="tiny">当前简历里还没有识别到直接依据。</span>
                )}
                {item.evidence.length > 4 ? (
                  <details className="mt8">
                    <summary className="tiny" style={{ cursor: "pointer", color: "var(--accent)" }}>
                      查看其余 {item.evidence.length - 4} 项依据
                    </summary>
                    <div className="mt8">
                      {item.evidence.slice(4).map((evidence) => (
                        <span className="chip hit" key={`${evidence.source}-${evidence.label}-more`}>
                          {evidence.label} · {evidence.source} +{evidence.score}
                        </span>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>

              <label className="fl">当前缺少的关键证据</label>
              <div>
                {item.missing.length > 0 ? item.missing.map((word) => (
                  <span key={word} className="chip miss">{word}</span>
                )) : <span className="tiny">核心证据较完整，下一步结合具体 JD 检查案例质量和岗位要求。</span>}
              </div>

              <label className="fl">行动建议</label>
              <p className="muted" style={{ fontSize: 13 }}>
                {item.direction.act}
              </p>
            </div>
          );
        })}
      </div>

      <div className="tiny mt16">
        分数来自简历中可核对的教育、经历、项目和能力证据，同一证据规则不会因多个版本重复计分。它用于比较方向，不代表录取概率；具体岗位仍需结合 JD 单独判断。
      </div>
    </>
  );
}
