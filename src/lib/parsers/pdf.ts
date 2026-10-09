import { extractText, getDocumentProxy } from "unpdf";
import { normalizeText } from "./resumeText";

/**
 * 成员 B 负责：从 PDF 文件中提取文字。
 *
 * 用 unpdf，它内部打包了一份精简版 pdfjs，并且已经处理好分页和换行拼接。
 * 这里只负责拿到文字，不负责判断哪些是标题、哪些是正文，那是 resumeText.ts 的活。
 *
 * 注意：扫描件和图片型 PDF 里没有文字层，这里会返回空字符串，
 * 由调用方给出明确提示，而不是当成解析失败。
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });

  return normalizeText(text);
}
