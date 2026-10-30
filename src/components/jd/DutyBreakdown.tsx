"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildJDDutiesPrompt, normalizeJDDuties, type JDDuty, type JDDutyBreakdown } from "@/lib/ai/jd";
import { callChatJSON, parsePastedJSON } from "@/lib/ai/resume";
import { formatWebContext } from "@/lib/web/format";
import type { WebResult } from "@/lib/web/search";
import { useStore } from "@/lib/store";
import { ItemList } from "./ItemList";

type DutyBreakdownProps = {
  /** JD 原文。拆解只依据它，所以传的是未经本地规则加工的全文。 */
  rawText: string;
  /** 已经拆好的结果，由页面持有。切回同一个 JD 时直接用缓存，不再调一次模型。 */
  value: JDDutyBreakdown | null;
  onLoaded: (data: JDDutyBreakdown) => void;
  /** 本地规则切出来的职责行。模型还没返回或调用失败时，先用它顶上。 */
  fallback: string[];
  /**
   * 这份 JD 是不是用户点的「AI 增强拆解」。
   * false 时一律不调模型，哪怕首页已经填好了 Key——选了本地拆解就只走本地。
   */
  auto: boolean;
  /**
   * 岗位知识库匹配到的真实从业者内容，由页面从 /api/kb/match 取回。
   * 传了就让模型优先依据知识库拆，没传就按模型自己的理解拆。
   */
  kbContext?: string;
  /**
   * 这份 JD 是否命中了一个相关岗位。
   * 命中时优先用知识库内容拆解、不联网；未命中才联网检索公开资料 + 调大模型补。
   */
  kbMatched?: boolean;
  /**
   * 联网检索的检索词。只在知识库未命中时才会用——
   * 命中相关岗位时知识库已经够用，不需要再去搜公开资料。
   */
  webQuery?: string;
  /** 联网检索到的原始结果，交回页面展示来源，用户能自己点开核对。 */
  onWebSources?: (results: WebResult[], provider: string) => void;
};

/** JD 原文没提、由模型按岗位常识补出来的内容，统一打这个标记。 */
function SupplementTag() {
  return (
    <span
      className="tag partial"
      style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", verticalAlign: "middle" }}
      title="JD 原文没有提到，由模型按岗位常识补充"
    >
      补
    </span>
  );
}

/** 每条职责的整体来源标签：JD 原文 / 知识库 / 大模型推断。 */
const SOURCE_LABEL: Record<JDDuty["sourceTag"], { text: string; title: string }> = {
  jd: { text: "JD原文", title: "这条职责的内容 JD 原文里基本都写清楚了" },
  kb: { text: "知识库", title: "这条职责的关键做法主要来自岗位知识库的真实从业者内容" },
  infer: { text: "推断", title: "JD 没写、知识库也没覆盖，由大模型按岗位常识推断" },
};

function SourceTag({ tag }: { tag: JDDuty["sourceTag"] }) {
  const { text, title } = SOURCE_LABEL[tag];
  // 知识库用红色（用户要求标红），JD 原文和推断用灰色以示区分
  const isKb = tag === "kb";
  return (
    <span
      className="tag"
      style={{
        marginLeft: 8,
        fontSize: 10,
        padding: "1px 7px",
        verticalAlign: "middle",
        fontWeight: 600,
        ...(isKb
          ? { background: "var(--miss-bg)", color: "var(--miss)", border: "1px solid #e3c9c0" }
          : { background: "var(--surface-nested)", color: "var(--text-secondary)" }),
      }}
      title={title}
    >
      {text}
    </span>
  );
}

