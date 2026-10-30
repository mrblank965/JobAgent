/**
 * 解析 Agent（工具型）：把图文帖转成纯文本（正文直取；正文偏短则图片 OCR）。
 *
 * 运行：node kb/scripts/parse.cjs <positionId>   或   node kb/scripts/parse.cjs all
 * 输入：kb/output/02-collect/<positionId>.json
 * 产出：kb/output/03-parse/<positionId>.md   ← 交付物（给人看）
 *       kb/output/03-parse/<positionId>.json ← 机器可读副本（流水线内部交接）
 *
 * 规则：只转换、不改写、不总结；如实记录每条用的通道（正文 / OCR）与 OCR 张数。
 * 上游采集已跳过视频帖，本阶段不涉及视频。
 */

const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const IN_DIR = path.join(KB, "output", "02-collect");
const OUT_DIR = path.join(KB, "output", "03-parse");

const MAX_IMAGES = Number(process.env.MAX_OCR_IMAGES || 9);
const MIN_TEXT_CHARS = 120;

function tidyOcrText(text) {
  return text
    .replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, "")
    .replace(/(?<=[\u4e00-\u9fa5])\s+(?=[，。、；：！？（）])/g, "")
    .replace(/(?<=[，。、；：！？（）])\s+(?=[\u4e00-\u9fa5])/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Referer: "https://www.xiaohongshu.com/",
    },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.byteLength > 0 && buf.byteLength <= 8 * 1024 * 1024 ? buf : null;
}

async function ocrImages(urls) {
  let worker;
  try {
    const { createWorker } = require("tesseract.js");
    const cachePath = path.join(require("node:os").tmpdir(), "jobagent-ocr");
    fs.mkdirSync(cachePath, { recursive: true });
    worker = await createWorker("chi_sim", 1, { cachePath });

    const parts = [];
    const pages = [];
    for (let i = 0; i < urls.length; i += 1) {
      const buf = await fetchBuffer(urls[i]);
      if (!buf) {
        pages.push({ index: i + 1, chars: 0, confidence: 0, skipped: true });
        continue;
      }
      const { data } = await worker.recognize(buf);
      const text = tidyOcrText(data.text || "");
      pages.push({ index: i + 1, chars: text.length, confidence: Math.round(data.confidence || 0) });
      if (text.length > 0) parts.push(text);
    }
    return { text: parts.join("\n"), pages };
  } catch (error) {
    return { text: "", pages: [], error: String(error).slice(0, 200) };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

async function parsePost(post) {
  const channels = [];
  const chunks = [];
  const notes = [];

  if (post.title) chunks.push(post.title);
  if (post.text && post.text.trim().length > 0) {
    channels.push("text");
    chunks.push(post.text.trim());
  }

  const textSoFar = chunks.join("\n");
  const needOcr = textSoFar.length < MIN_TEXT_CHARS && Array.isArray(post.images) && post.images.length > 0;
  let ocrPages = [];

  if (needOcr) {
    const urls = post.images.slice(0, MAX_IMAGES);
    const result = await ocrImages(urls);
    ocrPages = result.pages || [];
    if (result.text.trim().length > 0) {
      channels.push("ocr");
      chunks.push(result.text);
      notes.push(`正文偏短，已 OCR 识别 ${ocrPages.length} 张图，识别可能有错字`);
    } else {
      notes.push("正文偏短且 OCR 未识别出文字，内容可能主要在图里");
    }
    if (result.error) notes.push(`OCR 异常：${result.error}`);
  }

  return {
    postId: post.postId,
    positionId: post.positionId || "",
    searchTerm: post.searchTerm || "",
    url: post.url || "",
    title: post.title || "",
    author: post.author || "",
    postedAt: post.postedAt || "",
    imageCount: (post.images || []).length,
    text: chunks.join("\n").trim(),
    channels: [...new Set(channels)],
    ocrPages,
    note: notes.join("；"),
  };
}

function renderMd(positionId, title, results) {
  const today = new Date().toISOString().slice(0, 10);
  const ocrCount = results.filter((r) => r.channels.includes("ocr")).length;
  const lines = [
    `# 解析结果 · ${title || positionId}（${positionId}）`,
    "",
    `> 解析 Agent · ${today} · 共 ${results.length} 篇 · 其中 ${ocrCount} 篇用到 OCR`,
    "",
  ];
  results.forEach((r, i) => {
    lines.push(
      `## ${i + 1}. ${r.title || "（无标题）"}`,
      "",
      `- 链接：${r.url}`,
      `- 解析通道：${r.channels.join(" + ") || "无"}`,
      `- 图片 ${r.imageCount} 张${r.channels.includes("ocr") ? `，OCR ${r.ocrPages.length} 张` : ""}`,
      r.note ? `- 提示：${r.note}` : "",
      "",
      "```text",
      r.text || "（无文本）",
      "```",
      "",
    );
  });
  return lines.filter((l) => l !== undefined).join("\n");
}

async function runOne(positionId) {
  const src = path.join(IN_DIR, `${positionId}.json`);
  if (!fs.existsSync(src)) throw new Error(`找不到采集结果：${src}`);

  const payload = JSON.parse(fs.readFileSync(src, "utf8"));
  const results = [];
  for (const post of payload.posts || []) {
    const parsed = await parsePost(post);
    results.push(parsed);
    console.log(`[parse] ${parsed.postId} → ${parsed.text.length} 字，通道=${parsed.channels.join("+") || "none"}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${positionId}.md`), renderMd(positionId, payload.title, results), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, `${positionId}.json`),
    JSON.stringify({ positionId, title: payload.title || "", posts: results }, null, 2),
    "utf8",
  );
  console.log(`[parse] ${positionId} 完成，共 ${results.length} 篇`);
}

async function main() {
  const arg = process.argv[2] || "all";
  const ids =
    arg === "all"
      ? fs.readdirSync(IN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [arg];

  if (ids.length === 0) throw new Error("没有可解析的采集结果");
  for (const id of ids) await runOne(id);
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});
