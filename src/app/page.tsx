"use client";

import { useMemo, useState } from "react";
import { AISettingsCard } from "@/components/home/AISettingsCard";

const steps = [
  { n: "01", label: "上传简历" },
  { n: "02", label: "粘贴 JD" },
  { n: "03", label: "AI 分析" },
  { n: "04", label: "生成建议" },
];

export default function Home() {
  const [resumeName, setResumeName] = useState("");
  const [jd, setJd] = useState("");
  const ready = Boolean(resumeName && jd.trim().length >= 20);
  const jdLength = useMemo(() => jd.trim().length, [jd]);

  return (
    <>
      <div className="greet">
        <div className="gb" />
        <div className="gm">
          <h1>
            让每一份简历，
            <br />
            更接近理想岗位。
          </h1>
          <div className="sub">
            上传简历并粘贴职位描述，快速识别匹配优势、能力缺口和有依据的修改建议。数据只留在你自己的浏览器里。
          </div>
        </div>
      </div>

      <div className="stat-grid">
        {steps.map((step) => (
          <div className="stat" key={step.n}>
            <div className="n">{step.n}</div>
            <div className="l">{step.label}</div>
          </div>
        ))}
        <div className="stat">
          <div className="n">{resumeName ? "✓" : "—"}</div>
          <div className="l">简历已就绪</div>
        </div>
        <div className="stat">
          <div className="n">{jdLength >= 20 ? "✓" : "—"}</div>
          <div className="l">JD 已就绪</div>
        </div>
      </div>

      <div className="nextstep">
        <b>{ready ? "材料已准备完成" : "准备开始分析"}</b>
        <div className="muted mt8">
          {ready ? "可以进入下一阶段。" : "请上传简历，并输入至少 20 个字的岗位描述。"}
        </div>
      </div>

      <div className="split">
        <div className="card">
          <div className="spread">
            <h3>上传你的简历</h3>
            <span className="tag partial">PDF / DOCX</span>
          </div>
          <label className="dropzone">
            <span className="big">↑</span>
            <b>{resumeName || "点击选择简历文件"}</b>
            <span className="tiny mt8">中期版本暂不支持扫描图片 OCR</span>
            <input
              type="file"
              accept=".pdf,.docx"
              className="sr-only"
              onChange={(event) => setResumeName(event.target.files?.[0]?.name ?? "")}
            />
          </label>
        </div>

        <div className="card">
          <div className="spread">
            <h3>粘贴目标岗位 JD</h3>
            <span className="tiny">已输入 {jdLength} 字</span>
          </div>
          <textarea
            className="input"
            style={{ height: 200 }}
            placeholder="请粘贴完整的职位描述，包括岗位职责、任职要求、技能要求等……"
            value={jd}
            onChange={(event) => setJd(event.target.value)}
          />
        </div>
      </div>

      <div className="row mt16">
        <button type="button" className="btn primary" disabled={!ready}>
          开始智能分析
        </button>
        <span className="tiny">当前为项目协作底座；简历解析、DeepSeek 分析和匹配报告将由各功能分支接入。</span>
      </div>

      <AISettingsCard />
    </>
  );
}
