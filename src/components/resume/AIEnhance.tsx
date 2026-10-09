"use client";

import { useState } from "react";
import { buildResumePrompt, callChatJSON, normalizeAIResume, parsePastedJSON } from "@/lib/ai/resume";
import { useStore } from "@/lib/store";
import type { ResumeData } from "@/types/analysis";

type AIEnhanceProps = {
  rawText: string;
  onApply: (resume: ResumeData) => void;
};

/**
 * AI 增强解析，双模式。
 *
 * 零 Key：把 Prompt 复制给任意大模型，再把返回的 JSON 粘回来。
 * 直连：在首页的 AI 设置里填了 Key 就直接调用，省掉复制粘贴。
 *
 * 不管哪种模式，结果都要先过一遍结构校验才会写进编辑区，
 * 模型少给字段会被补全，补完还是空的就提示重试。
 */
export function AIEnhance({ rawText, onApply }: AIEnhanceProps) {
  const { ai } = useStore();

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const connected = ai.apiKey.trim().length > 0;

  function applyResult(data: unknown) {
    const resume = normalizeAIResume(data);
    if (!resume) {
      setStatus("返回的内容里没有可用的简历信息，请重试，或改用本地解析。");
      return;
    }
    onApply(resume);
    setStatus("已应用 AI 结果，下面的编辑区已更新。");
  }

  async function runDirect() {
    const text = rawText.trim();
    if (text.length < 30) {
      setStatus("简历太短，至少 30 个字再交给模型。");
      return;
    }

    setBusy(true);
    setStatus("正在调用模型……");

    try {
      const data = await callChatJSON(ai, buildResumePrompt(text));
      applyResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "调用失败";
      setStatus(`${message}。可以改用复制 Prompt 的零 Key 模式。`);
      setPrompt(buildResumePrompt(text));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function openZeroKey() {
    const text = rawText.trim();
    if (text.length < 30) {
      setStatus("简历太短，至少 30 个字再交给模型。");
      return;
    }
    setPrompt(buildResumePrompt(text));
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
      applyResult(parsePastedJSON(pasted));
      setPasted("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "解析失败";
      setStatus(`粘贴的内容不是合法 JSON：${message}`);
    }
  }

  return (
    <div className="card mt12">
      <div className="spread">
        <h3>✨ AI 增强解析</h3>
        <span className="tag partial">{connected ? "API 直连" : "零 Key 模式"}</span>
      </div>

      <p className="tiny">
        {connected
          ? "已配置 Key，可以一键调用模型，返回结果会写进下面的编辑区。"
          : "没有配置 Key，走零 Key 模式：复制 Prompt 给任意大模型，再把返回的 JSON 粘回来。到首页的 AI 设置里填 Key 可以开启直连。"}
      </p>

      <div className="row mt8">
        <button type="button" className="btn primary" onClick={runDirect} disabled={busy || !connected}>
          {busy ? "调用中…" : "✨ 一键 AI 解析"}
        </button>
        <button type="button" className="btn" onClick={openZeroKey}>
          复制 Prompt 模式
        </button>
      </div>

      {status ? <div className="tiny mt8 warn-text">{status}</div> : null}

      {open ? (
        <div className="mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label className="fl" style={{ marginTop: 0 }}>
            第一步：把下面这段复制给任意大模型
          </label>
          <textarea className="input" style={{ height: 180 }} value={prompt} readOnly />
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
            placeholder='{"name":"...","skills":[...],"experiences":[...]}'
          />
          <div className="row mt8">
            <button type="button" className="btn primary" onClick={applyPasted} disabled={pasted.trim().length === 0}>
              应用这份结果
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
