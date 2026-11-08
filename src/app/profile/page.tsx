"use client";

import { useState, type ChangeEvent } from "react";
import { DIRECTIONS } from "@/lib/career";
import { buildAutofillPackage, isAutofillPackageV1 } from "@/lib/autofill/package";
import { DEGREE_LABELS } from "@/lib/parsers/resumeText";
import { CITY_OPTIONS, GENDER_OPTIONS, JOB_TYPES, POLITICAL_OPTIONS, useStore, type Profile, type ResumeVariant } from "@/lib/store";
import type { ExperienceEntry, ResumeData } from "@/types/analysis";

const PROJECT_CATEGORY_LABELS = {
  paper: "论文",
  competition: "竞赛",
  project: "项目",
} as const;

function formatExperience(item: ExperienceEntry) {
  const title = [item.title, item.role].filter(Boolean).join("｜");
  const period = [item.periodStart, item.periodEnd].filter(Boolean).join(" — ");
  return [title, period, ...item.bullets.map((bullet) => `- ${bullet}`)].filter(Boolean).join("\n");
}

function buildResumeCopyText(profile: Profile, variant: ResumeVariant, directionName: string) {
  const data = variant.structuredData;
  if (!data) return "";
  const competitions = data.projects.filter((item) => item.category === "competition");
  const projects = data.projects.filter((item) => item.category !== "competition");
  const sections = [
    `简历版本：${variant.name}`,
    `适用方向：${directionName}`,
    "",
    "【基本信息】",
    [`姓名：${profile.name}`, `邮箱：${profile.email}`, `手机号：${profile.phone}`, `所在地：${profile.location}`]
      .filter((line) => !line.endsWith("："))
      .join("\n"),
    "",
    "【教育经历】",
    data.education.map((item) => [
      [item.school, item.college].filter(Boolean).join("｜"),
      [DEGREE_LABELS[item.degree], item.major].filter(Boolean).join("｜"),
      [item.periodStart, item.periodEnd].filter(Boolean).join(" — "),
      item.performance,
    ].filter(Boolean).join("\n")).join("\n\n") || "暂无",
    "",
    "【实习与工作经历】",
    data.experiences.map(formatExperience).join("\n\n") || "暂无",
    "",
    "【项目与论文】",
    projects.map(formatExperience).join("\n\n") || "暂无",
    "",
    "【荣誉与奖项】",
    [...data.honors, ...competitions.map(formatExperience)].join("\n") || "暂无",
    "",
    "【技能】",
    data.skills.join("、") || "暂无",
    "",
    "【个人优势】",
    data.strengths.join("\n") || "暂无",
  ];
  return sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildCommonProfileCopyText(profile: Profile) {
  return [
    `姓名：${profile.name}`,
    `邮箱：${profile.email}`,
    `手机号：${profile.phone}`,
    `所在地：${profile.location}`,
    `求职类型：${profile.jobType}`,
    `意向城市：${profile.cities.join("、")}`,
    profile.workAuthorizationConfirmed && profile.workAuthorization
      ? `工作许可 / 签证情况：${profile.workAuthorization}` : "",
  ].filter((line) => line && !line.endsWith("：")).join("\n");
}

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
  const competitions = data.projects.filter((item) => item.category === "competition");
  const projects = data.projects.filter((item) => item.category !== "competition");

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
        <b>项目与论文</b>
        <ExperienceRows items={projects} project />
      </div>

      <div className="nextstep mt12">
        <b>荣誉与奖项</b>
        <div className="mt8">
          {data.honors.length > 0
            ? data.honors.map((item) => <span className="chip hit" key={item}>{item}</span>)
            : competitions.length === 0 ? <span className="tiny">这个版本没有保存荣誉或奖项。</span> : null}
        </div>
        {competitions.length > 0 ? <ExperienceRows items={competitions} project /> : null}
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
  const directionGroups = DIRECTIONS.map((direction) => ({
    id: direction.id,
    name: direction.name,
    resumes: resumeVariants.filter((item) => item.directionId === direction.id),
  })).filter((group) => group.resumes.length > 0);
  const uncategorizedResumes = resumeVariants.filter(
    (item) => !DIRECTIONS.some((direction) => direction.id === item.directionId),
  );
  function createAutofillPackage(resumeVariantId: string) {
    const resumeVariant = resumeVariants.find((item) => item.id === resumeVariantId);
    if (!resumeVariant) return null;
    return buildAutofillPackage({ profile, resumeVariant, answerBank });
  }

  function downloadAutofillPackage(resumeVariantId: string) {
    const next = createAutofillPackage(resumeVariantId);
    if (!next) {
      setNotice("找不到这份简历版本，请刷新后重试。");
      return;
    }

    // 简历助手导入前会按同一套协议校验，格式不达标的文件导出去也只会被拒。
    // 与其让用户拿着一个导不进去的文件来回试，不如在导出这一步就说清楚。
    if (!isAutofillPackageV1(next)) {
      setNotice(
        "这份简历的数据不完整（教育、经历或技能格式不符合交换协议），导出的文件会被简历助手拒绝。请回到「简历解析」重新保存一次这个版本再导出。",
      );
      return;
    }

    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const safeName = next.resumeVariant.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "") || "resume";
    link.href = URL.createObjectURL(blob);
    link.download = `jobagent-autofill-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("网申资料包已导出。请在简历助手扩展中选择这个 JSON 文件导入。");
  }

  async function copyText(value: string, successMessage: string) {
    if (!value) {
      setNotice("这份简历还没有完整结构化资料，请先从简历解析页保存或补全。");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      setNotice("复制失败，请检查浏览器是否允许读取剪贴板。");
    }
  }

  function downloadBackup() {
    const blob = new Blob([exportWorkspace()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `jobagent-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice("整站备份已导出，仅用于恢复 JobAgent 工作区，不能导入简历助手。API Key 不包含在备份中。");
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

      <div className="nextstep mb12">
        <b>使用方式：</b>
        <span className="tiny"> 在“简历解析”校对内容并保存版本 → 在下面直接查看、复制或导出该版本；通用联系方式会与所选版本自动组合。</span>
      </div>

      <section className="card">
          <div className="spread">
            <h3>通用网申信息</h3>
            <button type="button" className="btn sm" onClick={() => copyText(buildCommonProfileCopyText(profile), "通用网申信息已复制。")}>复制通用信息</button>
          </div>
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
              <label className="fl">性别</label>
              <select className="input" value={profile.gender} onChange={(event) => setProfile((current) => ({ ...current, gender: event.target.value }))}>
                <option value="">未填写</option>
                {GENDER_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">出生日期</label>
              <input className="input" type="date" value={profile.birth} onChange={(event) => setProfile((current) => ({ ...current, birth: event.target.value }))} />
            </div>
            <div>
              <label className="fl">政治面貌</label>
              <select className="input" value={profile.political} onChange={(event) => setProfile((current) => ({ ...current, political: event.target.value }))}>
                <option value="">未填写</option>
                {POLITICAL_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">求职类型</label>
              <select className="input" value={profile.jobType} onChange={(event) => setProfile((current) => ({ ...current, jobType: event.target.value }))}>
                {JOB_TYPES.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <label className="fl">意向城市</label>
          <div>
            {CITY_OPTIONS.map((city) => {
              const active = profile.cities.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  className={`itab${active ? " active" : ""}`}
                  style={{ marginRight: 6, marginBottom: 6 }}
                  onClick={() => setProfile((current) => ({
                    ...current,
                    cities: active ? current.cities.filter((item) => item !== city) : [...current.cities, city],
                  }))}
                  aria-pressed={active}
                >
                  {city}
                </button>
              );
            })}
          </div>

          <label className="fl">工作许可 / 签证情况</label>
          <textarea className="input" rows={3} value={profile.workAuthorization} onChange={(event) => setProfile((current) => ({ ...current, workAuthorization: event.target.value, workAuthorizationConfirmed: false }))} placeholder="不确定时请留空，不要让系统猜测" />
          <label className="row mt8">
            <input type="checkbox" checked={profile.workAuthorizationConfirmed} onChange={(event) => setProfile((current) => ({ ...current, workAuthorizationConfirmed: event.target.checked }))} />
            <span>我已核对这项敏感信息</span>
          </label>
      </section>

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
                              ? `教育 ${item.structuredData.education.length} · 实习/工作 ${item.structuredData.experiences.length} · 项目/论文 ${item.structuredData.projects.filter((entry) => entry.category !== "competition").length} · 荣誉/奖项 ${item.structuredData.honors.length + item.structuredData.projects.filter((entry) => entry.category === "competition").length}`
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
                        <>
                          <div className="row mt8">
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => copyText(
                                buildResumeCopyText(
                                  profile,
                                  item,
                                  DIRECTIONS.find((direction) => direction.id === item.directionId)?.name ?? "待分类",
                                ),
                                `「${item.name}」的完整资料已复制，可以直接粘贴到网申表单。`,
                              )}
                            >
                              复制完整资料
                            </button>
                            <button type="button" className="btn sm primary" onClick={() => downloadAutofillPackage(item.id)}>
                              导出到简历助手
                            </button>
                          </div>
                          <details className="mt8">
                            <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 700 }}>查看这份简历的完整资料</summary>
                            <ResumeVersionDetails data={item.structuredData} />
                          </details>
                        </>
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

      <section className="card mt16">
        <h3>工具与数据</h3>
        <div className="tiny mt8">低频功能统一收在这里，需要时再展开，不占用主流程空间。</div>

        <details className="nextstep mt12">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>可复用网申回答（可选） · {answerBank.length} 条</summary>
          <div className="tiny mt8">用于“为什么申请本岗位、是否接受调剂”等简历外的重复问题。只有勾选“内容已核对”的回答才会进入扩展资料包。</div>
          <div className="split mt12">
            <div><label className="fl">问题</label><input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：是否接受异地调剂？" /></div>
            <div><label className="fl">回答</label><textarea className="input" rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} /></div>
          </div>
          <button type="button" className="btn mt12" onClick={() => {
            if (!question.trim()) return;
            addAnswer({ question: question.trim(), answer: answer.trim(), confirmed: false });
            setQuestion("");
            setAnswer("");
          }}>保存回答</button>
          <div className="mt12">
            {answerBank.map((item) => (
              <div className="iq" key={item.id}>
                <input className="input" value={item.question} onChange={(event) => updateAnswer(item.id, { question: event.target.value, confirmed: false })} />
                <textarea className="input mt8" rows={3} value={item.answer} onChange={(event) => updateAnswer(item.id, { answer: event.target.value, confirmed: false })} />
                <div className="spread mt8">
                  <label className="row"><input type="checkbox" checked={item.confirmed} onChange={(event) => updateAnswer(item.id, { confirmed: event.target.checked })} /><span>内容已核对</span></label>
                  <div className="row">
                    <button type="button" className="btn sm" onClick={() => copyText(item.answer, "回答已复制。")}>复制回答</button>
                    <button type="button" className="btn sm danger" onClick={() => removeAnswer(item.id)}>删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="nextstep mt12" id="resume-assistant-install">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>安装或更新简历助手 · v2.5.1</summary>
          <div className="tiny mt8">扩展负责把所选简历版本填写到招聘网站，不会自动点击最终提交。</div>
          <div className="row mt12">
            <a className="btn primary" href="/downloads/jobagent-resume-assistant-v2.5.1.zip" download>下载 Chrome / Edge 安装包</a>
          </div>
          <ol className="tiny mt12" style={{ paddingLeft: 20, lineHeight: 1.8 }}>
            <li>下载 ZIP 并解压。</li>
            <li>打开 chrome://extensions 或 edge://extensions。</li>
            <li>开启开发者模式，选择“加载已解压的扩展程序”。</li>
            <li>选择包含 manifest.json 的文件夹，确认版本为 2.5.1。</li>
          </ol>
          <div className="tiny mt8">如果仍显示 2.5.0 / 2.4.1 或 Service Worker 无效，请先移除旧版本再重新加载。不要直接双击 popup.html。</div>
        </details>

        <details className="nextstep mt12">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>数据备份、恢复与隐私</summary>
          <div className="tiny mt8">资料只保存在当前浏览器。备份用于迁移或恢复整个工作区，不能导入简历助手。</div>
          <div className="row mt12">
            <button type="button" className="btn" onClick={downloadBackup}>导出整站备份</button>
            <label className="btn">导入整站备份<input type="file" accept="application/json,.json" hidden onChange={importBackup} /></label>
            <button type="button" className="btn danger" onClick={async () => {
              if (!window.confirm("确定清空当前浏览器里的全部求职资料吗？建议先导出备份。")) return;
              await clearWorkspace();
              setNotice("本地资料已清空。");
            }}>清空本地资料</button>
          </div>
          <div className="tiny mt8">密码、验证码、身份证号码和银行卡信息不进入资料库；提交前仍需本人确认。</div>
        </details>
      </section>
    </>
  );
}
