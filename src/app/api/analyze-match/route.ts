export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { resume?: unknown; jd?: unknown } | null;

  if (!body?.resume || !body.jd) {
    return Response.json({ error: "匹配分析需要同时提供 resume 和 jd。" }, { status: 400 });
  }

  return Response.json(
    {
      error: "匹配分析尚未接入。",
      nextStep: "成员 D 需要比较 ResumeData 与 JDData，并输出 MatchResult。",
    },
    { status: 501 },
  );
}
