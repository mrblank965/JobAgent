import { extractTextFromDocx } from "./docx";
import { extractTextFromPdf } from "./pdf";

/** 支持的简历文件类型。 */
export const SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** 单文件体积上限。超过就拒绝，避免解析超大文件拖垮服务。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 上限的中文说法，用于错误提示。 */
export const MAX_UPLOAD_LABEL = "5 MB";

/**
 * 按文件类型分发到对应的提取函数。
 *
 * 这是文件和粘贴两条路的汇合点：不管从哪来，出来的都是纯文字，
 * 之后统一交给 resumeText.ts 里的 parseResumeText 处理。
 */
export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    return extractTextFromPdf(file);
  }

  return extractTextFromDocx(file);
}
