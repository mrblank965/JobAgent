import { createWorker, type Worker } from "tesseract.js";

/**
 * 浏览器端图片文字识别。
 *
 * 原来在 /api/ocr 用 Node 里的 tesseract.js，平台不支持 Next 服务端，
 * 改为在浏览器直接跑。worker、core 和中文语言包默认从 jsDelivr 下载，
 * 首次识别需要等一会儿，之后浏览器会缓存。
 */

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("chi_sim", 1).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** tesseract 会在汉字之间插空格，把中文里的空格去掉，保留英文单词之间的。 */
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
  /** 每张图的字数与置信度，界面上用来提示哪张可能不准。 */
  pages: { index: number; chars: number; confidence: number }[];
};

/** 逐张识别，把文字拼起来。 */
export async function ocrImages(files: File[]): Promise<OcrResult> {
  if (files.length === 0) return { text: "", pages: [] };

  const worker = await getWorker();
  const parts: string[] = [];
  const pages: OcrResult["pages"] = [];

  for (let index = 0; index < files.length; index += 1) {
    const { data } = await worker.recognize(files[index]);
    const text = tidyOcrText(data.text ?? "");

    pages.push({ index: index + 1, chars: text.length, confidence: Math.round(data.confidence ?? 0) });
    if (text.length > 0) parts.push(text);
  }

  return { text: parts.join("\n"), pages };
}
