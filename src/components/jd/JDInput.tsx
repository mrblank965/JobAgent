"use client";

import { useState } from "react";

export function JDInput() {
  const [value, setValue] = useState("");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <label htmlFor="jd" className="font-semibold">岗位描述（JD）</label>
        <span className="text-xs text-slate-500">{value.trim().length} 字</span>
      </div>
      <textarea
        id="jd"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-64 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        placeholder="粘贴岗位职责、任职要求、技能要求等……"
      />
      <button
        type="button"
        disabled={value.trim().length < 20}
        className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        分析岗位并开始匹配
      </button>
      <p className="mt-3 text-xs text-slate-500">按钮暂未连接 API，由 JD 解析模块和匹配模块共同接入。</p>
    </div>
  );
}
