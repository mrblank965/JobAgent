"use client";

import { useState, type ChangeEvent } from "react";
import { DIRECTIONS } from "@/lib/career";
import { buildAutofillPackage } from "@/lib/autofill/package";
import { DEGREE_OPTIONS, JOB_TYPES, useStore } from "@/lib/store";
import type { AutofillPackageV1 } from "@/types/autofill";

export default function ProfilePage() {
  const {
    profile,
    setProfile,
    resumeVariants,
    addResumeVariant,
    updateResumeVariant,
    removeResumeVariant,
    answerBank,
    addAnswer,
    updateAnswer,
    removeAnswer,
    storageReady,
    storageError,
    exportWorkspace,
    importWorkspace,
    clearWorkspace,
  } = useStore();
  const [resumeName, setResumeName] = useState("");
  const [directionId, setDirectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [autofillResumeId, setAutofillResumeId] = useState("");
  const [autofillPreview, setAutofillPreview] = useState<AutofillPackageV1 | null>(null);
  const directionGroups = DIRECTIONS.map((direction) => ({
    id: direction.id,
    name: direction.name,
    resumes: resumeVariants.filter((item) => item.directionId === direction.id),
  })).filter((group) => group.resumes.length > 0);
  const uncategorizedResumes = resumeVariants.filter(
    (item) => !DIRECTIONS.some((direction) => direction.id === item.directionId),
  );
  const effectiveAutofillResumeId =
    autofillResumeId || resumeVariants.find((item) => item.isDefault)?.id || resumeVariants[0]?.id || "";

  function createAutofillPackage() {
    const resumeVariant = resumeVariants.find((item) => item.id === effectiveAutofillResumeId);
    if (!resumeVariant) return null;
    return buildAutofillPackage({ profile, resumeVariant, answerBank });
  }

  function previewAutofillPackage() {
    const next = createAutofillPackage();
    if (!next) {
      setNotice("请先保存至少一个简历版本。");
      return;
    }
    setAutofillPreview(next);
    setNotice("资料包只包含预览中的字段；不会包含投递记录、API Key、密码或验证码。");
  }

  function downloadAutofillPackage() {
    const next = createAutofillPackage();
    if (!next) {
      setNotice("请先保存至少一个简历版本。");
      return;
    }

    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const safeName = next.resumeVariant.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "resume";
    link.href = URL.createObjectURL(blob);
    link.download = `jobagent-autofill-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setAutofillPreview(next);
    setNotice("网申资料包已导出。请在简历助手扩展中选择这个 JSON 文件导入。");
  }

  function downloadBackup() {
    const blob = new Blob([exportWorkspace()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `jobagent-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("本地数据备份已导出。API Key 不包含在备份中。");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importWorkspace(await file.text());
    setNotice(result.ok ? "备份导入成功。" : result.error);
  }

  return (
    <>
      <div className="view-head">
        <h1>🗂️ 网申资料库</h1>
        <p>集中管理可复用的个人资料、简历版本与常用回答。所有内容只保存在当前浏览器。</p>
      </div>

      {!storageReady ? <div className="warnbox mb12">正在读取本地资料…</div> : null}
      {storageError ? <div className="errbox mb12">{storageError}</div> : null}
      {notice ? <div className="warnbox mb12">{notice}</div> : null}

      <div className="split">
        <section className="card">
          <h3>基本资料</h3>
          <div className="split">
            <div>
              <label className="fl">姓名</label>
              <input className="input" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <label className="fl">所在地</label>
              <input className="input" value={profile.location} onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))} placeholder="例如 上海" />
            </div>
            <div>
              <label className="fl">邮箱</label>
              <input className="input" type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div>
              <label className="fl">手机号</label>
              <input className="input" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div>
              <label className="fl">学校</label>
              <input className="input" value={profile.school} onChange={(event) => setProfile((current) => ({ ...current, school: event.target.value }))} />
            </div>
            <div>
              <label className="fl">专业</label>
              <input className="input" value={profile.major} onChange={(event) => setProfile((current) => ({ ...current, major: event.target.value }))} />
            </div>
            <div>
              <label className="fl">学历</label>
              <select className="input" value={profile.degree} onChange={(event) => setProfile((current) => ({ ...current, degree: event.target.value }))}>
                {DEGREE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">毕业年份</label>
              <input className="input" value={profile.gradYear} onChange={(event) => setProfile((current) => ({ ...current, gradYear: event.target.value }))} placeholder="例如 2026" />
            </div>
            <div>
              <label className="fl">求职类型</label>
              <select className="input" value={profile.jobType} onChange={(event) => setProfile((current) => ({ ...current, jobType: event.target.value }))}>
                {JOB_TYPES.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <label className="fl">简历识别出的技能</label>
          <div>{profile.skills.length > 0 ? profile.skills.map((item) => <span className="chip hit" key={item}>{item}</span>) : <span className="tiny">完成简历解析后自动同步。</span>}</div>

          <label className="fl">工作许可 / 签证情况</label>
          <textarea className="input" rows={3} value={profile.workAuthorization} onChange={(event) => setProfile((current) => ({ ...current, workAuthorization: event.target.value, workAuthorizationConfirmed: false }))} placeholder="不确定时请留空，不要让系统猜测" />
          <label className="row mt8">
            <input type="checkbox" checked={profile.workAuthorizationConfirmed} onChange={(event) => setProfile((current) => ({ ...current, workAuthorizationConfirmed: event.target.checked }))} />
            <span>我已核对这项敏感信息</span>
          </label>
        </section>

        <section className="card">
          <h3>本地数据管理</h3>
          <p className="muted">资料保存在浏览器 IndexedDB。备份中不包含 AI API Key。</p>
          <div className="row mt16">
            <button type="button" className="btn primary" onClick={downloadBackup}>导出 JSON 备份</button>
            <label className="btn">
              导入备份
              <input type="file" accept="application/json,.json" hidden onChange={importBackup} />
            </label>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                if (!window.confirm("确定清空当前浏览器里的全部求职资料吗？建议先导出备份。")) return;
                await clearWorkspace();
                setNotice("本地资料已清空。");
              }}
            >
              清空本地资料
            </button>
          </div>
          <div className="nextstep mt16">
            <b>隐私边界</b>
            <div className="muted mt8">密码、验证码、身份证号码和银行卡信息不进入资料库；提交前仍需本人确认。</div>
          </div>
        </section>
      </div>

      <section className="card mt16">
        <div className="spread">
          <div>
            <h3>简历版本</h3>
            <div className="tiny">记录不同岗位方向使用的简历；正文可以从“简历解析”页保存。</div>
          </div>
          <div className="row">
            <input className="input" style={{ width: 180 }} value={resumeName} onChange={(event) => setResumeName(event.target.value)} placeholder="版本名称" />
            <select className="input" style={{ width: 220 }} value={directionId} onChange={(event) => setDirectionId(event.target.value)}>
              <option value="">— 选择适用方向 —</option>
              {DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => {
              if (!resumeName.trim() || !directionId) return;
              addResumeVariant({ name: resumeName.trim(), directionId, sourceText: "" });
              setResumeName("");
              setDirectionId("");
            }} disabled={!resumeName.trim() || !directionId}>新增版本</button>
          </div>
        </div>
        {resumeVariants.length === 0 ? <div className="empty mt12">还没有简历版本。解析简历后选择方向并保存，就会显示在这里。</div> : (
          <div className="mt12">
            {[...directionGroups, ...(uncategorizedResumes.length > 0 ? [{ id: "uncategorized", name: "待分类", resumes: uncategorizedResumes }] : [])].map((group) => (
              <div className="nextstep" key={group.id}>
                <div className="spread">
                  <div><b>{group.name}</b><div className="tiny">{group.resumes.length} 个简历版本</div></div>
                </div>
                <div className="mt8">
                  {group.resumes.map((item) => (
                    <div className="iq" key={item.id}>
                      <div className="spread">
                        <div><b>{item.name}</b> {item.isDefault ? <span className="tag hit">默认</span> : null}<div className="tiny">{item.structuredData ? "已保存结构化资料" : item.sourceText ? "仅有简历正文" : "仅版本记录"}</div></div>
                        <div className="row">
                          <select className="input" style={{ width: 190 }} value={item.directionId} onChange={(event) => updateResumeVariant(item.id, { directionId: event.target.value })}>
                            <option value="">待分类</option>
                            {DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
                          </select>
                          {!item.isDefault ? <button type="button" className="btn sm" onClick={() => updateResumeVariant(item.id, { isDefault: true })}>设为默认</button> : null}
                          <button type="button" className="btn sm danger" onClick={() => removeResumeVariant(item.id)}>删除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt16">
        <div className="spread">
          <div>
            <h3>同步到简历助手</h3>
            <div className="tiny">第一版使用 JSON 文件交换；扩展只负责填写，不会自动提交网申。</div>
          </div>
          <span className="tag">jobagent-autofill-package v1</span>
        </div>

        {resumeVariants.length === 0 ? (
          <div className="empty mt12">请先从“简历解析”页面保存一个带方向的简历版本。</div>
        ) : (
          <>
            <div className="split mt12">
              <div>
                <label className="fl" htmlFor="autofill-resume">本次使用的简历版本</label>
                <select
                  id="autofill-resume"
                  className="input"
                  value={effectiveAutofillResumeId}
                  onChange={(event) => {
                    setAutofillResumeId(event.target.value);
                    setAutofillPreview(null);
                  }}
                >
                  {resumeVariants.map((item) => {
                    const directionName = DIRECTIONS.find((direction) => direction.id === item.directionId)?.name ?? "待分类";
                    return <option key={item.id} value={item.id}>{item.name} · {directionName}</option>;
                  })}
                </select>
              </div>
              <div className="nextstep">
                <b>只导出必要资料</b>
                <div className="tiny mt8">基本资料、所选简历的结构化经历，以及内容已核对的常用回答。</div>
              </div>
            </div>

            {!resumeVariants.find((item) => item.id === effectiveAutofillResumeId)?.structuredData ? (
              <div className="warnbox mt12">这个旧版本没有结构化经历。仍可导出基本资料，但建议回到简历解析页重新保存该版本。</div>
            ) : null}

            <div className="row mt12">
              <button type="button" className="btn" onClick={previewAutofillPackage}>预览资料包</button>
              <button type="button" className="btn primary" onClick={downloadAutofillPackage}>导出到简历助手</button>
            </div>

            {autofillPreview ? (
              <div className="nextstep mt12">
                <div className="spread">
                  <div>
                    <b>导出预览</b>
                    <div className="tiny">
                      教育 {autofillPreview.education.length} 条 · 实习/工作 {autofillPreview.experiences.length} 条 · 项目 {autofillPreview.projects.length} 条 · 已确认回答 {autofillPreview.confirmedAnswers.length} 条
                    </div>
                  </div>
                  <span className="tag hit">仅保存在本机</span>
                </div>
                <pre style={{ marginTop: 12, maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12 }}>
                  {JSON.stringify(autofillPreview, null, 2)}
                </pre>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="card mt16">
        <h3>常用回答</h3>
        <div className="split">
          <div><label className="fl">问题</label><input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：为什么申请本岗位？" /></div>
          <div><label className="fl">回答</label><textarea className="input" rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} /></div>
        </div>
        <button type="button" className="btn mt12" onClick={() => {
          if (!question.trim()) return;
          addAnswer({ question: question.trim(), answer: answer.trim(), confirmed: false });
          setQuestion("");
          setAnswer("");
        }}>加入回答库</button>
        <div className="mt16">
          {answerBank.map((item) => (
            <div className="iq" key={item.id}>
              <input className="input" value={item.question} onChange={(event) => updateAnswer(item.id, { question: event.target.value, confirmed: false })} />
              <textarea className="input mt8" rows={3} value={item.answer} onChange={(event) => updateAnswer(item.id, { answer: event.target.value, confirmed: false })} />
              <div className="spread mt8">
                <label className="row"><input type="checkbox" checked={item.confirmed} onChange={(event) => updateAnswer(item.id, { confirmed: event.target.checked })} /><span>内容已核对</span></label>
                <button type="button" className="btn sm danger" onClick={() => removeAnswer(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
