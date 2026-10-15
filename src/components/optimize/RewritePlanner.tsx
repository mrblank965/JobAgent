"use client";

import { useState } from "react";
import { callChatJSON } from "@/lib/ai/resume";
import { useStore } from "@/lib/store";
import {
  applyChanges,
  buildOptimizePrompt,
  fillPlaceholders,
  findNewNumbers,
  findPlaceholders,
  looksLikeHeaderLost,
  normalizePlan,
  parseJsonBlock,
  type ChangeDecision,
  type ChangeItem,
  type OptimizeInput,
  type OptimizePlan,
} from "@/lib/optimize";
import type { MergedStyle } from "@/lib/languageStyles";

const KIND_LABEL: Record<ChangeItem["kind"], string> = {
  rewrite: "改写",
  remove: "建议删除",
  add: "建议新增",
};

const SOURCE_LABEL: Record<ChangeItem["source"], string> = {
  resume: "来自简历",
  extra: "来自其他经历",
};

/** 占位符填值的键：同一条变更里可能有两个同名的占位符，所以带上条目 id。 */
const fillKey = (itemId: string, label: string) => `${itemId}::${label}`;

/** 默认全部不勾，由用户逐条主动选择，避免误采用。 */
function defaultChecked(plan: OptimizePlan): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const item of plan.changes) map[item.id] = false;
  return map;
}

type RewritePlannerProps = {
  resumeText: string;
  extraText: string;
  jdRaw: string;
  jdLabel: string;
  /** 用户在「语言风格」里选定并合并后的结果；没选主风格时是 undefined。 */
  style?: MergedStyle;
  /** JD 里抽出来的关键词，用来校验有没有硬塞无依据的词。 */
  jdKeywords: string[];
  input: Omit<OptimizeInput, "resume" | "extra" | "jd" | "style">;
  onApply: (text: string) => void;
};

/**
 * AI 变更清单。
 *
 * 双模式跟简历解析那边保持一致：填了 Key 就直连，没填就复制 Prompt 给外部模型。
 * 直连失败会自动切到零 Key 模式，不把用户堵死。
 *
 * 关键差别：AI 不直接改简历，只提建议；用户逐条勾选后才应用。
 */
