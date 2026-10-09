"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

/**
 * AI 设置。对应参考页「设置」里的 AI 模式那块。
 *
 * 双模式。不填 Key 走零 Key 模式，所有 AI 功能靠复制 Prompt 再粘回 JSON。
 * 填了 Key 就开启一键直连，接口兼容 OpenAI 的 chat/completions，
 * 所以 OpenAI、DeepSeek、本地代理都能用。
 *
 * Key 只放在页面内存里，不写 localStorage，刷新即清空，也不会发到我们自己的服务器。
 */
export function AISettingsCard() {
  const { ai, setAI } = useStore();
  const [notice, setNotice] = useState("");

  const connected = ai.apiKey.trim().length > 0;

  return (
    <div className="card mt16">
      <div className="spread">
        <h3>⚙️ AI 设置</h3>
        <span className={`tag ${connected ? "hit" : "partial"}`}>
          {connected ? "已连接" : "零 Key 模式"}
        </span>
      </div>

      <p className="tiny">
        不填 Key 时，所有 AI 功能走「复制 Prompt → 外部大模型 → 粘回 JSON」的零 Key 模式，完全离线可用。
        填写后开启一键直连，接口兼容 OpenAI 的 chat/completions，OpenAI、DeepSeek、本地代理都能接。
      </p>

      <div className="split">
        <div>
          <label className="fl">API Base</label>
          <input
            className="input"
            value={ai.apiBase}
            onChange={(event) => setAI({ ...ai, apiBase: event.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <div>
          <label className="fl">模型名</label>
          <input
            className="input"
            value={ai.model}
            onChange={(event) => setAI({ ...ai, model: event.target.value })}
            placeholder="deepseek-chat"
          />
        </div>
      </div>

      <label className="fl">API Key（只存在当前页面内存里，刷新即清空）</label>
      <input
        className="input"
        type="password"
        value={ai.apiKey}
        onChange={(event) => setAI({ ...ai, apiKey: event.target.value })}
        placeholder="sk-..."
      />

      <div className="row mt12">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAI({ ...ai, apiKey: "" });
            setNotice("已清空 Key，回到零 Key 模式。");
          }}
          disabled={!connected}
        >
          清空 Key（回到零 Key）
        </button>
        <span className="tiny">简历解析页的「AI 增强解析」会读取这里的配置。</span>
      </div>

      {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
    </div>
  );
}
