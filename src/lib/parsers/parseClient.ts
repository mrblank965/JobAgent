import {
  extractTextFromFile,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  SUPPORTED_FILE_TYPES,
} from "./extract";
import {
  listRecognizedHeadings,
  listSuspectedHeadings,
  MIN_RESUME_LENGTH,
  parseResumeText,
  type RecognizedHeading,
} from "./resumeText";
import { isResumeData } from "@/lib/schemas/analysis";
import type { ResumeData } from "@/types/analysis";

/**
 * 简历解析的浏览器端入口。
 *
 * 原来逻辑在 /api/parse-resume，平台不支持 Next 服务端，所以整套规则搬到客户端。
 * 粘贴和上传两条路仍然汇合到 parseResumeText，返回结构和原接口保持一致。
 */
export type ParsedResume = {
  resume: ResumeData;
  text: string;
  headings: RecognizedHeading[];
  suspectedHeadings: string[];
};

export class ParseError extends Error {}

/** 粘贴全文。 */
export function parseResumeTextInput(input: string): ParsedResume {
  const text = input.trim();

  if (text.length === 0) throw new ParseError("简历文本为空，请先粘贴简历全文。");
  if (text.length < MIN_RESUME_LENGTH) {
    throw new ParseError(`简历文本只有 ${text.length} 个字，少于 ${MIN_RESUME_LENGTH} 个字，请粘贴完整内容。`);
  }

  return buildResult(text);
}

/** 上传 PDF / DOCX。提取出的文字会一并返回，前端回填到文本框让用户校对。 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
    throw new ParseError("只支持 PDF 和 DOCX 两种格式。");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ParseError(`文件不能超过 ${MAX_UPLOAD_LABEL}，请压缩后再试。`);
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch {
    throw new ParseError("没能读取这个文件，请确认文件没有损坏或加密，也可以改用粘贴方式。");
  }

  if (text.trim().length === 0) {
    throw new ParseError(
      "没有从文件里提取到文字。扫描件和图片型 PDF 需要 OCR，中期版本暂不支持，请改用粘贴方式。",
    );
  }

  return buildResult(text);
}

function buildResult(text: string): ParsedResume {
  const resume = parseResumeText(text);

  if (!isResumeData(resume)) throw new ParseError("解析结果格式异常，请稍后重试。");

  return {
    resume,
    text,
    headings: listRecognizedHeadings(text),
    suspectedHeadings: listSuspectedHeadings(text),
  };
}
