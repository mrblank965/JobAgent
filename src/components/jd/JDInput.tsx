"use client";

import { useState } from "react";

export function JDInput() {
  const [value, setValue] = useState("");

  return (
    <div className="card">
      <div className="spread">
        <h3>岗位描述（JD）</h3>
        <span className="tiny">{value.trim().length} 字</span>
      </div>

      <textarea
        id="jd"
        className="input"
        style={{ height: 380 }}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="粘贴岗位职责、任职要求、技能要求等……"
      />

      <div className="row mt8">
        <button type="button" className="btn primary" disabled={value.trim().length < 20}>
          分析岗位并开始匹配
        </button>
      </div>

      <div className="tiny mt8">按钮暂未连接 API，由 JD 解析模块和匹配模块共同接入。</div>
    </div>
  );
}
