import { ResumeParserPanel } from "@/components/resume/ResumeParserPanel";

export default function ResumePage() {
  return (
    <>
      <div className="view-head">
        <h1>🪶 简历解析</h1>
        <p>上传 PDF 或 DOCX，或直接粘贴简历全文；解析出姓名、教育、经历、技能和优势，每一项都可以修改。</p>
      </div>

      <ResumeParserPanel />
    </>
  );
}
