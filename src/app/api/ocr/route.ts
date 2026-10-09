import { ocrImages } from "@/lib/ocr";

/** 一次最多识别这么多张，防止有人一口气传几十张把服务端占满。 */
const MAX_IMAGES = 10;

/** 单张图片体积上限。 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 图片文字识别。
 *
 * 接收截图，返回识别出的文字。招聘贴经常把 JD 做成图片，
 * 复制不到文字的时候可以把截图传上来。
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "请求格式不正确，请用表单上传图片。" }, { status: 400 });
  }

  const files = formData.getAll("images").filter((item): item is File => item instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "请先选择要识别的图片。" }, { status: 400 });
  }

  if (files.length > MAX_IMAGES) {
    return Response.json({ error: `一次最多识别 ${MAX_IMAGES} 张图片。` }, { status: 400 });
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return Response.json({ error: `${file.name} 不是图片文件。` }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: `${file.name} 超过 8MB，请压缩后再传。` }, { status: 400 });
    }
  }

  try {
    const buffers = await Promise.all(
      files.map(async (file) => Buffer.from(await file.arrayBuffer())),
    );

    const result = await ocrImages(buffers);

    if (result.text.trim().length === 0) {
      return Response.json(
        { error: "这几张图没识别出文字，可能是纯图形或者太模糊，请换清晰的截图。" },
        { status: 400 },
      );
    }

    return Response.json(result);
  } catch {
    return Response.json(
      { error: "识别失败。首次使用需要联网下载中文语言包，请检查网络后重试。" },
      { status: 500 },
    );
  }
}