export function RewritePlanner({
  resumeText,
  extraText,
  jdRaw,
  jdLabel,
  style,
  jdKeywords,
  input,
  onApply,
}: RewritePlannerProps) {
  const { ai } = useStore();

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<OptimizePlan | null>(null);
  /** 这条变更要不要应用；add 类型表示"要不要采用这条经历"。 */
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  /** add 类型专用：要不要用 AI 改写后的措辞，不勾就用用户自己的原话。 */
  const [useRewrite, setUseRewrite] = useState<Record<string, boolean>>({});
  /** 用户在【待补：…】里填的真实数字或时间。 */
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  /**
   * 已经写进草稿的变更 id。
   *
   * 为什么必须记：applyChanges 是在**当前草稿**上做替换，草稿每应用一次就变一次。
   * 用户再点一次「应用」，rewrite 类型因为原文已被替换掉，会落进 missed 不会重复；
   * 但 add 类型没有原文可以定位，会被原样再插一遍——同一段经历在简历里出现两次。
   * 所以应用过的条目直接锁掉，要再改就重新生成一份清单。
   */
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const connected = ai.apiKey.trim().length > 0;
  /** 没选 JD 就没有改造依据，生成按钮保持禁用。 */
  const hasJd = jdRaw.trim().length > 0;

  /**
   * 这条还能不能勾。
   *
   * 被校验拒掉的 rewrite 是死路：它要拿 AI 那版文字去替换简历里的原文，不能用。
   * 但被拒掉的 add 不能一起锁死——add 类型本来就支持「不采用 AI 的措辞，只用用户自己填的原话」，
   * 那段原话是用户自己写的，不涉及编造。锁掉它等于"AI 改不好就不让你写这段经历"，说不过去。
   */
  function isLocked(item: ChangeItem): boolean {
    if (appliedIds.includes(item.id)) return true;
    return item.rejected && item.kind !== "add";
  }

  /** 这条还能不能选「使用 AI 改写后的措辞」。被拒的、已应用的都不行。 */
  function canUseAiWording(item: ChangeItem): boolean {
    return item.kind === "add" && !item.rejected && !appliedIds.includes(item.id);
  }

  /** 这条最终到底会不会用 AI 的措辞。被拒的一律走用户自己的原话。 */
  function usesAiWording(item: ChangeItem): boolean {
    return canUseAiWording(item) && (useRewrite[item.id] ?? false);
  }

  /** 这条变更最终会写进简历的文字：决定了要显示哪些待补占位符。 */
  function activeTextOf(item: ChangeItem): string {
    if (item.kind === "remove") return "";
    if (item.kind === "add") return usesAiWording(item) ? item.rewritten : item.original;
    return item.rewritten;
  }

  function decisionsOf(item: ChangeItem): ChangeDecision {
    const fills: Record<string, string> = {};
    for (const label of findPlaceholders(activeTextOf(item))) {
      const value = fillValues[fillKey(item.id, label)];
      if (value !== undefined) fills[label] = value;
    }
    // useRewrite 只有 add 类型用得上，其余类型传什么都不会被读。
    return { item, useRewrite: usesAiWording(item), fills };
  }

  /** 已应用过的、以及被拒掉的改写，都不再参与应用。 */
  const selected = plan
    ? plan.changes.filter((item) => checked[item.id] && !isLocked(item))
    : [];
  /** 勾了、但还有待补占位符没填的条目，应用前提醒一下。 */
  const unfilled = selected.filter((item) => findPlaceholders(activeTextOf(item)).some((label) => !(fillValues[fillKey(item.id, label)] ?? "").trim()));

  /** 直连和零 Key 用的是同一份 Prompt，避免两条路走出来的结果不一致。 */
  function buildPrompt(): string {
    return buildOptimizePrompt({
      ...input,
      resume: resumeText.trim(),
      extra: extraText.trim(),
      jd: jdRaw.trim(),
      style,
    });
  }

  function acceptPlan(data: unknown) {
    const next = normalizePlan(data, {
      jdKeywords,
      // 校验以简历草稿和「其他经历」的原文为准。
      // 模型自己抽的 facts 会漏，用它当基准会把原文里明明有的东西判成编造。
      sourceText: `${resumeText}\n${extraText}`,
    });
    if (!next) {
      setStatus("返回内容里没有可用的变更条目，请重试，或改用零 Key 模式检查 Prompt。");
      return;
    }

    const nextChecked = defaultChecked(next);
    const nextUseRewrite: Record<string, boolean> = {};
    // 默认也不用 AI 的措辞，要用得自己勾，跟主勾选框保持一致。
    for (const item of next.changes) nextUseRewrite[item.id] = false;

    setPlan(next);
    setChecked(nextChecked);
    setUseRewrite(nextUseRewrite);
    setFillValues({});
    // 换了新清单，上一批的"已应用"记录作废。
    setAppliedIds([]);
    setStatus(`收到 ${next.changes.length} 条变更建议，请逐条核对后再应用。`);
  }

  async function runDirect() {
    if (resumeText.trim().length < 30) {
      setStatus("简历太短，至少 30 个字再交给模型。");
      return;
    }

    setBusy(true);
    setStatus("正在调用模型……");

    try {
      const data = await callChatJSON(ai, buildPrompt());
      acceptPlan(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "调用失败";
      setStatus(`${message}。已切到零 Key 模式，可复制下面的 Prompt 手动调用。`);
      setPrompt(buildPrompt());
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function openZeroKey() {
    if (resumeText.trim().length < 30) {
      setStatus("简历太短，至少 30 个字再交给模型。");
      return;
    }
    setPrompt(buildPrompt());
    setOpen(true);
    setStatus("");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("Prompt 已复制，粘给任意大模型即可。");
    } catch {
      setStatus("浏览器不让自动复制，请手动全选复制上面的文本。");
    }
  }

  function applyPasted() {
    try {
      acceptPlan(parseJsonBlock(pasted));
      setPasted("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "解析失败";
      setStatus(`读取失败：${message}。请确认粘回来的内容里有完整的 JSON。`);
    }
  }

  /** 全选 / 全不选：连「使用 AI 改写后的措辞」那个子选项一起切换，保证"全选"就是真的全勾上。 */
  function toggleAll(next: boolean) {
    if (!plan) return;

    const nextChecked: Record<string, boolean> = {};
    const nextUseRewrite: Record<string, boolean> = {};
    for (const item of plan.changes) {
      // 被锁的（已应用、或被拒的改写）跳过，别再勾上——勾了也进不了 selected，只会让用户困惑。
      const locked = isLocked(item);
      nextChecked[item.id] = locked ? false : next;
      // 被拒的 add 可以勾上采纳，但绝不能顺带把 AI 那版措辞也勾上。
      nextUseRewrite[item.id] = canUseAiWording(item) ? next : false;
    }
    setChecked(nextChecked);
    setUseRewrite(nextUseRewrite);
  }

  function applySelected() {
    if (!plan || selected.length === 0) return;

    const done = selected.map((item) => item.id);

    const result = applyChanges(
      resumeText,
      selected.map((item) => decisionsOf(item)),
    );
    onApply(result.text);

    // 应用过的锁掉，勾选状态也一并清掉，避免界面上看起来还"待应用"。
    setAppliedIds((prev) => [...prev, ...done]);
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of done) next[id] = false;
      return next;
    });

    const notes = [`已应用 ${result.applied} 条到简历草稿。`];
    if (result.missed.length > 0) {
      notes.push(`另有 ${result.missed.length} 条因为原文在草稿里找不到，没有自动应用，请手动处理。`);
    }
    if (result.unplaced > 0) {
      notes.push(`有 ${result.unplaced} 条没在简历里找到对应的板块，已经放到末尾的「其他经历」下面，请自己挪到合适的位置。`);
    }
    if (result.duplicated > 0) {
      notes.push(`有 ${result.duplicated} 条的内容简历里已经有了，没有重复插入。`);
    }
    if (unfilled.length > 0) {
      notes.push(`有 ${unfilled.length} 条待补的数字或时间你没填，对应那几句已经被删掉了。`);
    }
    notes.push("这批条目已锁定，再点「应用」也不会重复插入。");
    setStatus(notes.join(""));
  }

  return (
    <div className="card mt12">
      <div className="spread">
        <h3>✨ AI 逐段改写</h3>
        <span className="tag partial">{connected ? "API 直连" : "零 Key 模式"}</span>
      </div>

      <p className="tiny">
        目标：{jdLabel || "未选择"}。AI 只提出变更建议，不会直接改你的简历；你在下面勾选同意哪几条，
        才会写进草稿。删除和新增默认不勾，需要你自己选。
      </p>

      <div className="tiny mt8">
        {!hasJd
          ? "还没选目标岗位。请先在最上面的「目标岗位」里选一份 JD。"
          : style
            ? `当前风格：${style.primary.name}${style.secondary ? ` ＋ ${style.secondary.name}` : ""}｜单条 ${style.maxLength} 字以内${style.preferNumbers ? "｜优先量化" : ""}`
            : "还没选主风格。请先在上面的「🎚️ 语言风格」里选一个，AI 才知道该怎么写。"}
      </div>

      <div className="row mt8">
        <button
          type="button"
          className="btn primary"
          onClick={runDirect}
          disabled={busy || !connected || !style || !hasJd}
        >
          {busy ? "分析中…" : "✨ 生成变更清单"}
        </button>
        <button type="button" className="btn" onClick={openZeroKey} disabled={!style || !hasJd}>
          复制 Prompt 模式
        </button>
      </div>

      {status ? <div className="tiny mt8 warn-text">{status}</div> : null}

      {open ? (
        <div className="mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label className="fl" style={{ marginTop: 0 }}>
            第一步：把下面这段复制给任意大模型
          </label>
          <textarea className="input" style={{ height: 200 }} value={prompt} readOnly />
          <div className="row mt8">
            <button type="button" className="btn" onClick={copyPrompt}>
              复制 Prompt
            </button>
          </div>

          <label className="fl">第二步：把模型返回的 JSON 粘回这里</label>
          <textarea
            className="input"
            style={{ height: 150 }}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder='{"summary":"...","changes":[{"kind":"rewrite","original":"...","rewritten":"..."}]}'
          />
          <div className="row mt8">
            <button
              type="button"
              className="btn primary"
              onClick={applyPasted}
              disabled={pasted.trim().length === 0}
            >
              应用这份结果
            </button>
          </div>
        </div>
      ) : null}

      {plan ? (
        <div className="mt12">
          {plan.summary ? <p className="tiny">{plan.summary}</p> : null}

          {plan.styleNotes.length > 0 ? (
            <div className="row mt8">
              {plan.styleNotes.map((note) => (
                <span key={note} className="chip">
                  {note}
                </span>
              ))}
            </div>
          ) : null}

          <div className="row mt12">
            <button type="button" className="btn ghost sm" onClick={() => toggleAll(true)}>
              全选
            </button>
            <button type="button" className="btn ghost sm" onClick={() => toggleAll(false)}>
              全不选
            </button>
            {/* 就在全选旁边：用户勾完抬眼看得到，不用滚回卡片顶部找。 */}
            <button
              type="button"
              className="btn primary"
              onClick={applySelected}
              disabled={selected.length === 0}
            >
              应用勾选的 {selected.length} 条
            </button>
            {unfilled.length > 0 ? (
              <span className="tiny">有 {unfilled.length} 条待补的数字或时间还没填</span>
            ) : null}
            {appliedIds.length > 0 ? (
              <span className="tiny">
                {appliedIds.length} 条已应用并锁定，再点也不会重复插入
              </span>
            ) : null}
          </div>

          <div className="mt8" style={{ display: "grid", gap: 10 }}>
            {plan.changes.map((item) => (
              <ChangeRow
                key={item.id}
                item={item}
                checked={Boolean(checked[item.id])}
                applied={appliedIds.includes(item.id)}
                locked={isLocked(item)}
                canUseAiWording={canUseAiWording(item)}
                useRewrite={usesAiWording(item)}
                onToggleChecked={(next) => setChecked((prev) => ({ ...prev, [item.id]: next }))}
                onToggleUseRewrite={(next) => setUseRewrite((prev) => ({ ...prev, [item.id]: next }))}
                getFill={(label) => fillValues[fillKey(item.id, label)] ?? ""}
                onFill={(label, value) =>
                  setFillValues((prev) => ({ ...prev, [fillKey(item.id, label)]: value }))
                }
              />
            ))}
          </div>

          {plan.gaps.length > 0 ? (
            <div className="warnbox mt12">
              <b>仍然缺的要求</b>：{plan.gaps.join("；")}。请用真实经历补，不要编。
            </div>
          ) : null}
          {plan.warning ? <div className="warnbox mt8">{plan.warning}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

type ChangeRowProps = {
  item: ChangeItem;
  checked: boolean;
  /** 这条已经写进草稿了。 */
  applied: boolean;
  /** 整条锁死，不能再勾：已应用，或者是被拒掉的改写。 */
  locked: boolean;
  /** 还能不能选「使用 AI 改写后的措辞」。被拒的 add 不能，但可以只用用户的原话。 */
  canUseAiWording: boolean;
  useRewrite: boolean;
  onToggleChecked: (next: boolean) => void;
  onToggleUseRewrite: (next: boolean) => void;
  getFill: (label: string) => string;
  onFill: (label: string, value: string) => void;
};

function ChangeRow({
  item,
  checked,
  applied,
  locked,
  canUseAiWording,
  useRewrite,
  onToggleChecked,
  onToggleUseRewrite,
  getFill,
  onFill,
}: ChangeRowProps) {
  const isAdd = item.kind === "add";
  const isRemove = item.kind === "remove";
  /** 实际会写进简历的那段文字，决定了要显示哪些待补占位符。 */
  const activeText = isAdd && !useRewrite ? item.original : item.rewritten;

  const placeholders = isRemove ? [] : findPlaceholders(activeText);
  const previewFills: Record<string, string> = {};
  for (const label of placeholders) previewFills[label] = getFill(label);

  const newNumbers = isRemove ? [] : findNewNumbers(item.original, activeText);
  /** 改写后把经历的表头（公司、职位、起止时间）弄丢了的话，单独提醒。 */
  const headerLost = !isAdd && !isRemove && looksLikeHeaderLost(item.original, item.rewritten);

  const rightLabel = isRemove ? "结果" : isAdd && !useRewrite ? "将写入（你自己的原话）" : "改写后";
  const rightText = isRemove ? "这段文字会从简历里移除。" : activeText;

  return (
    <div className="entry">
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: locked ? "not-allowed" : "pointer",
          opacity: locked ? 0.6 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={checked && !locked}
          disabled={locked}
          onChange={(event) => onToggleChecked(event.target.checked)}
        />
        <span className="entry-num">{KIND_LABEL[item.kind]}</span>
        <span className={isRemove ? "tag miss" : "tag partial"}>{SOURCE_LABEL[item.source]}</span>
        <span className="tiny">{isAdd ? "采用这条经历" : "应用这条变更"}</span>
        {item.rejected ? <span className="tag miss">已拒绝</span> : null}
        {applied ? <span className="tag hit">已应用</span> : null}
      </label>

      {item.rejected ? (
        <div className="errbox mt8">
          <b>{isAdd ? "AI 改写的那一版没有通过事实校验，不能用。" : "这条没有通过事实校验，不能用。"}</b>
          <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            {item.rejectReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="tiny mt4">
            {isAdd
              ? "但这条经历本身还是能写进简历的：直接勾上上面的选框，会用你自己填的原话加进去，AI 那版措辞已经锁掉了。"
              : "模型在这次改写里超出了你的简历事实。可以回上面重新生成一次；这条改动的原文会保持不动。"}
          </div>
        </div>
      ) : null}

      {isAdd ? (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: canUseAiWording ? "pointer" : "not-allowed",
            marginTop: 6,
            opacity: canUseAiWording ? 1 : 0.6,
          }}
        >
          <input
            type="checkbox"
            checked={useRewrite}
            disabled={!canUseAiWording}
            onChange={(event) => onToggleUseRewrite(event.target.checked)}
          />
          <span className="tiny">
            {canUseAiWording
              ? "使用 AI 改写后的措辞（不勾就用你自己填的原话）"
              : "AI 那版措辞已锁死，这条经历会按你自己填的原话写进去"}
          </span>
        </label>
      ) : null}

      {item.heading ? <div className="tiny mt4">{item.heading}</div> : null}

      {isAdd ? (
        <div className="tiny mt4">
          将插入到简历的「{item.section || "其他经历（简历里没找到合适的板块，会放到末尾）"}」下面
        </div>
      ) : null}

      <div className="split mt8">
        <div>
          <label className="fl">原文</label>
          <div className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
            {item.original || "—"}
          </div>
        </div>
        <div>
          <label className="fl">{rightLabel}</label>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{rightText}</div>
        </div>
      </div>

      {placeholders.map((label) => (
        <div key={label} className="mt8">
          <label className="fl" style={{ marginTop: 0 }}>
            这里建议你补一句真实的内容：{label}
          </label>
          <input
            className="input"
            value={getFill(label)}
            disabled={applied}
            onChange={(event) => onFill(label, event.target.value)}
            placeholder="写完整的一句，例如「处理过 2000+ 条数据」；不填的话这一句会被删掉"
          />
        </div>
      ))}

      {placeholders.length > 0 ? (
        <div className="tiny mt4">填入后：{fillPlaceholders(activeText, previewFills) || "（这一句会被删掉）"}</div>
      ) : null}

      {item.keywordsEmbedded.length > 0 ? (
        <div className="mt8">
          {item.keywordsEmbedded.map((word) => (
            <span key={word} className="chip hit">
              {word}
            </span>
          ))}
        </div>
      ) : null}

      {item.reasons.length > 0 ? (
        <div className="mt8">
          {item.reasons.map((reason) => (
            <div key={reason} className="ev">
              {reason}
            </div>
          ))}
        </div>
      ) : null}

      {headerLost ? (
        <div className="errbox mt8">
          <b>这段经历的表头可能被弄丢了</b>：改写后的文字里找不到原文开头那一句（公司、职位、起止时间）。
          请核对后再采纳，必要时手动补回去。
        </div>
      ) : null}

      {item.aiAdded.length > 0 ? (
        <div className="warnbox mt8">
          <b>⚠️ 以下内容 AI 是自己补的，你的原文里没有</b>，请确认属实后再采纳：
          <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            {item.aiAdded.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.warnings.length > 0 ? (
        <div className="warnbox mt8">
          <b>提醒</b>
          <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            {item.warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.evidenceNeeded.length > 0 ? (
        <div className="warnbox mt8">
          <b>待你补真实信息</b>：{item.evidenceNeeded.join("；")}
        </div>
      ) : null}

      {newNumbers.length > 0 ? (
        <div className="errbox mt8">
          <b>这里出现了原文没有的数字</b>：{newNumbers.join("、")}。请确认真实存在，否则不要采纳。
        </div>
      ) : null}
    </div>
  );
}
