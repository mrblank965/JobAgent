import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorker, type Worker } from "tesseract.js";

/**
 * 图片文字识别。
 *
 * 用 tesseract.js，纯 JavaScript 加 WASM，没有原生依赖。
 * 中文语言包约 15MB，首次识别时下载，之后缓存在系统临时目录里，不会写进项目仓库。
 *
 * 识别引擎只建一次并复用，每张图重新建引擎会白等好几秒。
 */

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const cachePath = join(tmpdir(), "jobagent-ocr");
    mkdirSync(cachePath, { recursive: true });

    workerPromise = createWorker("chi_sim", 1, { cachePath }).catch((error) => {
      // 建失败就把缓存清掉，下次重试
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

/**
 * tesseract 会在汉字之间插空格，识别出来是"招聘 发 布"这种。
 * 去掉汉字之间的空格，保留英文单词之间的。
 */
function tidyOcrText(text: string): string {
  return text
    .replace(/(?<=[一-龥])\s+(?=[一-龥])/g, "")
    .replace(/(?<=[一-龥])\s+(?=[，。、；：！？（）])/g, "")
    .replace(/(?<=[，。、；：！？（）])\s+(?=[一-龥])/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export type OcrResult = {
  text: string;
  /** 每张图的识别结果和置信度，用于在界面上说明哪张可能不准。 */
  pages: { index: number; chars: number; confidence: number }[];
};

/** 逐张识别，把文字拼起来。 */
export async function ocrImages(buffers: Buffer[]): Promise<OcrResult> {
  if (buffers.length === 0) return { text: "", pages: [] };

  const worker = await getWorker();
  const parts: string[] = [];
  const pages: OcrResult["pages"] = [];

  for (let index = 0; index < buffers.length; index += 1) {
    const { data } = await worker.recognize(buffers[index]);
    const text = tidyOcrText(data.text ?? "");

    pages.push({ index: index + 1, chars: text.length, confidence: Math.round(data.confidence ?? 0) });
    if (text.length > 0) parts.push(text);
  }

  return { text: parts.join("\n"), pages };
}
