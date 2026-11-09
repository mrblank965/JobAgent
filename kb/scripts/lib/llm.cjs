/**
 * LLM 直连模块：读项目根目录 .env.local，调用 DeepSeek chat/completions。
 * 供规划 / 清洗 / 结构化 / 质检 四个 LLM 型 Agent 复用。
 *
 * 不依赖项目里的 src/lib/ai（那个是服务端桩，真实请求尚未实现）。
 * 也不引入 dotenv，自己解析 .env.local，避免新增依赖。
 */

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Windows 上 .env.local 常被记事本/PowerShell 存成 UTF-16，这里统一解码成 UTF-8 文本。 */
function readTextFile(file) {
  const buf = fs.readFileSync(file);
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString("utf16le");
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf);
    swapped.swap16();
    text = swapped.toString("utf16le");
  } else {
    text = buf.toString("utf8");
  }
  return text.replace(/^\uFEFF/, "");
}

function loadEnv() {
  const file = path.join(PROJECT_ROOT, ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of readTextFile(file).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

// .env.local 放在后面，避免 process.env 里的空字符串把它覆盖掉
const ENV = { ...process.env, ...loadEnv() };

function requireKey() {
  const key = ENV.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("缺少 DEEPSEEK_API_KEY：请在项目根目录 .env.local 里填写（格式参考 .env.example）");
  }
  return key;
}

function stripFence(text) {
  const t = (text || "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1].trim() : t;
}

/** 从模型回复里取出 JSON：先直接 parse，失败则截取第一个 { 到最后一个 }。 */
function extractJson(text) {
  const t = stripFence(text);
  try {
    return JSON.parse(t);
  } catch {
    /* 继续尝试截取 */
  }
  const start = t.search(/[{[]/);
  if (start >= 0) {
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* 落到下面抛错 */
      }
    }
  }
  throw new Error("模型返回的不是合法 JSON：" + t.slice(0, 200));
}

async function chat(messages, options = {}) {
  const { json = false, temperature = 0.2, maxTokens = 4096, retries = 2 } = options;
  const key = requireKey();
  const base = (ENV.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = ENV.DEEPSEEK_MODEL || "deepseek-chat";

  const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
  if (json) body.response_format = { type: "json_object" };

  // 火山方舟 Ark 等推理模型默认会产出 reasoning_content，挤占 max_tokens 导致 content 被截断、
  // JSON 不完整。这里默认关闭思考，让全部 token 留给正文输出。若调用方需要推理可传 thinking:true 覆盖。
  if (base.includes("volces.com") && options.thinking !== true) {
    body.thinking = { type: "disabled" };
  }

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      const payload = JSON.parse(text);
      const content = payload?.choices?.[0]?.message?.content || "";
      if (!content.trim()) throw new Error("模型返回空内容");
      return content;
    } catch (error) {
      lastError = error;
      if (attempt <= retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

async function chatJson(messages, options = {}) {
  return extractJson(await chat(messages, { ...options, json: true }));
}

module.exports = { chat, chatJson, extractJson, loadEnv, ENV, PROJECT_ROOT };
