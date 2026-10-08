"use client";

import { useState } from "react";

export function ResumeUpload() {
  const [fileName, setFileName] = useState("");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-2xl text-blue-700">↑</span>
        <span className="font-semibold">{fileName || "点击选择 PDF 或 DOCX 简历"}</span>
        <span className="mt-2 text-sm text-slate-500">当前只完成文件选择；文字提取由简历解析模块接入。</span>
        <input
          className="sr-only"
          type="file"
          accept=".pdf,.docx"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
      </label>
    </div>
  );
}
