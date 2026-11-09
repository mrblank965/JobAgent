"use client";

import Link from "next/link";
import { AISettingsCard } from "@/components/home/AISettingsCard";
import { useStore } from "@/lib/store";

const steps = [
  { n: "01", label: "解析简历" },
  { n: "02", label: "拆解 JD" },
  { n: "03", label: "岗位匹配" },
  { n: "04", label: "简历定制" },
];

export default function Home() {
  const { jds, resumeDraft, resumeVariants } = useStore();

  const resumeReady = resumeDraft.text.trim().length >= 30 || resumeVariants.length > 0;
  const jdReady = jds.length > 0;
  const ready = resumeReady && jdReady;

  const nextStepText = ready
    ? "简历与 JD 都已就绪，可以进入「岗位匹配」查看覆盖率与缺口。"
    : resumeReady && !jdReady
      ? "简历已就绪，还需要拆解一份 JD。"
      : jdReady && !resumeReady
        ? "JD 已就绪，还需要解析一份简历。"
        : "先在「简历解析」准备一份简历，再到「JD 拆解器」粘贴岗位原文。";

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
          <div className="n">{resumeReady ? "✓" : "—"}</div>
          <div className="l">简历已就绪</div>
        </div>
        <div className="stat">
          <div className="n">{jdReady ? "✓" : "—"}</div>
          <div className="l">JD 已就绪</div>
        </div>
      </div>

      <div className="nextstep">
        <b>{ready ? "材料已准备完成" : "准备开始分析"}</b>
        <div className="muted mt8">{nextStepText}</div>
      </div>

      <div className="split">
        <div className="card">
          <div className="spread">
            <h3>简历解析</h3>
            <span className={`tag ${resumeReady ? "hit" : "partial"}`}>{resumeReady ? "已完成" : "待开始"}</span>
          </div>
          <p className="tiny mt8">上传 PDF、DOCX，或直接粘贴简历全文，解析出教育、实习、项目、技能与个人优势。</p>
          <div className="row mt16">
            <Link className="btn primary" href="/resume">
              {resumeReady ? "继续编辑简历" : "去解析简历"}
            </Link>
            {resumeVariants.length > 0 ? <span className="tiny">已保存 {resumeVariants.length} 个简历版本</span> : null}
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>JD 拆解</h3>
            <span className={`tag ${jdReady ? "hit" : "partial"}`}>{jdReady ? `已存 ${jds.length} 份` : "待开始"}</span>
          </div>
          <p className="tiny mt8">粘贴岗位原文，提取关键词与职责要求，逐条比对技能，并整理投递信息。</p>
          <div className="row mt16">
            <Link className="btn primary" href="/jd">
              {jdReady ? "查看已存 JD" : "去拆解 JD"}
            </Link>
          </div>
        </div>
      </div>

      <AISettingsCard />
    </>
  );
}
