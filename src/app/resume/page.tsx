import { ResumeParserPanel } from "@/components/resume/ResumeParserPanel";

export default function ResumePage() {
  return (
    <>
      <div className="view-head">
        <h1>🪶 简历解析</h1>
        <p>上传 PDF 或 DOCX，或直接粘贴简历全文；解析结果与编辑进度会自动保存在本机，切换页面后仍可继续。</p>
      </div>

      <ResumeParserPanel />
    </>
  );
}
