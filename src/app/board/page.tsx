"use client";

import { useState } from "react";
import { STATUSES, useStore } from "@/lib/store";

export default function BoardPage() {
  const { apps, addApp, moveApp, removeApp, ensureInterview } = useStore();

  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function handleAdd() {
    if (!company.trim() && !title.trim()) {
      setNotice("公司或岗位至少填一个。");
      return;
    }
    addApp({ company: company.trim(), title: title.trim(), status: STATUSES[0], note: "" });
    setCompany("");
    setTitle("");
    setNotice("");
  }

  function handleDrop(status: string) {
    if (!dragId) return;

    moveApp(dragId, status);

    // 拖进「面试」列时自动建一份陪练记录，和参考页的行为一致
    if (status === "面试") {
      const app = apps.find((item) => item.id === dragId);
      if (app) ensureInterview({ ...app, status });
    }

    setDragId(null);
    setOverColumn(null);
  }

  return (
    <>
      <div className="view-head">
        <h1>📮 投递看板</h1>
        <p>六列拖拽流转，时间线留痕。拖入「面试」会自动在面试陪练里建一份记录。</p>
      </div>

      <div className="card mb12">
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="公司"
          />
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="岗位"
          />
          <button type="button" className="btn primary" onClick={handleAdd}>
            ＋ 新增一条投递
          </button>
          <span className="tiny">当前共 {apps.length} 条，数据只在页面内存里，刷新即清空。</span>
        </div>
        {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
      </div>

      <div className="board">
        {STATUSES.map((status) => {
          const column = apps.filter((item) => item.status === status);

          return (
            <div
              key={status}
              className={`kcol${overColumn === status ? " dragover" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOverColumn(status);
              }}
              onDragLeave={() => setOverColumn((current) => (current === status ? null : current))}
              onDrop={() => handleDrop(status)}
            >
              <h4>
                {status}
                <span className="cnt">{column.length}</span>
              </h4>

              {column.map((item) => (
                <div
                  key={item.id}
                  className="kcard"
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverColumn(null);
                  }}
                >
                  <div className="co">{item.company || "未知公司"}</div>
                  <div className="ti">{item.title || "未命名岗位"}</div>
                  <div className="ops">
                    <button type="button" className="btn sm danger" onClick={() => removeApp(item.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}

              {column.length === 0 ? <div className="tiny" style={{ padding: "4px 4px 10px" }}>拖到这里</div> : null}
            </div>
          );
        })}
      </div>

      {apps.length === 0 ? (
        <div className="empty mt16">
          <span className="big">📮</span>
          看板还是空的。可以先到「JD 拆解器」拆一份 JD 再点加入投递，或者在上面直接新增一条。
        </div>
      ) : null}
    </>
  );
}
