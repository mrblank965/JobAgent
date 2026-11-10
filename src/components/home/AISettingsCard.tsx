"use client";

import { useState } from "react";
import { SERVER_AI_KEY } from "@/lib/ai/resume";
import { useStore } from "@/lib/store";

/**
 * AI 设置。对应参考页「设置」里的 AI 模式那块。
 *
 * 双模式。不填 Key 走零 Key 模式，所有 AI 功能靠复制 Prompt 再粘回 JSON。
 * 填了 Key 就开启一键直连，接口兼容 OpenAI 的 chat/completions，
 * 所以 OpenAI、DeepSeek、本地代理都能用。
 *
 * Key 和学习数据一起存在本机浏览器的 IndexedDB 里，刷新、重开都还在，
 * 不会发到我们自己的服务器；换电脑或清空浏览器数据后需要重填。
 */
export function AISettingsCard() {
  const { ai, setAI, serverAI } = useStore();
  const [notice, setNotice] = useState("");

  const connected = ai.apiKey.trim().length > 0;
  const isServer = ai.apiKey === SERVER_AI_KEY;

  return (
    <div className="card mt16">
      <div className="spread">
        <h3>⚙️ AI 设置</h3>
        <span className={`tag ${connected ? "hit" : "partial"}`}>
          {isServer ? "服务器模型" : connected ? "已连接" : "零 Key 模式"}
        </span>
      </div>

      <p className="tiny">
        {isServer
          ? "当前使用服务器内置的 DeepSeek，Key 保存在服务器环境变量里，浏览器拿不到。也可以在上面填自己的 Key 覆盖。"
          : "不填 Key 时，所有 AI 功能走「复制 Prompt → 外部大模型 → 粘回 JSON」的零 Key 模式，完全离线可用。填写后开启一键直连，接口兼容 OpenAI 的 chat/completions。"}
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

      <label className="fl">
        {isServer ? "API Key（由服务器托管，无需填写；填写会覆盖服务器模型）" : "API Key（只保存在页面内存，刷新后需重填）"}
      </label>
      <input
        className="input"
        type="password"
        value={isServer ? "" : ai.apiKey}
        onChange={(event) => setAI({ ...ai, apiKey: event.target.value })}
        placeholder={isServer ? "使用服务器内置 DeepSeek" : "填写你自己的 API Key"}
      />

      <div className="row mt12">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const nextKey = serverAI ? SERVER_AI_KEY : "";
            setAI({ ...ai, apiKey: nextKey });
            setNotice(serverAI ? "已恢复使用服务器内置模型。" : "已清空 Key，回到零 Key 模式。");
          }}
          disabled={!connected && !serverAI}
        >
          {serverAI ? "恢复服务器模型" : "清空 Key（回到零 Key）"}
        </button>
        <span className="tiny">简历解析页的「AI 增强解析」会读取这里的配置。</span>
      </div>

      {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
    </div>
  );
}
