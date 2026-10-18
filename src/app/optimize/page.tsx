"use client";

import Link from "next/link";
import { useState } from "react";
import { analyzeJD } from "@/lib/jd";
import { useStore } from "@/lib/store";
import { ExtraExperienceCard } from "@/components/optimize/ExtraExperienceCard";
import { RewritePlanner } from "@/components/optimize/RewritePlanner";
import { StyleControls } from "@/components/optimize/StyleControls";
import { useTransientState } from "@/components/optimize/useTransientState";
import { buildResumeDocx } from "@/lib/optimizeDocx";
import { buildResumeTemplate, stripHints } from "@/lib/resumeTemplate";
import {
  DEFAULT_STYLE_SETTINGS,
  resolveStyle,
  settingsToResolveInput,
  type StyleSettings,
} from "@/lib/languageStyles";

export default function OptimizePage() {
  const { profile, jds } = useStore();

  /**
   * 选中的 JD、手改过的草稿、其他经历都只存在**页面内存**里。
   * 站内跳到别的页面再回来，填过的东西还在；但**一刷新就清空**，关掉标签页再打开也是空的。
   * 存的是内存不是 sessionStorage——后者扛得住刷新，和这个需求正好相反。
   */
  const [activeJD, setActiveJD] = useTransientState("jobagent.optimize.jd", "");
  /** 用户改过就用改过的，没改过就跟着画像里的原文走，避免用 effect 同步状态。 */
  const [edited, setEdited] = useTransientState<string | null>("jobagent.optimize.draft", null);
  /** 简历里没写、但用户想补进来的其他经历，改写时和简历一起作为材料。 */
  const [extra, setExtra] = useTransientState("jobagent.optimize.extra", "");
  /** 语言风格设置：主风格、辅风格、力度、长度、优先量化。 */
  const [styleSettings, setStyleSettings] = useTransientState<StyleSettings>(
    "jobagent.optimize.style",
    DEFAULT_STYLE_SETTINGS,
  );

  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  /** 导出时要不要把灰色提示清掉。默认保留——模板本来就是拿去改的。 */
  const [cleanExport, setCleanExport] = useState(false);
  const draft = edited ?? profile.rawResume;

  const jd = jds.find((item) => item.id === activeJD) ?? null;
  const analysis = jd ? analyzeJD(jd.raw, profile.skills, profile.rawResume) : null;

  // 主风格没选时不给合并结果，改写按钮会保持禁用。
  const styleInput = settingsToResolveInput(styleSettings);
  const mergedStyle = styleInput ? resolveStyle(styleInput) : undefined;

  /**
   * 把草稿套进 A4 模板骨架。
   *
   * 只在导出时做，不改动你在上方编辑的草稿：
   * 已有的板块原样搬过去、按规格顺序重排，缺的板块在 Word 上补灰色提示。
   * 不认识的板块（个人优势、获奖情况……）一个都不丢，原序放到最后。
   */
  function toTemplateText(): string {
    return buildResumeTemplate({
      profile: {
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
        location: profile.location,
        target: profile.target,
        school: profile.school,
        major: profile.major,
        degree: profile.degree,
        gradYear: profile.gradYear,
        skills: profile.skills,
      },
      draft,
    });
  }

  function download() {
    if (draft.trim().length === 0) {
      setNotice("还没有可导出的内容。");
      return;
    }

    const blob = new Blob([cleanExport ? stripHints(draft) : draft], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `简历_${profile.name || "未命名"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("已导出为 txt 文件。");
  }

  /**
   * 导出 Word。docx 库是按需加载的，所以这里要 await。
   *
   * 导出的是「草稿套进模板骨架」之后的内容，缺的板块直接在文档里留灰色提示。
   * 上面的草稿一个字都不动，导完回去看还是你原来写的东西。
   * 草稿空着也能导——那样出来就是一份带提示的空白模板，对着填。
   */
  async function downloadDocx() {
    setExporting(true);
    setNotice("正在生成 Word 文档……");

    try {
      const blob = await buildResumeDocx(toTemplateText(), { stripHints: cleanExport });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `简历_${profile.name || "未命名"}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        cleanExport
          ? "已导出 Word。提示已清掉。注意：最终分几页由 Word 按内容长度自己算，程序没法保证刚好一页。"
          : "已导出 Word，缺的地方在文档里是灰色斜体提示。填完回来勾上「去掉灰色提示」再导一次就是干净版。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导出失败。");
    } finally {
      setExporting(false);
    }
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
          </div>

          <div className="tiny mt8">
            改写在下面的「✨ AI 逐段改写」里做，导出在最底部。两处都会用这个框里的内容。
          </div>
          {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
        </div>
      </div>

      <ExtraExperienceCard value={extra} onChange={setExtra} />

      <StyleControls jdText={jd?.raw ?? ""} value={styleSettings} onChange={setStyleSettings} />

      <RewritePlanner
        resumeText={draft}
        extraText={extra}
        jdRaw={jd?.raw ?? ""}
        jdLabel={jd ? `${jd.company || "未知公司"} · ${jd.title || "未命名岗位"}` : ""}
        style={mergedStyle}
        jdKeywords={analysis?.keywords ?? []}
        input={{
          company: jd?.company,
          title: jd?.title,
          target: profile.target,
          jobType: profile.jobType,
          analysis,
        }}
        onApply={(text) => {
          setEdited(text);
          setNotice("已把勾选的变更写进简历草稿，可在上方继续手动润色。");
        }}
      />

      <div className="card mt12">
        <div className="spread">
          <h3>⬇ 导出</h3>
          <span className="tiny">{draft.trim().length} 字</span>
        </div>
        <p className="tiny">
          <b>导出 Word</b> 会把草稿套进 A4 模板骨架：板块按 个人信息 → 教育背景 → 实习经历 → 项目经历 →
          校园经历 → 专业技能 的顺序排，<b>你还没写的部分，直接在文档里用灰色斜体标出来</b>告诉你该写什么。
          草稿本身不会被改动。
        </p>
        <p className="tiny">
          <b>导出 txt</b> 导的是「简历草稿」框里的原样内容，不套模板。
        </p>

        <label className="mt8" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={cleanExport}
            onChange={(event) => setCleanExport(event.target.checked)}
          />
          <span className="tiny">
            <b>去掉灰色提示再导出</b>。文档里的〔…〕会全部清掉、空板块也一起去掉，得到一份可以直接投递的版本。
            还没填完就先别勾，留着提示对着 Word 改。
          </span>
        </label>

        <div className="row mt8">
          <button type="button" className="btn" onClick={download}>
            ⬇ 导出 txt
          </button>
          <button type="button" className="btn primary" onClick={downloadDocx} disabled={exporting}>
            {exporting ? "生成中…" : "⬇ 导出 Word"}
          </button>
        </div>
      </div>
    </>
  );
}
