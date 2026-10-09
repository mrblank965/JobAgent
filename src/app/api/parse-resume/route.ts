import {
  extractTextFromFile,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  SUPPORTED_FILE_TYPES,
} from "@/lib/parsers/extract";
import {
  listRecognizedHeadings,
  listSuspectedHeadings,
  MIN_RESUME_LENGTH,
  parseResumeText,
} from "@/lib/parsers/resumeText";
import { isResumeData } from "@/lib/schemas/analysis";

/**
 * 成员 B 负责：把简历变成 ResumeData。
 *
 * 两条入口，同一个出口。
 * 1. JSON：{ "resumeText": "粘贴的全文" }，直接用本地规则解析。
 * 2. 表单：上传 PDF 或 DOCX，先提取文字，再用同一套规则解析。
 * 上传那条会把提取出的文字一并返回，前端把它填进粘贴框，用户可以看见并修改。
 *
 * 全程使用本地规则，不调用 DeepSeek。本文件不打印任何请求内容，
 * 避免简历正文进入服务器日志。
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return handlePastedText(request);
  }

  return handleUploadedFile(request);
}

async function handlePastedText(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const resumeText = (payload as { resumeText?: unknown } | null)?.resumeText;
  if (typeof resumeText !== "string") {
    return Response.json({ error: "请在 resumeText 字段中提供简历文本。" }, { status: 400 });
  }

  const text = resumeText.trim();
  if (text.length === 0) {
    return Response.json({ error: "简历文本为空，请先粘贴简历全文。" }, { status: 400 });
  }

  if (text.length < MIN_RESUME_LENGTH) {
    return Response.json(
      { error: `简历文本只有 ${text.length} 个字，少于 ${MIN_RESUME_LENGTH} 个字，请粘贴完整内容。` },
      { status: 400 },
    );
  }

  return buildResponse(text);
}

async function handleUploadedFile(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "请求格式不正确，请改用表单上传文件。" }, { status: 400 });
  }

  const file = formData.get("resume");

  if (!(file instanceof File)) {
    return Response.json({ error: "请在 resume 字段中上传简历文件。" }, { status: 400 });
  }

  if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
    return Response.json({ error: "只支持 PDF 和 DOCX 两种格式。" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: `文件不能超过 ${MAX_UPLOAD_LABEL}，请压缩后再试。` }, { status: 400 });
  }

  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch {
    return Response.json(
      { error: "没能读取这个文件，请确认文件没有损坏或加密，也可以改用粘贴方式。" },
      { status: 500 },
    );
  }

  if (text.trim().length === 0) {
    return Response.json(
      {
        error:
          "没有从文件里提取到文字。扫描件和图片型 PDF 需要 OCR，中期版本暂不支持，请改用粘贴方式。",
      },
      { status: 400 },
    );
  }

  return buildResponse(text);
}

/** 两条入口共用的出口：跑同一套规则，返回同一种结构。 */
function buildResponse(text: string): Response {
  const resume = parseResumeText(text);

  if (!isResumeData(resume)) {
    return Response.json({ error: "解析结果格式异常，请稍后重试。" }, { status: 500 });
  }

  // headings 和 suspectedHeadings 是诊断用的，
  // 让用户看见哪些小标题被认出来了、哪些疑似没认出来。
  return Response.json({
    resume,
    parser: "local-demo",
    text,
    headings: listRecognizedHeadings(text),
    suspectedHeadings: listSuspectedHeadings(text),
  });
}
