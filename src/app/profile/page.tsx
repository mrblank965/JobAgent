"use client";

import { useState, type ChangeEvent } from "react";
import { DIRECTIONS } from "@/lib/career";
import { DEGREE_OPTIONS, JOB_TYPES, useStore } from "@/lib/store";

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
  const directionGroups = DIRECTIONS.map((direction) => ({
    id: direction.id,
    name: direction.name,
    resumes: resumeVariants.filter((item) => item.directionId === direction.id),
  })).filter((group) => group.resumes.length > 0);
  const uncategorizedResumes = resumeVariants.filter(
    (item) => !DIRECTIONS.some((direction) => direction.id === item.directionId),
  );

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
                        <div><b>{item.name}</b> {item.isDefault ? <span className="tag hit">默认</span> : null}<div className="tiny">{item.sourceText ? "已保存简历正文" : "仅版本记录"}</div></div>
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
