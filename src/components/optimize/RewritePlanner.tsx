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
  STYLE_GUIDES,
  type ChangeDecision,
  type ChangeItem,
  type OptimizeInput,
  type OptimizePlan,
} from "@/lib/optimize";

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
  input: Omit<OptimizeInput, "resume" | "extra" | "jd">;
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
export function RewritePlanner({ resumeText, extraText, jdRaw, jdLabel, input, onApply }: RewritePlannerProps) {
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
  /** 手动指定的语言风格；留空表示让模型先从 JD 原文里读语气。 */
  const [styleLabel, setStyleLabel] = useState("");

  const connected = ai.apiKey.trim().length > 0;

  /** 这条变更最终会写进简历的文字：决定了要显示哪些待补占位符。 */
  function activeTextOf(item: ChangeItem): string {
    if (item.kind === "remove") return "";
    if (item.kind === "add" && !(useRewrite[item.id] ?? false)) return item.original;
    return item.rewritten;
  }

  function decisionsOf(item: ChangeItem): ChangeDecision {
    const fills: Record<string, string> = {};
    for (const label of findPlaceholders(activeTextOf(item))) {
      const value = fillValues[fillKey(item.id, label)];
      if (value !== undefined) fills[label] = value;
    }
    return {
      item,
      useRewrite: item.kind === "add" ? (useRewrite[item.id] ?? false) : true,
      fills,
    };
  }

  const selected = plan ? plan.changes.filter((item) => checked[item.id]) : [];
  /** 勾了、但还有待补占位符没填的条目，应用前提醒一下。 */
  const unfilled = selected.filter((item) => findPlaceholders(activeTextOf(item)).some((label) => !(fillValues[fillKey(item.id, label)] ?? "").trim()));

  /** 直连和零 Key 用的是同一份 Prompt，避免两条路走出来的结果不一致。 */
  function buildPrompt(): string {
    return buildOptimizePrompt({
      ...input,
      resume: resumeText.trim(),
      extra: extraText.trim(),
      jd: jdRaw.trim(),
      styleLabel: styleLabel || undefined,
    });
  }

  function acceptPlan(data: unknown) {
    const next = normalizePlan(data);
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
      nextChecked[item.id] = next;
      nextUseRewrite[item.id] = next;
    }
    setChecked(nextChecked);
    setUseRewrite(nextUseRewrite);
  }

  function applySelected() {
    if (!plan) return;

    const result = applyChanges(
      resumeText,
      selected.map((item) => decisionsOf(item)),
    );
    onApply(result.text);

    const notes = [`已应用 ${result.applied} 条到简历草稿。`];
    if (result.missed.length > 0) {
      notes.push(`另有 ${result.missed.length} 条因为原文在草稿里找不到，没有自动应用，请手动处理。`);
    }
    if (result.unplaced > 0) {
      notes.push(`有 ${result.unplaced} 条没在简历里找到对应的板块，已经放到末尾的「其他经历」下面，请自己挪到合适的位置。`);
    }
    if (unfilled.length > 0) {
      notes.push(`有 ${unfilled.length} 条待补的数字或时间你没填，对应那几句已经被删掉了。`);
    }
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

      <div className="mt12" style={{ maxWidth: 320 }}>
        <label className="fl" style={{ marginTop: 0 }}>
          语言风格
        </label>
        <select className="input" value={styleLabel} onChange={(event) => setStyleLabel(event.target.value)}>
          <option value="">自动：从这份 JD 里读语气</option>
          {STYLE_GUIDES.map((item) => (
            <option key={item.label} value={item.label}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="tiny mt4">
          {styleLabel
            ? `已手动指定，改写会按「${styleLabel}」的语气来。`
            : "默认从这份 JD 原文里读出它的用词和语气，比套用行业模板准。"}
        </div>
      </div>

      <div className="row mt8">
        <button type="button" className="btn primary" onClick={runDirect} disabled={busy || !connected}>
          {busy ? "分析中…" : "✨ 生成变更清单"}
        </button>
        <button type="button" className="btn" onClick={openZeroKey}>
          复制 Prompt 模式
        </button>
        {plan ? (
          <button type="button" className="btn primary" onClick={applySelected} disabled={selected.length === 0}>
            应用勾选的 {selected.length} 条
          </button>
        ) : null}
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
            {unfilled.length > 0 ? (
              <span className="tiny">有 {unfilled.length} 条待补的数字或时间还没填</span>
            ) : null}
          </div>

          <div className="mt8" style={{ display: "grid", gap: 10 }}>
            {plan.changes.map((item) => (
              <ChangeRow
                key={item.id}
                item={item}
                checked={Boolean(checked[item.id])}
                useRewrite={useRewrite[item.id] ?? false}
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
  useRewrite: boolean;
  onToggleChecked: (next: boolean) => void;
  onToggleUseRewrite: (next: boolean) => void;
  getFill: (label: string) => string;
  onFill: (label: string, value: string) => void;
};

function ChangeRow({
  item,
  checked,
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
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(event) => onToggleChecked(event.target.checked)} />
        <span className="entry-num">{KIND_LABEL[item.kind]}</span>
        <span className={isRemove ? "tag miss" : "tag partial"}>{SOURCE_LABEL[item.source]}</span>
        <span className="tiny">{isAdd ? "采用这条经历" : "应用这条变更"}</span>
      </label>

      {isAdd ? (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={useRewrite}
            onChange={(event) => onToggleUseRewrite(event.target.checked)}
          />
          <span className="tiny">使用 AI 改写后的措辞（不勾就用你自己填的原话）</span>
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
