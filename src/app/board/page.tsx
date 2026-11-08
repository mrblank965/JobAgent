"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DIRECTIONS } from "@/lib/career";
import { STATUSES, useStore } from "@/lib/store";
import type { ApplicationStatus } from "@/types/application";

/** 截止日期早于今天、又还没结束的投递，算逾期。 */
function overdueDays(deadline: string, status: ApplicationStatus): number {
  if (!deadline || status === "已结束") return 0;
  const due = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

/** 列内排序：截止日期早的在前，没有日期的排最后。 */
function byDeadline(left: { deadline: string }, right: { deadline: string }) {
  if (!left.deadline && !right.deadline) return 0;
  if (!left.deadline) return 1;
  if (!right.deadline) return -1;
  return left.deadline.localeCompare(right.deadline);
}

export default function BoardPage() {
  const router = useRouter();
  const { apps, addApp, moveApp, updateApp, removeApp, interviews, resumeVariants, storageReady } = useStore();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const selected = apps.find((item) => item.id === selectedId) ?? null;
  /** 这条投递已经生成过练习题时，按钮改成「继续练习」。 */
  const selectedHasInterview = selected ? interviews.some((item) => item.id === selected.id) : false;

  /** 顶部统计：逾期条数、本周新增。 */
  const overdueCount = apps.filter((item) => overdueDays(item.deadline, item.status) > 0).length;
  // 渲染期间不能直接调 Date.now()，用惰性初始值取一次「现在」。
  const [nowTs] = useState(() => Date.now());
  const weekAgo = nowTs - 7 * 86400000;
  const weekCount = apps.filter((item) => new Date(item.createdAt).getTime() >= weekAgo).length;

  /** 卡片底部显示用的是哪份简历版本。 */
  function describeVariant(variantId: string): string {
    if (!variantId) return "⚠ 未指定简历版本";
    const variant = resumeVariants.find((item) => item.id === variantId);
    if (!variant) return "简历版本已删除";
    const direction = DIRECTIONS.find((item) => item.id === variant.directionId)?.name ?? "待分类";
    return `${direction} · ${variant.name}`;
  }

  /** B8：把投递记录导出成 CSV，Excel 打开不乱码。 */
  function exportCsv() {
    const header = ["公司", "岗位", "所处阶段", "截止日期", "简历版本", "下一步行动", "阻塞原因", "更新时间"];
    const cell = (value: string) => `"${(value ?? "").replace(/"/g, '""')}"`;
    const rows = apps.map((item) => [
      item.company,
      item.title,
      item.status,
      item.deadline,
      describeVariant(item.resumeVariantId).replace("⚠ ", ""),
      item.nextAction,
      item.blocker,
      new Date(item.updatedAt).toLocaleString("zh-CN"),
    ]);

    const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join(String.fromCharCode(10));
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `投递记录-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`已导出 ${apps.length} 条投递记录。`);
  }

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

  return (
    <>
      <div className="view-head">
        <div className="spread">
          <h1>📮 投递看板</h1>
          <button type="button" className="btn sm" onClick={exportCsv} disabled={apps.length === 0}>
            ⬇ 导出 CSV
          </button>
        </div>
        <p>拖拽改变投递阶段；点击卡片补充简历版本、截止日期和下一步行动。阶段改成「面试」后，详情里会出现面试陪练入口。</p>
      </div>

      <div className="row mb12 tiny" style={{ gap: 18 }}>
        <span>待投递 <b>{apps.filter((item) => item.status === "待投递").length}</b></span>
        <span>逾期 <b className={overdueCount > 0 ? "warn-text" : ""}>{overdueCount}</b></span>
        <span>本周新增 <b>{weekCount}</b></span>
        <span>面试中 <b>{apps.filter((item) => item.status === "面试").length}</b></span>
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
          const column = apps
            .filter((item) => item.status === status)
            .sort(byDeadline);
          return (
            <div key={status} className={`kcol${overColumn === status ? " dragover" : ""}`} onDragOver={(event) => { event.preventDefault(); setOverColumn(status); }} onDragLeave={() => setOverColumn((current) => (current === status ? null : current))} onDrop={() => handleDrop(status)}>
              <h4>{status}<span className="cnt">{column.length}</span></h4>
              {column.map((item) => (
                <div key={item.id} className={`kcard${overdueDays(item.deadline, item.status) > 0 ? " overdue" : ""}`} draggable onClick={() => setSelectedId(item.id)} onDragStart={() => setDragId(item.id)} onDragEnd={() => { setDragId(null); setOverColumn(null); }}>
                  <div className="co">{item.company || "未知公司"}</div>
                  <div className="ti">{item.title || "未命名岗位"}</div>
                  <div className="row gap8">
                    {item.blocker ? <span className="tag miss">有阻塞</span> : null}
                    {item.deadline ? <span className="tiny">截止 {item.deadline}</span> : null}
                    {overdueDays(item.deadline, item.status) > 0 ? (
                      <span className="tag miss">逾期 {overdueDays(item.deadline, item.status)} 天</span>
                    ) : null}
                  </div>
                  <div className="tiny kcard-variant">
                    {describeVariant(item.resumeVariantId)}
                  </div>
                  <div className="ops">
                    <button type="button" className="btn sm" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>详情</button>
                    <button type="button" className="btn sm danger" onClick={(event) => { event.stopPropagation(); removeApp(item.id); if (selectedId === item.id) setSelectedId(null); }}>删除</button>
                  </div>
                  <div className="kcard-quick">
                    {item.status !== "面试" ? (
                      <button type="button" className="btn sm" onClick={(event) => { event.stopPropagation(); moveApp(item.id, "面试"); }}>🎤 面试</button>
                    ) : null}
                    {item.status === "待投递" ? (
                      <button type="button" className="btn sm" onClick={(event) => { event.stopPropagation(); moveApp(item.id, "已投递"); }}>✅ 已投递</button>
                    ) : null}
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
            <div><label className="fl">所处阶段</label><select className="input" value={selected.status} onChange={(event) => moveApp(selected.id, event.target.value as ApplicationStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div>
              <label className="fl">使用的简历版本</label>
              <select className="input" value={selected.resumeVariantId} onChange={(event) => updateApp(selected.id, { resumeVariantId: event.target.value })}><option value="">— 尚未指定 —</option>{resumeVariants.map((item) => <option key={item.id} value={item.id}>{DIRECTIONS.find((direction) => direction.id === item.directionId)?.name ?? "待分类"} · {item.name}{item.isDefault ? "（默认）" : ""}</option>)}</select>
              {selected.resumeVariantId === "" ? (
                <div className="tiny mt8">还没有指定简历版本，投递前请在这里手动选一份。</div>
              ) : null}
            </div>
            <div><label className="fl">截止日期</label><input className="input" type="date" value={selected.deadline} onChange={(event) => updateApp(selected.id, { deadline: event.target.value })} /></div>
          </div>

          {selected.status === "面试" ? (
            <div className="row mt8">
              <Link className="btn primary" href="/interview">
                {selectedHasInterview ? "🎤 继续练习" : "🎤 去面试陪练"}
              </Link>
              <span className="tiny">五组练习题已生成，答案自动保存在本机浏览器。</span>
            </div>
          ) : (
            <div className="row mt8">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  // 一步到位：改阶段 + 生成练习题 + 直接跳到面试页
                  moveApp(selected.id, "面试");
                  router.push("/interview");
                }}
              >
                🎤 开始面试练习
              </button>
              <span className="tiny">会把这条件改成「面试」并生成五组练习题。</span>
            </div>
          )}

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
