import { ResumeUpload } from "@/components/resume/ResumeUpload";

export default function ResumePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm font-semibold text-blue-600">成员 B · 简历模块</p>
      <h1 className="mt-2 text-3xl font-bold">简历解析</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">上传 PDF 或 DOCX，最终将在这里展示教育背景、技能、实习和项目经历。</p>
      <div className="mt-8"><ResumeUpload /></div>
    </main>
  );
}
