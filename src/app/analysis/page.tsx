"use client";

import Link from "next/link";
import { matchDirections } from "@/lib/career";
import { useStore } from "@/lib/store";

export default function AnalysisPage() {
  const { profile } = useStore();
  const matches = matchDirections(profile.skills);

  if (profile.skills.length === 0) {
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
        <p>基于你的技能，匹配金融求职八类方向：适配度 · 强项 · 补强方向 · 行动建议。</p>
      </div>

      <div className="cards">
        {matches.map((item) => {
          const tone = item.score >= 40 ? "hit" : item.score > 0 ? "partial" : "miss";

          return (
            <div className="card" key={item.direction.id}>
              <div className="spread">
                <h3>{item.direction.name}</h3>
                <span className={`tag ${tone}`}>{item.score}%</span>
              </div>

              <div className="scorebar">
                <i style={{ width: `${item.score}%` }} />
              </div>

              <label className="fl">已命中的关键词</label>
              <div>
                {item.strong.length > 0 ? (
                  item.strong.map((word) => (
                    <span key={word} className="chip hit">
                      {word}
                    </span>
                  ))
                ) : (
                  <span className="tiny">暂无命中，先补下面的方向。</span>
                )}
              </div>

              <label className="fl">补强方向</label>
              <div>
                {item.direction.gap.map((word) => (
                  <span key={word} className="chip miss">
                    {word}
                  </span>
                ))}
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
        适配度由技能标签和方向关键词的命中比例算出，是本地启发式结果，只作参考，不代表真实录取概率。
      </div>
    </>
  );
}
