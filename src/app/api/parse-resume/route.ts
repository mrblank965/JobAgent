const allowedTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("resume");

  if (!(file instanceof File)) {
    return Response.json({ error: "请在 resume 字段中上传简历文件。" }, { status: 400 });
  }

  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: "中期版本只支持 PDF 和 DOCX。" }, { status: 400 });
  }

  return Response.json(
    {
      error: "简历文本提取尚未接入。",
      nextStep: "成员 B 需要调用 lib/parsers 中的 PDF 或 DOCX 解析函数。",
    },
    { status: 501 },
  );
}
