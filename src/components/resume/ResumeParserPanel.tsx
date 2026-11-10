"use client";

import { useState } from "react";
import { DIRECTIONS } from "@/lib/career";
import {
  ParseError,
  parseResumeFile,
  parseResumeTextInput,
  type ParsedResume,
} from "@/lib/parsers/parseClient";
import { DEGREE_LABELS, type RecognizedHeading } from "@/lib/parsers/resumeText";
import { useStore } from "@/lib/store";
import type { ResumeData } from "@/types/analysis";
import { AIEnhance } from "./AIEnhance";
import { ResumeEditor } from "./ResumeEditor";
import { ResumeProfile } from "./ResumeProfile";
import { ResumeTextInput } from "./ResumeTextInput";

/**
 * 简历解析面板，是整个功能唯一持有状态的地方。
 *
 * 上传文件和粘贴全文共用同一个接口、同一个解析结果区、同一套错误提示。
 * 上传那条路会把提取出的文字回填到文本框，用户可以看见并直接修改，
 * 所以文件那条路不需要自己的一套界面。
 */
export function ResumeParserPanel() {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [directionId, setDirectionId] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  const { setProfile, addResumeVariant, resumeDraft, setResumeDraft } = useStore();
  const { text, fileName, resume, headings, suspectedHeadings } = resumeDraft;

  function setText(next: string) {
    setResumeDraft((current) => ({ ...current, text: next }));
  }

  function setFileName(next: string) {
    setResumeDraft((current) => ({ ...current, fileName: next }));
  }

  function setResume(next: ResumeData | null) {
    setResumeDraft((current) => ({ ...current, resume: next }));
  }

  function setHeadings(next: RecognizedHeading[]) {
    setResumeDraft((current) => ({ ...current, headings: next }));
  }

  function setSuspectedHeadings(next: string[]) {
    setResumeDraft((current) => ({ ...current, suspectedHeadings: next }));
  }

  /**
   * 只有用户明确点击“保存到资料库”时，才把跨版本共用的字段同步到全局画像。
   * 实习、项目、荣誉等版本化内容则完整保存在 ResumeVariant.structuredData 中。
   */
  function syncCommonProfile(nextResume: ResumeData) {
    const first = nextResume.education[0];

    setProfile((current) => ({
      ...current,
      name: nextResume.name || current.name,
      email: nextResume.email || current.email,
      phone: nextResume.phone || current.phone,
      skills: nextResume.skills,
      strengths: nextResume.strengths,
      education: nextResume.education
        .map((item) => [DEGREE_LABELS[item.degree], item.school, item.major].filter(Boolean).join(" "))
        .join("；"),
      rawResume: text,
      // 只同步简历中明确识别出的字段；识别不到时保留资料库原值。
      school: first?.school || current.school,
      major: first?.major || current.major,
      degree: first ? DEGREE_LABELS[first.degree] : current.degree,
      gradYear: first?.periodEnd?.slice(0, 4) || current.gradYear,
    }));
  }

  /** AI 增强解析的结果直接替换编辑区内容。 */
  function handleAIApply(next: ResumeData) {
    setError("");
    setDirectionId("");
    setSaveNotice("");
    setResume(next);
  }

  /** 两条入口共用：把解析结果写回页面状态。 */
  function applyParsed(parsed: ParsedResume) {
    setText(parsed.text);
    setHeadings(parsed.headings);
    setSuspectedHeadings(parsed.suspectedHeadings);
    setResume(parsed.resume);
  }

  async function handleSubmit() {
    if (loading || extracting) return;

    setLoading(true);
    setError("");

    try {
      applyParsed(parseResumeTextInput(text));
    } catch (error) {
      setError(error instanceof ParseError ? error.message : "解析失败，请重试。");
      setResume(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(file: File) {
    if (loading || extracting) return;

    setExtracting(true);
    setError("");
    setFileName(file.name);

    try {
      applyParsed(await parseResumeFile(file));
    } catch (error) {
      setError(error instanceof ParseError ? error.message : "读取文件失败，请换一个文件重试。");
      setResume(null);
    } finally {
      setExtracting(false);
    }
  }

  function handleReset() {
    setText("");
    setFileName("");
    setResume(null);
    setHeadings([]);
    setSuspectedHeadings([]);
    setError("");
    setDirectionId("");
    setSaveNotice("");
  }

  return (
    <>
      <div className="split">
        <ResumeTextInput
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
          onReset={handleReset}
          onFileSelect={handleFileSelect}
          fileName={fileName}
          extracting={extracting}
          loading={loading}
          hasResult={resume !== null}
        />

        {resume ? (
          <ResumeProfile value={resume} onChange={setResume} />
        ) : (
          <div className="card">
            <h3>结构化画像</h3>
            <div className="empty">
              <span className="big">🪶</span>
              解析完成后，姓名、联系方式、学校专业学历、技能与优势会显示在这里。
            </div>
          </div>
        )}
      </div>

      <AIEnhance rawText={text} onApply={handleAIApply} />

      {extracting || loading ? (
        <div className="nextstep mt12">
          <b>{extracting ? "正在读取文件并提取文字" : "正在解析"}</b>
          <div className="muted mt8">期间按钮已停用，不会重复提交。</div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="errbox mt12">
          <b>解析失败</b>
          <div className="mt8">{error}</div>
          <div className="tiny mt8">已有内容没有被清空，可以修改后重试。</div>
        </div>
      ) : null}

      {resume ? (
        <div className="mt16">
          <div className="card mb12">
            <div className="spread" style={{ alignItems: "flex-end" }}>
              <div>
                <b>保存完整简历版本到资料库</b>
                <div className="tiny">先在下方校对教育、实习、项目和荣誉，再选择适用方向保存。</div>
              </div>
              <div style={{ minWidth: 260 }}>
                <label className="fl" htmlFor="resume-direction">适用方向</label>
                <select
                  id="resume-direction"
                  className="input"
                  value={directionId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setDirectionId(nextId);
                    // 选完适用方向就把全局「目标方向」一并同步，省得用户在上面的画像里再选一次。
                    const direction = DIRECTIONS.find((item) => item.id === nextId);
                    if (direction) setProfile((current) => ({ ...current, target: direction.name }));
                  }}
                >
                  <option value="">— 请选择方向 —</option>
                  {DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
                </select>
              </div>
              <button
                type="button"
                className="btn primary"
                disabled={!directionId}
                onClick={() => {
                  syncCommonProfile(resume);
                  addResumeVariant({
                    name: fileName ? fileName.replace(/\.[^.]+$/, "") : `${resume.name || "未命名"}的简历`,
                    directionId,
                    sourceText: text,
                    structuredData: resume,
                  });
                  const directionName = DIRECTIONS.find((item) => item.id === directionId)?.name ?? "所选方向";
                  setSaveNotice(
                    `已保存为「${directionName}」方向简历：教育 ${resume.education.length} 条、` +
                    `实习/工作 ${resume.experiences.length} 条、项目 ${resume.projects.length} 条、` +
                    `荣誉 ${resume.honors.length} 条；姓名、邮箱、手机号等通用资料也已同步。`,
                  );
                }}
              >
                保存到资料库
              </button>
            </div>
            {saveNotice ? <div className="warnbox mt12">{saveNotice}</div> : null}
          </div>
          <ResumeEditor
            value={resume}
            onChange={setResume}
            headings={headings}
            suspectedHeadings={suspectedHeadings}
          />
        </div>
      ) : null}
    </>
  );
}
