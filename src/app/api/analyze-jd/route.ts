export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jd?: unknown } | null;

  if (!body || typeof body.jd !== "string" || body.jd.trim().length < 20) {
    return Response.json({ error: "请提交至少 20 个字的 JD。" }, { status: 400 });
  }

  return Response.json(
    {
      error: "JD 的 DeepSeek 分析尚未接入。",
      nextStep: "成员 C 需要调用 lib/ai/deepseek.ts，并校验返回的 JDData。",
    },
    { status: 501 },
  );
}
