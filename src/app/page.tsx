"use client";

import { useMemo, useState } from "react";

const steps = ["上传简历", "粘贴 JD", "AI 分析", "生成建议"];

export default function Home() {
  const [resumeName, setResumeName] = useState("");
  const [jd, setJd] = useState("");
  const ready = Boolean(resumeName && jd.trim().length >= 20);
  const jdLength = useMemo(() => jd.trim().length, [jd]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-bold text-white">J</span>
            <div>
              <p className="text-lg font-bold">JobAgent</p>
              <p className="text-xs text-slate-500">AI 求职智能助手</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">中期演示版</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold tracking-widest text-blue-600">RESUME × JOB DESCRIPTION</p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">让每一份简历，更接近理想岗位</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            上传简历并粘贴职位描述，快速识别匹配优势、能力缺口和有依据的修改建议。
          </p>
        </div>

        <div className="mb-8 grid grid-cols-4 gap-2">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-2 rounded-xl bg-white px-3 py-3 shadow-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{index + 1}</span>
              <span className="hidden text-sm font-medium sm:inline">{step}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600">01</p>
                <h2 className="mt-1 text-xl font-bold">上传你的简历</h2>
              </div>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">PDF / DOCX</span>
            </div>
            <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-2xl text-blue-700">↑</span>
              <span className="font-semibold">{resumeName || "点击选择简历文件"}</span>
              <span className="mt-2 text-sm text-slate-500">中期版本暂不支持扫描图片 OCR</span>
              <input
                className="sr-only"
                type="file"
                accept=".pdf,.docx"
                onChange={(event) => setResumeName(event.target.files?.[0]?.name ?? "")}
              />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600">02</p>
                <h2 className="mt-1 text-xl font-bold">粘贴目标岗位 JD</h2>
              </div>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">已输入 {jdLength} 字</span>
            </div>
            <textarea
              className="min-h-56 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="请粘贴完整的职位描述，包括岗位职责、任职要求、技能要求等……"
              value={jd}
              onChange={(event) => setJd(event.target.value)}
            />
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div>
              <h2 className="text-lg font-bold">准备开始分析</h2>
              <p className="mt-1 text-sm text-slate-500">
                {ready ? "材料已准备完成，可以进入下一阶段。" : "请上传简历，并输入至少 20 个字的岗位描述。"}
              </p>
            </div>
            <button
              type="button"
              disabled={!ready}
              className="w-full rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
            >
              开始智能分析
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">当前为项目协作底座；简历解析、DeepSeek 分析和匹配报告将由各功能分支接入。</p>
      </section>
    </main>
  );
}
