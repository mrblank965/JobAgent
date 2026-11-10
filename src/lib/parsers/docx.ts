import mammoth from "mammoth";
import { normalizeText } from "./resumeText";

/**
 * 成员 B 负责：从 DOCX 文件中提取文字。
 *
 * 用 mammoth 的 extractRawText，它按段落输出纯文字，一段一行。
 * 段落结构正好是简历解析需要的，所以不做额外处理。
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  // 浏览器端没有 Node 的 Buffer，mammoth 的类型定义本身支持直接传 ArrayBuffer。
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });

  return normalizeText(result.value);
}
