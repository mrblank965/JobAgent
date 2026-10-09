"use client";

import { useEffect, useState } from "react";
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
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [headings, setHeadings] = useState<RecognizedHeading[]>([]);
  const [suspectedHeadings, setSuspectedHeadings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  const { setProfile } = useStore();

  /**
   * 解析结果同步到全局画像，岗位分析、JD 拆解器、简历定制都读它。
   * 只放在页面内存里，不写 localStorage。
   */
  useEffect(() => {
    if (!resume) return;

    const first = resume.education[0];

    setProfile((current) => ({
      ...current,
      name: resume.name ?? "",
      skills: resume.skills,
      strengths: resume.strengths,
      education: resume.education
        .map((item) => [DEGREE_LABELS[item.degree], item.school, item.major].filter(Boolean).join(" "))
        .join("；"),
      rawResume: text,
      // 求职意向类字段只在还是空的时候补，避免覆盖用户手填的内容
      school: current.school || first?.school || "",
      major: current.major || first?.major || "",
      degree: current.degree || DEGREE_LABELS[first?.degree ?? "other"] || "本科",
      gradYear: current.gradYear || first?.periodEnd?.slice(0, 4) || "",
    }));
  }, [resume, text, setProfile]);

  /** AI 增强解析的结果直接替换编辑区内容。 */
  function handleAIApply(next: ResumeData) {
    setError("");
    setResume(next);
  }

  /** 两条入口共用的请求逻辑：发出去、看状态码、取结果。 */
  async function sendRequest(body: BodyInit, headers?: HeadersInit) {
    const response = await fetch("/api/parse-resume", { method: "POST", headers, body });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = (payload as { error?: unknown } | null)?.error;
      setError(
        typeof message === "string" && message.length > 0
          ? message
          : `请求失败，服务器返回状态码 ${response.status}。`,
      );
      setResume(null);
      return;
    }

    const parsed = (payload as { resume?: ResumeData } | null)?.resume;
    if (!parsed) {
      setError("服务器返回了无法识别的结果，请重试。");
      setResume(null);
      return;
    }

    // 上传那条路会带回提取出的文字，回填到文本框，让用户看见解析的依据。
    const returned = (payload as { text?: unknown } | null)?.text;
    if (typeof returned === "string" && returned.length > 0) {
      setText(returned);
    }

    const returnedHeadings = (payload as { headings?: unknown } | null)?.headings;
    setHeadings(Array.isArray(returnedHeadings) ? (returnedHeadings as RecognizedHeading[]) : []);

    const returnedSuspected = (payload as { suspectedHeadings?: unknown } | null)?.suspectedHeadings;
    setSuspectedHeadings(Array.isArray(returnedSuspected) ? (returnedSuspected as string[]) : []);

    setResume(parsed);
  }

  async function handleSubmit() {
    if (loading || extracting) return;

    setLoading(true);
    setError("");

    try {
      await sendRequest(JSON.stringify({ resumeText: text }), { "Content-Type": "application/json" });
    } catch {
      setError("无法连接服务器，请确认开发服务器仍在运行，然后重试。");
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
      const formData = new FormData();
      formData.append("resume", file);
      await sendRequest(formData);
    } catch {
      setError("无法连接服务器，请确认开发服务器仍在运行，然后重试。");
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
              解析完成后，姓名、学校专业学历、技能与优势会显示在这里。
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