function DutyCard({ duty, index }: { duty: JDDuty; index: number }) {
  return (
    <div className="mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div className="spread">
        <span>
          <b style={{ fontSize: 13 }}>职责 {index + 1}</b>
          <SourceTag tag={duty.sourceTag} />
        </span>
      </div>
      <div className="tiny muted">{duty.source}</div>

      <div className="mt8">
        <b className="tiny">表面上做什么　</b>
        <span style={{ fontSize: 13 }}>{duty.surface}</span>
      </div>
      <div className="mt8">
        <b className="tiny">实际上做什么　</b>
        <span style={{ fontSize: 13 }}>{duty.essence}</span>
      </div>

      <div className="mt12">
        <b className="tiny">完整流程</b>
        {duty.workflow.length > 0 ? (
          <ol className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
            {duty.workflow.map((step, stepIndex) => (
              <li key={stepIndex}>{step}</li>
            ))}
          </ol>
        ) : (
          <div className="tiny">未拆出流程。</div>
        )}
      </div>

      <div className="mt12">
        <b className="tiny">工具要求</b>
        {duty.tools.length > 0 ? (
          <ul className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
            {duty.tools.map((tool, toolIndex) => (
              <li key={toolIndex}>
                {tool.name}
                <span className="tiny">
                  （第 {tool.step} 步，{tool.purpose || "用途未说明"}）
                </span>
                {tool.supplemented ? <SupplementTag /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="tiny">未识别到工具。</div>
        )}
      </div>

      <div className="mt12">
        <b className="tiny">业务要求</b>
        {duty.business.length > 0 ? (
          <ul className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
            {duty.business.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <div className="tiny">未识别到业务要求。</div>
        )}
      </div>

      <div className="mt8">
        <b className="tiny">交付形式　</b>
        <span style={{ fontSize: 13 }}>{duty.deliverable.form || "—"}</span>
        {duty.deliverable.supplemented ? <SupplementTag /> : null}
      </div>

      <div className="mt8">
        <b className="tiny">协作要求</b>
        {duty.collaboration.length > 0 ? (
          <ul className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
            {duty.collaboration.map((item, itemIndex) => (
              <li key={itemIndex}>
                {item.who}
                {item.how ? <span className="tiny">，{item.how}</span> : null}
                {item.supplemented ? <SupplementTag /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="tiny">未识别到协作对象。</div>
        )}
      </div>
    </div>
  );
}

function AbilityGroup({ title, items }: { title: string; items: JDDutyBreakdown["abilities"]["hard"] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt12">
      <b className="tiny">{title}</b>
      <div style={{ marginTop: 4 }}>
        {items.map((item, index) => (
          <span key={index} className="chip">
            {item.name}
            {item.from.length > 0 ? <span className="tiny">　来自 {item.from.join("、")}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 六层拆解的渲染。拆出来的东西全在这里，页面只负责把结果传进来。 */
export function DutyBreakdownView({ value }: { value: JDDutyBreakdown }) {
  const { hard, soft, knowledge } = value.abilities;
  const hasAbilities = hard.length + soft.length + knowledge.length > 0;
  const { perDuty, general } = value.interviewQuestions;

  return (
    <>
      {value.duties.map((duty, index) => (
        <DutyCard key={index} duty={duty} index={index} />
      ))}

      <div className="mt16" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div className="spread">
          <b style={{ fontSize: 13 }}>需要具备的能力</b>
        </div>

        {hasAbilities ? (
          <>
            <AbilityGroup title="硬技能" items={hard} />
            <AbilityGroup title="软实力" items={soft} />
            <AbilityGroup title="专业知识" items={knowledge} />
          </>
        ) : (
          <div className="tiny mt8">JD 已经把要求写全，没有需要补充的能力。</div>
        )}
      </div>

      {perDuty.length + general.length > 0 ? (
        <div className="mt16" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <b style={{ fontSize: 13 }}>面试可能问到的问题</b>

          {perDuty.length > 0 ? (
            <ol className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
              {perDuty.map((item, index) => (
                <li key={index}>
                  {item.question}
                  {item.duty > 0 ? <span className="tiny">　对应职责 {item.duty}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}

          {general.length > 0 ? (
            <>
              <b className="tiny mt12" style={{ display: "block" }}>
                岗位综合题
              </b>
              <ol className="muted" style={{ paddingLeft: 20, fontSize: 13, marginTop: 4 }}>
                {general.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * 岗位职责的深度拆解。
 *
 * 只有用户点了「AI 增强拆解」（auto 为 true）才会自动调模型，拆完直接铺在"岗位职责"卡片里。
 * 走本地拆解进来的 JD，这里只显示本地规则切出来的职责行，不会碰模型。
 * Key 从首页的 AI 设置读，只放在页面内存，不写 localStorage，也不会上传到我们自己的服务器。
 * 没配 Key 或者调用失败时，退回手动模式：复制 Prompt 给任意大模型，把 JSON 粘回来。
 */
export function DutyBreakdown({
  rawText,
  value,
  onLoaded,
  fallback,
  auto,
  kbContext,
  kbMatched,
  webQuery,
  onWebSources,
}: DutyBreakdownProps) {
  const { ai } = useStore();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");

  const connected = ai.apiKey.trim().length > 0;
  /** 记下已经发起过的 JD，避免 React 严格模式把 effect 跑两遍时重复调模型。 */
  const attempted = useRef("");

  const run = useCallback(async () => {
    const text = rawText.trim();
    if (text.length < 20) {
      setStatus("JD 太短，至少 20 个字再拆解。");
      return;
    }
    if (!connected) return;

    setBusy(true);

    try {
      // 从网页上复制粘贴常带上首尾空格，拼进请求头就成了无效 Key，这里统一去掉
      const settings = {
        ...ai,
        apiBase: ai.apiBase.trim(),
        apiKey: ai.apiKey.trim(),
        model: ai.model.trim(),
      };

      // 联网检索只在知识库没命中相关岗位时触发。
      // 命中时知识库已经是真实从业者内容，比公开资料更可靠，不必再搜。
      // 检索失败不算错，只是少一段外部资料，照常调模型拆解。
      let webContext = "";

      if (!kbMatched && webQuery) {
        setStatus("知识库未命中，正在联网检索岗位资料……");
        try {
          const response = await fetch("/api/web/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: webQuery }),
          });
          const payload = (await response.json()) as {
            provider?: string;
            results?: WebResult[];
            error?: string;
          };

          if (response.ok && Array.isArray(payload.results) && payload.results.length > 0) {
            webContext = formatWebContext(payload.results);
            onWebSources?.(payload.results, payload.provider ?? "bing");
          }
        } catch {
          // 联网失败就跳过，不打断拆解
        }
      }

      setStatus("正在调用模型拆解职责……");

      const next = normalizeJDDuties(
        await callChatJSON(settings, buildJDDutiesPrompt(text, kbContext, webContext)),
      );

      if (!next) {
        setStatus("模型返回的内容里没有可用的职责拆解，请重试。");
        return;
      }

      onLoaded(next);
      setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "调用失败";
      // fetch 抛的是 TypeError，说明请求根本没发到对方服务器，多半是跨域或地址不通
      const readable = /failed to fetch|networkerror|load failed/i.test(message)
        ? "请求没能发出去，多半是浏览器跨域拦截，或者 API Base 地址不通"
        : message;

      setStatus(`${readable}。可以改用上面的手动模式。`);
      setPrompt(buildJDDutiesPrompt(text, kbContext));
      setShowManual(true);
    } finally {
      setBusy(false);
    }
  }, [ai, connected, onLoaded, rawText, kbContext, kbMatched, webQuery, onWebSources]);

  // 点了 AI 增强拆解才自动拆一次，同一个 JD 只调一次，结果由页面缓存
  useEffect(() => {
    if (!auto || value || !connected) return;
    if (attempted.current === rawText) return;

    attempted.current = rawText;
    void run();
  }, [auto, value, connected, rawText, run]);

  function retry() {
    attempted.current = rawText;
    void run();
  }

  function openManual() {
    setPrompt(buildJDDutiesPrompt(rawText.trim(), kbContext));
    setShowManual(true);
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
      const next = normalizeJDDuties(parsePastedJSON(pasted));

      if (!next) {
        setStatus("返回的内容里没有可用的职责拆解，请重试。");
        return;
      }

      onLoaded(next);
      setPasted("");
      setShowManual(false);
      setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "解析失败";
      setStatus(`粘贴的内容不是合法 JSON：${message}`);
    }
  }

  if (value) return <DutyBreakdownView value={value} />;

  return (
    <>
      {fallback.length > 0 ? (
        <ItemList items={fallback} empty="未识别到职责段落。" />
      ) : (
        <div className="tiny">未识别到职责段落。</div>
      )}

      <div className="row mt12">
        {connected ? (
          <button type="button" className="btn primary sm" onClick={retry} disabled={busy}>
            {busy ? "拆解中…" : "✨ 用 AI 增强拆解"}
          </button>
        ) : (
          <button type="button" className="btn primary sm" onClick={openManual}>
            🧩 生成拆解 Prompt
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={openManual}>
          手动模式
        </button>
      </div>

      {status ? <div className="tiny mt8 warn-text">{status}</div> : null}

      {!connected && !showManual ? (
        <div className="tiny mt8">
          上面是本地规则切出来的职责，不联网也不用 Key。想看六层深度拆解，先到首页的「AI 设置」里填上 Key，
          再点上面的按钮。不想配 Key，就用上面的手动模式。
        </div>
      ) : null}

      {showManual ? (
        <div className="mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label className="fl" style={{ marginTop: 0 }}>
            第一步：把下面这段复制给任意大模型
          </label>
          <textarea className="input" style={{ height: 160 }} value={prompt} readOnly />
          <div className="row mt8">
            <button type="button" className="btn sm" onClick={copyPrompt}>
              复制 Prompt
            </button>
          </div>

          <label className="fl">第二步：把模型返回的 JSON 粘回这里</label>
          <textarea
            className="input"
            style={{ height: 130 }}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder='{"jobTitle":"...","duties":[...]}'
          />
          <div className="row mt8">
            <button
              type="button"
              className="btn primary sm"
              onClick={applyPasted}
              disabled={pasted.trim().length === 0}
            >
              解析这份结果
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setShowManual(false)}>
              收起
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
