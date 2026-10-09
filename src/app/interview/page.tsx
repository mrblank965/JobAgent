"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";

export default function InterviewPage() {
  const { interviews, setInterviewAnswer } = useStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState("");

  if (interviews.length === 0) {
    return (
      <>
        <div className="view-head">
          <h1>🎤 面试陪练</h1>
        </div>
        <div className="empty">
          <span className="big">🎧</span>
          把投递看板的卡片拖入「面试」列，会自动生成五组练习题。
          <div className="mt12">
            <Link className="btn primary" href="/board">
              去看板
            </Link>
          </div>
        </div>
      </>
    );
  }

  const active = interviews.find((item) => item.id === activeId) ?? interviews[0];
  const groups = Object.keys(active.groups);
  const group = activeGroup && groups.includes(activeGroup) ? activeGroup : groups[0];
  const list = active.groups[group] ?? [];

  return (
    <>
      <div className="view-head">
        <div className="spread">
          <h1>🎤 面试陪练</h1>
          <span className="tiny">{interviews.length} 份记录</span>
        </div>
        <p>五组练习题，答案随打随存。数据只在页面内存里，刷新即清空。</p>
      </div>

      <div className="card mb12">
        <div className="row">
          <span className="tiny">选择一场面试</span>
          {interviews.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`itab${item.id === active.id ? " active" : ""}`}
              onClick={() => {
                setActiveId(item.id);
                setActiveGroup("");
              }}
            >
              {item.company || "未知公司"} · {item.title || "未命名岗位"}
            </button>
          ))}
        </div>
      </div>

      <div className="row mb12">
        {groups.map((name) => (
          <button
            key={name}
            type="button"
            className={`itab${name === group ? " active" : ""}`}
            onClick={() => setActiveGroup(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {list.map((qa, index) => (
        <div key={qa.q} className="iq">
          <div className="q">{qa.q}</div>
          <textarea
            className="input"
            style={{ height: 110 }}
            value={qa.a}
            onChange={(event) => setInterviewAnswer(active.id, group, index, event.target.value)}
            placeholder="在这里写下你的答案，边想边打……"
          />
        </div>
      ))}

      <div className="tiny mt12">
        题目由本地规则按公司名和岗位名生成，不调用模型。接入成员 C 的接口后可以换成针对 JD 的定制题目。
      </div>
    </>
  );
}
