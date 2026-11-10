"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { DIRECTIONS } from "@/lib/career";
import { analyzeJD } from "@/lib/jd";
import { useStore } from "@/lib/store";
import { ExtraExperienceCard } from "@/components/optimize/ExtraExperienceCard";
import { RewritePlanner } from "@/components/optimize/RewritePlanner";
import { StyleControls } from "@/components/optimize/StyleControls";
import { useTransientState } from "@/components/optimize/useTransientState";
import { buildResumeDocx, estimateDocxLines } from "@/lib/optimizeDocx";
import { buildResumeTemplate, stripHints } from "@/lib/resumeTemplate";
import {
  DEFAULT_STYLE_SETTINGS,
  resolveStyle,
  settingsToResolveInput,
  type StyleSettings,
} from "@/lib/languageStyles";

function OptimizePageContent() {
  const { profile, jds, apps, addApp, updateApp, addResumeVariant, storageReady } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  /** 链接带过来的 jd 参数只在首次进入时生效，之后以用户自己的选择为准。 */
  const paramApplied = useRef(false);

  /**
   * 选中的 JD、手改过的草稿、其他经历都只存在**页面内存**里。
   * 站内跳到别的页面再回来，填过的东西还在；但**一刷新就清空**，关掉标签页再打开也是空的。
   * 存的是内存不是 sessionStorage——后者扛得住刷新，和这个需求正好相反。
   */
  const [activeJD, setActiveJD] = useTransientState("jobagent.optimize.jd", "");
  /** 用户改过就用改过的，没改过就跟着画像里的原文走，避免用 effect 同步状态。 */
  const [edited, setEdited] = useTransientState<string | null>("jobagent.optimize.draft", null);
  /** 简历里没写、但用户想补进来的其他经历，改写时和简历一起作为材料。 */
  const [extra, setExtra] = useTransientState("jobagent.optimize.extra", "");
  /** 语言风格设置：主风格、辅风格、力度、长度、优先量化。 */
  const [styleSettings, setStyleSettings] = useTransientState<StyleSettings>(
    "jobagent.optimize.style",
    DEFAULT_STYLE_SETTINGS,
  );

  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  /** 导出时要不要把灰色提示清掉。默认保留——模板本来就是拿去改的。 */
  const [cleanExport, setCleanExport] = useState(false);
  /**
   * 刚保存出来的简历版本，记下它属于哪份 JD。
   * 换一份 JD 后这里自动失效，不需要用 effect 去清空状态。
   */
  const [savedVariant, setSavedVariant] = useState<{ jdId: string; variantId: string } | null>(null);
  const savedVariantId = savedVariant && savedVariant.jdId === activeJD ? savedVariant.variantId : null;
  const draft = edited ?? profile.rawResume;

  const jd = jds.find((item) => item.id === activeJD) ?? null;
  const analysis = jd ? analyzeJD(jd.raw, profile.skills, profile.rawResume) : null;

  /** 看板里这条 JD 的记录，以及它是否已经用了刚保存的版本。 */
  const boardApp = jd ? apps.find((item) => item.jdId === jd.id) : undefined;
  const boardSynced = Boolean(boardApp && savedVariantId && boardApp.resumeVariantId === savedVariantId);

  /**
   * 从「JD 拆解器」或「岗位匹配」点进来时，地址上带着 ?jd=<id>。
   * 等本地资料读完之后再套用一次：命中就把这份 JD 设为当前目标，找不到就保持未选择。
   */
  useEffect(() => {
    if (paramApplied.current || !storageReady) return;
    paramApplied.current = true;
    const target = searchParams.get("jd");
    if (target && jds.some((item) => item.id === target)) {
      setActiveJD(target);
    }
  }, [storageReady, jds, searchParams, setActiveJD]);

  /** 版本名用「公司·岗位定制版」，两者都缺时退回日期。 */
  function buildVariantName(): string {
    const parts = [jd?.company, jd?.title].map((part) => part?.trim() ?? "").filter(Boolean);
    if (parts.length > 0) return `${parts.join("·")}定制版`;
    return `${new Date().toLocaleDateString("zh-CN")} 定制版`;
  }

  function saveAsVariant() {
    if (!jd || savedVariantId) return;
    // 优先跟随当前 JD 的方向；JD 没标方向时才退回全局目标方向。
    const directionId =
      jd?.directionId || DIRECTIONS.find((item) => item.name === profile.target)?.id || "";
    const name = buildVariantName();
    const variantId = addResumeVariant({ name, directionId, sourceText: draft });
    setSavedVariant({ jdId: jd.id, variantId });
    setNotice(`已保存简历版本「${name}」。`);
  }

  function addCurrentJDToBoard() {
    if (!jd || !savedVariantId) return;

    // 从 JD 详情先加过投递的记录，简历版本是空的；这里正好把刚保存的版本补上去，
    // 不再重复建一条。
    const existing = apps.find((item) => item.jdId === jd.id);
    if (existing) {
      if (!existing.resumeVariantId) {
        updateApp(existing.id, { resumeVariantId: savedVariantId });
        setNotice("这条 JD 已经在看板里，已把刚保存的简历版本关联过去。");
      } else {
        setNotice("这条 JD 已经在投递看板里了，没有重复添加。");
      }
      return;
    }

    addApp({
      company: jd.company,
      title: jd.title,
      jdId: jd.id,
      resumeVariantId: savedVariantId,
    });
    setNotice("已加入投递看板，使用的是刚保存的简历版本。");
  }

  /** 手动切换时把选择写回地址，刷新后还能回到同一份 JD。 */
  function selectJD(nextId: string) {
    setActiveJD(nextId);
    const next = new URLSearchParams(searchParams.toString());
    if (nextId) next.set("jd", nextId);
    else next.delete("jd");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // 主风格没选时不给合并结果，改写按钮会保持禁用。
  const styleInput = settingsToResolveInput(styleSettings);
  const mergedStyle = styleInput ? resolveStyle(styleInput) : undefined;

  /**
   * 把草稿套进简历模板骨架。
   *
   * 只在导出时做，不改动你在上方编辑的草稿：
   * 已有的板块原样搬过去、按规格顺序重排，缺的板块在 Word 上补灰色提示。
   * 不认识的板块（个人优势、获奖情况……）一个都不丢，原序放到最后。
   */
  function toTemplateText(): string {
    return buildResumeTemplate({
      profile: {
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
        location: profile.location,
        target: profile.target,
        school: profile.school,
        major: profile.major,
        degree: profile.degree,
        gradYear: profile.gradYear,
        skills: profile.skills,
      },
      draft,
    });
  }

  function download() {
    if (draft.trim().length === 0) {
      setNotice("还没有可导出的内容。");
      return;
    }

    const blob = new Blob([cleanExport ? stripHints(draft) : draft], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `简历_${profile.name || "未命名"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("已导出为 txt 文件。");
  }

  /**
   * 导出 Word。docx 库是按需加载的，所以这里要 await。
   *
   * 导出的是「草稿套进模板骨架」之后的内容，缺的板块直接在文档里留灰色提示。
   * 上面的草稿一个字都不动，导完回去看还是你原来写的东西。
   * 草稿空着也能导——那样出来就是一份带提示的空白模板，对着填。
   */
  async function downloadDocx() {
    setExporting(true);
    setNotice("正在生成 Word 文档……");

    try {
      const template = toTemplateText();
      const blob = await buildResumeDocx(template, { stripHints: cleanExport });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `简历_${profile.name || "未命名"}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        cleanExport
          ? "已导出 Word，提示已清掉。"
          : "已导出 Word，缺的地方在文档里用黑色斜体标着。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导出失败。");
    } finally {
      setExporting(false);
    }
  }

  // 每次渲染顺手估一次页数，用来在导出区提示「还要删几行」。
  const pageEstimate = estimateDocxLines(toTemplateText(), "strict");

  return (
    <>
      <div className="view-head">
        <h1>📝 简历定制</h1>
        <p>选一份目标 JD，看清命中与缺口，在真实经历范围内逐段改写，导出 txt 投递。</p>
      </div>

      <div className="warnbox mb12">
        <b>事实红线</b>：只能调整顺序、措辞、嵌入关键词、突出相关的真实经历。
        禁止虚构公司、项目、职位、数据与证书。
      </div>

      <div className="split">
        <div className="card">
          <div className="spread">
            <h3>目标岗位</h3>
            <span className="tiny">{jds.length} 份 JD</span>
          </div>

          {jds.length === 0 ? (
            <div className="empty mt8">
              <span className="big">🔎</span>
              还没有 JD。先到「JD 拆解器」粘贴一份岗位原文。
              <div className="mt12">
                <Link className="btn primary" href="/jd">
                  去 JD 拆解器
                </Link>
              </div>
            </div>
          ) : (
            <>
              <label className="fl">选择 JD</label>
              <select
                className="input"
                value={activeJD}
                onChange={(event) => selectJD(event.target.value)}
              >
                <option value="">— 请选择 —</option>
                {jds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.company || "未知公司"} · {item.title || "未命名岗位"}
                  </option>
                ))}
              </select>

              {analysis ? (
                <>
                  <label className="fl">建议优先嵌入的命中点</label>
                  <div>
                    {analysis.match.hits.length > 0 ? (
                      analysis.match.hits.map((item) => (
                        <span key={item.k} className="chip hit">
                          {item.k}
                        </span>
                      ))
                    ) : (
                      <span className="tiny">暂无命中，先补技能再谈改写。</span>
                    )}
                  </div>

                  <label className="fl">缺口，不要硬编，先想真实证据</label>
                  <div>
                    {analysis.match.missing.length > 0 ? (
                      analysis.match.missing.map((word) => (
                        <span key={word} className="chip miss">
                          {word}
                        </span>
                      ))
                    ) : (
                      <span className="tiny">没有明显缺口。</span>
                    )}
                  </div>

                  <label className="fl">该 JD 的职责</label>
                  <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                    {analysis.duties.slice(0, 5).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="tiny mt12">选一份 JD，这里会列出命中点和缺口。</div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="spread">
            <h3>简历草稿</h3>
            <span className="tiny">{draft.trim().length} 字</span>
          </div>

          <textarea
            className="input"
            style={{ height: 420 }}
            value={draft}
            onChange={(event) => {
              setEdited(event.target.value);
              if (notice) setNotice("");
            }}
            placeholder="这里是简历正文。可以点下面的按钮从「简历解析」载入原文，然后按命中点调整措辞。"
          />

          <div className="row mt8">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEdited(null);
                setNotice(profile.rawResume ? "已载入简历原文。" : "画像里还没有简历原文，先去简历解析。");
              }}
            >
              载入简历原文
            </button>
          </div>

          <div className="tiny mt8">
            改写在下面的「✨ AI 逐段改写」里做，导出在最底部。两处都会用这个框里的内容。
          </div>
          {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
        </div>
      </div>

      <div className="card mt16">
        <div className="spread">
          <h3>保存与投递</h3>
          <span className="tiny">{savedVariantId ? "简历版本已保存" : "先保存版本，再加入投递"}</span>
        </div>
        <p className="tiny mt8">
          保存会把这个方向下的这份草稿存进「网申资料库」；加入投递时，看板里的这条记录会指向刚保存的版本。
        </p>
        <div className="row mt12">
          <button type="button" className="btn primary" onClick={saveAsVariant} disabled={!jd || Boolean(savedVariantId)}>
            {savedVariantId ? "已保存" : "保存为简历版本"}
          </button>
          <button
            type="button"
            className="btn clay"
            onClick={addCurrentJDToBoard}
            disabled={!jd || !savedVariantId || boardSynced}
          >
            {boardSynced
              ? "✅ 看板已用这份版本"
              : boardApp
                ? "📮 更新看板里的版本"
                : "📮 加入投递看板"}
          </button>
          <Link className="btn ghost" href="/board">
            去看板
          </Link>
        </div>
      </div>

      <ExtraExperienceCard value={extra} onChange={setExtra} />

      <StyleControls jdText={jd?.raw ?? ""} value={styleSettings} onChange={setStyleSettings} />

      <RewritePlanner
        resumeText={draft}
        extraText={extra}
        jdRaw={jd?.raw ?? ""}
        jdLabel={jd ? `${jd.company || "未知公司"} · ${jd.title || "未命名岗位"}` : ""}
        style={mergedStyle}
        jdKeywords={analysis?.keywords ?? []}
        input={{
          company: jd?.company,
          title: jd?.title,
          target: profile.target,
          jobType: profile.jobType,
          analysis,
        }}
        onApply={(text) => {
          setEdited(text);
          setNotice("已把勾选的变更写进简历草稿，可在上方继续手动润色。");
        }}
      />

      <div className="card mt12">
        <div className="spread">
          <h3>⬇ 导出</h3>
          <span className="tiny">{draft.trim().length} 字</span>
        </div>
        <p className="tiny">
          <b>导出 Word</b> 按需求单的固定版式排：Letter 纸（8.5 × 11 英寸），上 0.5 cm、下 0.4 cm、左右 1.27 cm，
          西文 Times New Roman / 中文楷体，正文固定行距 16 磅，一级标题带 0.5 磅下框线，经历行用 11.3 cm 和 18.4 cm 制表位对齐。
          版式不随内容缩放。只排你草稿里写过的板块，不会凭空补段落，草稿本身不会被改动。
        </p>
        <p className="tiny">
          <b>导出 txt</b> 导的是「简历草稿」框里的原样内容，不套版式。
        </p>

        <div className="tiny mt8">
          按版式估算正文 <b>{pageEstimate.lines}</b> 行，一页按 <b>{pageEstimate.capacity}</b> 行留余量。
          估算对中文折行偏保守，一页以内以导出后的 Word 页数为准。
        </div>

        <div className="tiny mt8">
          版式是需求单定死的，不会为了凑一页改字号或行距。超出上限就删内容：
          每条经历留 1–3 个要点，先删重复和没数字的句子。
        </div>

        <label className="mt8" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={cleanExport}
            onChange={(event) => setCleanExport(event.target.checked)}
          />
          <span className="tiny">
            <b>去掉模板提示再导出</b>。文档里的〔…〕会全部清掉，得到一份可以直接投递的版本。
            还没填完就先别勾，留着提示对着 Word 改。
          </span>
        </label>

        <div className="row mt8">
          <button type="button" className="btn" onClick={download}>
            ⬇ 导出 txt
          </button>
          <button type="button" className="btn primary" onClick={downloadDocx} disabled={exporting}>
            {exporting ? "生成中…" : "⬇ 导出 Word"}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * 读取 ?jd= 用的是 useSearchParams，按 Next 16 的要求必须处在 Suspense 边界内，
 * 否则这条预渲染路由会被构建工具判为阻塞预渲染。
 */
export default function OptimizePage() {
  return (
    <Suspense fallback={<div className="warnbox">正在读取目标岗位…</div>}>
      <OptimizePageContent />
    </Suspense>
  );
}
