"use client";

import { useState } from "react";
import { DIRECTIONS } from "@/lib/career";
import { STATUSES, useStore } from "@/lib/store";
import { RECRUITMENT_STAGES, type ApplicationStatus, type RecruitmentStage } from "@/types/application";

export default function BoardPage() {
  const { apps, addApp, moveApp, updateApp, removeApp, ensureInterview, resumeVariants, storageReady } = useStore();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const selected = apps.find((item) => item.id === selectedId) ?? null;

  function handleAdd() {
    if (!company.trim() && !title.trim()) {
      setNotice("公司或岗位至少填一个。");
      return;
    }
    addApp({ company: company.trim(), title: title.trim(), status: "待投递" });
    setCompany("");
    setTitle("");
    setNotice("");
  }

  function handleDrop(status: ApplicationStatus) {
    if (!dragId) return;
    moveApp(dragId, status);
    setDragId(null);
    setOverColumn(null);
  }

  function changeStage(stage: RecruitmentStage) {
    if (!selected) return;
    updateApp(selected.id, { stage });
    if (stage === "面试") ensureInterview({ ...selected, stage });
  }

  return (
    <>
      <div className="view-head">
        <h1>📮 投递看板</h1>
        <p>拖拽管理申请状态；点击卡片补充招聘阶段、简历版本和下一步行动。</p>
      </div>

      {!storageReady ? <div className="warnbox mb12">正在读取本地投递记录…</div> : null}

      <div className="card mb12">
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 160 }} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="公司" />
          <input className="input" style={{ flex: 1, minWidth: 160 }} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="岗位" />
          <button type="button" className="btn primary" onClick={handleAdd}>＋ 新增一条投递</button>
          <span className="tiny">当前共 {apps.length} 条，自动保存到本机浏览器。</span>
        </div>
        {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
      </div>

      <div className="board">
        {STATUSES.map((status) => {
          const column = apps.filter((item) => item.status === status);
          return (
            <div key={status} className={`kcol${overColumn === status ? " dragover" : ""}`} onDragOver={(event) => { event.preventDefault(); setOverColumn(status); }} onDragLeave={() => setOverColumn((current) => (current === status ? null : current))} onDrop={() => handleDrop(status)}>
              <h4>{status}<span className="cnt">{column.length}</span></h4>
              {column.map((item) => (
                <div key={item.id} className="kcard" draggable onClick={() => setSelectedId(item.id)} onDragStart={() => setDragId(item.id)} onDragEnd={() => { setDragId(null); setOverColumn(null); }}>
                  <div className="co">{item.company || "未知公司"}</div>
                  <div className="ti">{item.title || "未命名岗位"}</div>
                  <div className="row gap8">
                    {item.stage !== "暂无" ? <span className="tag hit">{item.stage}</span> : null}
                    {item.blocker ? <span className="tag miss">有阻塞</span> : null}
                    {item.deadline ? <span className="tiny">截止 {item.deadline}</span> : null}
                  </div>
                  <div className="ops">
                    <button type="button" className="btn sm" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>详情</button>
                    <button type="button" className="btn sm danger" onClick={(event) => { event.stopPropagation(); removeApp(item.id); if (selectedId === item.id) setSelectedId(null); }}>删除</button>
                  </div>
                </div>
              ))}
              {column.length === 0 ? <div className="tiny" style={{ padding: "4px 4px 10px" }}>拖到这里</div> : null}
            </div>
          );
        })}
      </div>

      {selected ? (
        <section className="card mt16">
          <div className="spread">
            <div><h3>{selected.company || "未知公司"} · {selected.title || "未命名岗位"}</h3><div className="tiny">创建于 {new Date(selected.createdAt).toLocaleString("zh-CN")}</div></div>
            <button type="button" className="btn ghost" onClick={() => setSelectedId(null)}>收起详情</button>
          </div>

          <div className="split">
            <div><label className="fl">申请状态</label><select className="input" value={selected.status} onChange={(event) => moveApp(selected.id, event.target.value as ApplicationStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div><label className="fl">招聘阶段</label><select className="input" value={selected.stage} onChange={(event) => changeStage(event.target.value as RecruitmentStage)}>{RECRUITMENT_STAGES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div><label className="fl">使用的简历版本</label><select className="input" value={selected.resumeVariantId} onChange={(event) => updateApp(selected.id, { resumeVariantId: event.target.value })}><option value="">— 尚未指定 —</option>{resumeVariants.map((item) => <option key={item.id} value={item.id}>{DIRECTIONS.find((direction) => direction.id === item.directionId)?.name ?? "待分类"} · {item.name}{item.isDefault ? "（默认）" : ""}</option>)}</select></div>
            <div><label className="fl">截止日期</label><input className="input" type="date" value={selected.deadline} onChange={(event) => updateApp(selected.id, { deadline: event.target.value })} /></div>
          </div>

          <label className="fl">招聘链接</label>
          <input className="input" type="url" value={selected.jobUrl} onChange={(event) => updateApp(selected.id, { jobUrl: event.target.value })} placeholder="https://…" />
          <div className="split">
            <div><label className="fl">下一步行动</label><textarea className="input" rows={3} value={selected.nextAction} onChange={(event) => updateApp(selected.id, { nextAction: event.target.value })} placeholder="例如：周五前补充成绩单" /></div>
            <div><label className="fl">阻塞原因</label><textarea className="input" rows={3} value={selected.blocker} onChange={(event) => updateApp(selected.id, { blocker: event.target.value })} placeholder="验证码、缺少证明、需要本人确认等" /></div>
          </div>
          <label className="fl">备注</label>
          <textarea className="input" rows={3} value={selected.note} onChange={(event) => updateApp(selected.id, { note: event.target.value })} />

          <div className="mt16">
            <div className="subhead">时间线</div>
            {selected.timeline.slice().reverse().map((event) => <div className="iq" key={event.id}><b>{event.description}</b><div className="tiny">{new Date(event.at).toLocaleString("zh-CN")}</div></div>)}
          </div>
        </section>
      ) : null}

      {apps.length === 0 ? <div className="empty mt16"><span className="big">📮</span>看板还是空的。可以从 JD 拆解器加入岗位，或在上方直接新增。</div> : null}
    </>
  );
}
