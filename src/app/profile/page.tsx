"use client";

import { useState, type ChangeEvent } from "react";
import { DIRECTIONS } from "@/lib/career";
import { buildAutofillPackage } from "@/lib/autofill/package";
import { DEGREE_LABELS } from "@/lib/parsers/resumeText";
import { DEGREE_OPTIONS, JOB_TYPES, useStore } from "@/lib/store";
import type { ExperienceEntry, ResumeData } from "@/types/analysis";
import type { AutofillPackageV1 } from "@/types/autofill";

const PROJECT_CATEGORY_LABELS = {
  paper: "论文",
  competition: "竞赛",
  project: "项目",
} as const;

function ExperienceRows({ items, project = false }: { items: ExperienceEntry[]; project?: boolean }) {
  if (items.length === 0) return <div className="tiny">这个版本没有保存此类经历。</div>;

  return (
    <div className="mt8">
      {items.map((item, index) => (
        <div className="iq" key={`${item.title}-${item.periodStart}-${index}`}>
          <div className="spread">
            <b>{item.title || "未命名条目"}</b>
            <span className="tiny">
              {project && item.category ? `${PROJECT_CATEGORY_LABELS[item.category]} · ` : ""}
              {[item.periodStart, item.periodEnd].filter(Boolean).join(" — ") || "时间未填写"}
            </span>
          </div>
          {item.role ? <div className="muted mt8">{item.role}</div> : null}
          {item.bullets.length > 0 ? (
            <ul className="tiny mt8" style={{ paddingLeft: 20 }}>
              {item.bullets.map((bullet, bulletIndex) => <li key={`${bullet}-${bulletIndex}`}>{bullet}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResumeVersionDetails({ data }: { data: ResumeData }) {
  return (
    <div className="mt12">
      <div className="nextstep">
        <b>教育经历</b>
        {data.education.length === 0 ? <div className="tiny mt8">没有保存教育经历。</div> : (
          <div className="mt8">
            {data.education.map((item, index) => (
              <div className="iq" key={`${item.school}-${item.periodStart}-${index}`}>
                <b>{item.school || "学校未填写"}</b>
                <div className="tiny mt8">
                  {[DEGREE_LABELS[item.degree], item.college, item.major].filter(Boolean).join(" · ") || "学历信息未填写"}
                  {item.periodStart || item.periodEnd ? ` · ${[item.periodStart, item.periodEnd].filter(Boolean).join(" — ")}` : ""}
                </div>
                {item.performance ? <div className="muted mt8">{item.performance}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="nextstep mt12">
        <b>实习与工作经历</b>
        <ExperienceRows items={data.experiences} />
      </div>

      <div className="nextstep mt12">
        <b>项目、竞赛与论文</b>
        <ExperienceRows items={data.projects} project />
      </div>

      <div className="nextstep mt12">
        <b>荣誉与获奖</b>
        <div className="mt8">
          {data.honors.length > 0
            ? data.honors.map((item) => <span className="chip hit" key={item}>{item}</span>)
            : <span className="tiny">这个版本没有保存荣誉或获奖。</span>}
        </div>
      </div>

      <div className="split mt12">
        <div className="nextstep">
          <b>技能</b>
          <div className="mt8">{data.skills.length > 0 ? data.skills.map((item) => <span className="chip" key={item}>{item}</span>) : <span className="tiny">暂无</span>}</div>
        </div>
        <div className="nextstep">
          <b>个人优势</b>
          <div className="mt8">{data.strengths.length > 0 ? data.strengths.map((item) => <span className="chip" key={item}>{item}</span>) : <span className="tiny">暂无</span>}</div>
        </div>
      </div>
    </div>
  );
}

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
    resumeDraft,
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

      <section className="card mb12">
        <h3>资料如何分工</h3>
        <div className="split mt12">
          <div className="nextstep">
            <b>① 简历解析 = 提取与校对</b>
            <div className="tiny mt8">上传或粘贴简历后，先修正姓名、教育、实习、项目、荣誉等内容；没有点击“保存到资料库”前，只是编辑中的草稿。</div>
          </div>
          <div className="nextstep">
            <b>② 网申资料库 = 通用资料 + 简历版本</b>
            <div className="tiny mt8">联系方式等跨岗位共用；实习、项目、获奖、技能等跟随具体方向简历保存，不同版本互不覆盖。</div>
          </div>
          <div className="nextstep">
            <b>③ 投递与扩展 = 按岗位取用</b>
            <div className="tiny mt8">投递某个岗位时先选用哪份简历，再组合通用资料、该版本经历和已确认回答生成网申资料包。</div>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="card">
          <h3>通用网申资料</h3>
          <p className="tiny mt8">姓名、联系方式、求职偏好等跨简历版本共用；从简历解析页保存版本时会同步明确识别出的内容，也可以在这里补充。</p>
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
          <div>{profile.skills.length > 0 ? profile.skills.map((item) => <span className="chip hit" key={item}>{item}</span>) : <span className="tiny">在简历解析页保存版本后自动同步。</span>}</div>

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
            <h3>岗位方向简历库</h3>
            <div className="tiny">每个版本独立保存完整教育、实习/工作、项目、获奖、技能与优势；投递时明确选择其中一份。</div>
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
                        <div>
                          <b>{item.name}</b> {item.isDefault ? <span className="tag hit">默认</span> : null}
                          <div className="tiny">
                            {item.structuredData
                              ? `教育 ${item.structuredData.education.length} · 实习/工作 ${item.structuredData.experiences.length} · 项目 ${item.structuredData.projects.length} · 荣誉 ${item.structuredData.honors.length}`
                              : item.sourceText ? "仅有简历正文" : "仅版本记录"}
                          </div>
                        </div>
                        <div className="row">
                          <select className="input" style={{ width: 190 }} value={item.directionId} onChange={(event) => updateResumeVariant(item.id, { directionId: event.target.value })}>
                            <option value="">待分类</option>
                            {DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
                          </select>
                          {!item.isDefault ? <button type="button" className="btn sm" onClick={() => updateResumeVariant(item.id, { isDefault: true })}>设为默认</button> : null}
                          <button type="button" className="btn sm danger" onClick={() => removeResumeVariant(item.id)}>删除</button>
                        </div>
                      </div>
                      {item.structuredData ? (
                        <details className="mt8">
                          <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 700 }}>查看这份简历的完整资料</summary>
                          <ResumeVersionDetails data={item.structuredData} />
                        </details>
                      ) : (
                        <div className="warnbox mt8">
                          <b>这个旧版本没有结构化经历。</b>
                          {resumeDraft.resume ? (
                            <>
                              <div className="tiny mt8">当前“简历解析”工作区里有一份已解析结果。如果确认就是这份简历，可以直接补全教育、实习、项目、获奖、技能和优势。</div>
                              <button
                                type="button"
                                className="btn sm mt8"
                                onClick={() => {
                                  updateResumeVariant(item.id, {
                                    structuredData: resumeDraft.resume ?? undefined,
                                    sourceText: resumeDraft.text || item.sourceText,
                                  });
                                  setNotice(`已用当前解析结果补全「${item.name}」；请展开版本核对经历内容。`);
                                }}
                              >
                                用当前解析结果补全
                              </button>
                            </>
                          ) : <div className="tiny mt8">请回到简历解析页重新解析、校对并保存。</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mt16" id="resume-assistant-install">
        <div className="spread">
          <div>
            <h3>安装简历助手扩展</h3>
            <div className="tiny">简历助手负责把网申资料包填写到招聘网站；它不会自动点击最终提交。</div>
          </div>
          <span className="tag hit">Chrome / Edge · v2.5.0</span>
        </div>

        <div className="split mt12">
          <div className="nextstep">
            <b>下载安装包</b>
            <div className="tiny mt8">安装包只包含扩展代码，不包含你的简历、联系方式、投递记录或浏览器数据。</div>
            <a
              className="btn primary mt12"
              href="/downloads/jobagent-resume-assistant-v2.5.0.zip"
              download
            >
              下载简历助手 v2.5.0（ZIP）
            </a>
          </div>

          <div className="nextstep">
            <b>Chrome / Edge 安装步骤</b>
            <ol className="tiny mt8" style={{ paddingLeft: 20, lineHeight: 1.8 }}>
              <li>下载 ZIP 后解压，保留包含 manifest.json 的文件夹。</li>
              <li>Chrome 打开 chrome://extensions；Edge 打开 edge://extensions。</li>
              <li>打开右上角“开发者模式”，点击“加载已解压的扩展程序”。</li>
              <li>选择刚解压的文件夹，确认扩展显示“简历助手 2.5.0”。</li>
            </ol>
          </div>
        </div>

        <div className="warnbox mt12">
          如果扩展页仍显示 2.4.1 或“Service Worker（无效）”，请先移除旧版本，再加载新解压的 2.5.0 文件夹。不要直接双击 popup.html；那只是页面文件，不是已安装的扩展。
        </div>

        <div className="nextstep mt12">
          <b>使用顺序</b>
          <div className="tiny mt8">① 在下面选择本次使用的简历版本 → ② 导出 JSON → ③ 点击浏览器工具栏里的简历助手 → ④ 更多设置 → JobAgent 资料包 → ⑤ 选择 JSON、核对预览并导入为新方案。</div>
        </div>
      </section>

      <section className="card mt16">
        <div className="spread">
          <div>
            <h3>同步到简历助手</h3>
            <div className="tiny">第一版使用 JSON 文件交换；扩展只负责填写，不会自动提交网申。尚未安装时，请先使用上面的安装入口。</div>
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
