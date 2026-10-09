"use client";

import Link from "next/link";
import { useState } from "react";
import { analyzeJD } from "@/lib/jd";
import { useStore } from "@/lib/store";

export default function OptimizePage() {
  const { profile, jds } = useStore();

  const [activeJD, setActiveJD] = useState("");
  const [notice, setNotice] = useState("");
  /** 用户改过就用改过的，没改过就跟着画像里的原文走，避免用 effect 同步状态。 */
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? profile.rawResume;

  const jd = jds.find((item) => item.id === activeJD) ?? null;
  const analysis = jd ? analyzeJD(jd.raw, profile.skills, profile.rawResume) : null;

  function download() {
    if (draft.trim().length === 0) {
      setNotice("还没有可导出的内容。");
      return;
    }

    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `简历_${profile.name || "未命名"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("已导出为 txt 文件。");
  }

  return (
    <>
      <div className="view-head">
        <h1>📝 简历定制</h1>
        <p>选一份目标 JD，看清命中与缺口，在真实经历范围内逐段改写，导出 txt 投递。</p>
      </div>

      <div className="warnbox mb12">
        <b>事实红线</b>：只能调整顺序、措辞、嵌入关键词、突出相关的真实经历。
        禁止虚构公司、项目、职位、数据与证书。
      </div>

      <div className="split">
        <div className="card">
          <div className="spread">
            <h3>目标岗位</h3>
            <span className="tiny">{jds.length} 份 JD</span>
          </div>

          {jds.length === 0 ? (
            <div className="empty mt8">
              <span className="big">🔎</span>
              还没有 JD。先到「JD 拆解器」粘贴一份岗位原文。
              <div className="mt12">
                <Link className="btn primary" href="/jd">
                  去 JD 拆解器
                </Link>
              </div>
            </div>
          ) : (
            <>
              <label className="fl">选择 JD</label>
              <select
                className="input"
                value={activeJD}
                onChange={(event) => setActiveJD(event.target.value)}
              >
                <option value="">— 请选择 —</option>
                {jds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.company || "未知公司"} · {item.title || "未命名岗位"}
                  </option>
                ))}
              </select>

              {analysis ? (
                <>
                  <label className="fl">建议优先嵌入的命中点</label>
                  <div>
                    {analysis.match.hits.length > 0 ? (
                      analysis.match.hits.map((item) => (
                        <span key={item.k} className="chip hit">
                          {item.k}
                        </span>
                      ))
                    ) : (
                      <span className="tiny">暂无命中，先补技能再谈改写。</span>
                    )}
                  </div>

                  <label className="fl">缺口，不要硬编，先想真实证据</label>
                  <div>
                    {analysis.match.missing.length > 0 ? (
                      analysis.match.missing.map((word) => (
                        <span key={word} className="chip miss">
                          {word}
                        </span>
                      ))
                    ) : (
                      <span className="tiny">没有明显缺口。</span>
                    )}
                  </div>

                  <label className="fl">该 JD 的职责</label>
                  <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                    {analysis.duties.slice(0, 5).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="tiny mt12">选一份 JD，这里会列出命中点和缺口。</div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="spread">
            <h3>简历草稿</h3>
            <span className="tiny">{draft.trim().length} 字</span>
          </div>

          <textarea
            className="input"
            style={{ height: 420 }}
            value={draft}
            onChange={(event) => {
              setEdited(event.target.value);
              if (notice) setNotice("");
            }}
            placeholder="这里是简历正文。可以点下面的按钮从「简历解析」载入原文，然后按命中点调整措辞。"
          />

          <div className="row mt8">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEdited(null);
                setNotice(profile.rawResume ? "已载入简历原文。" : "画像里还没有简历原文，先去简历解析。");
              }}
            >
              载入简历原文
            </button>
            <button type="button" className="btn" onClick={download}>
              ⬇ 导出 txt
            </button>
            <button type="button" className="btn primary" disabled>
              ✨ AI 逐段改写
            </button>
          </div>

          <div className="tiny mt8">
            AI 逐段改写待成员 C 的接口接入后启用。当前可以手动按命中点调整措辞。
          </div>
          {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
        </div>
      </div>
    </>
  );
}
