/**
 * 知识库匹配接口。
 *
 * 输入 JD 原文，返回匹配到的岗位。
 *
 * 两种匹配方式：
 *   1. 大模型语义匹配：请求带 ai 配置时，把 JD 和岗位清单交给模型，
 *      让它挑「干的活最接近」的岗位——岗位名不同但职责同类也能命中。
 *   2. 词表匹配：没带 ai 配置时的兜底，用岗位名/别名做相似度匹配。
 *
 * 返回里的 matchedBy 标明用了哪种，前端据实展示。
 */

import { buildKbMatchPrompt, parseKbMatch } from "@/lib/ai/jd";
import type { AISettings } from "@/lib/store";
import { listKbPositions } from "@/lib/kb/bundle";
import { buildMatchForPosition, matchPosition } from "@/lib/kb/match";
import { stripCodeFence } from "@/lib/ai/resume";

type RequestBody = {
  jd?: unknown;
  title?: unknown;
  ai?: { apiBase?: unknown; apiKey?: unknown; model?: unknown };
};

/** 服务端直连大模型，接口兼容 OpenAI 的 chat/completions。 */
async function callModel(settings: AISettings, system: string, prompt: string): Promise<unknown> {
  const base = (settings.apiBase || "https://api.deepseek.com/v1").replace(/\/+$/, "");

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || "deepseek-chat",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`接口返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = stripCodeFence(String(data.choices?.[0]?.message?.content ?? ""));
  if (!content) throw new Error("接口没有返回内容");
  return JSON.parse(content) as unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  if (!body || typeof body.jd !== "string" || body.jd.trim().length < 10) {
    return Response.json({ error: "请提交至少 10 个字的 JD。" }, { status: 400 });
  }

  const positions = listKbPositions();

  if (positions.length === 0) {
    return Response.json({
      match: matchPosition("", []),
      error: "知识库还没有打包，请先运行 node kb/scripts/build-bundle.cjs。",
    });
  }

  const title = typeof body.title === "string" ? body.title : "";

  // 带 ai 配置就尝试大模型语义匹配，失败或没结果退回词表
  const ai = body.ai;
  if (ai && typeof ai.apiKey === "string" && ai.apiKey.trim().length > 0) {
    const settings: AISettings = {
      apiBase: typeof ai.apiBase === "string" ? ai.apiBase : "https://api.deepseek.com/v1",
      apiKey: ai.apiKey.trim(),
      model: typeof ai.model === "string" ? ai.model : "deepseek-chat",
    };

    try {
      const candidates = positions.map((p) => ({
        id: p.positionId,
        title: p.title,
        aliases: p.aliases,
        coreDuties: p.sections.coreDuties,
      }));

      const raw = await callModel(settings, "", buildKbMatchPrompt(body.jd, candidates));
      const parsed = parseKbMatch(raw);

      if (parsed) {
        const match = buildMatchForPosition(parsed.positionId, positions, "llm", parsed.reason);
        if (match.matched) {
          return Response.json({ match });
        }
      }
    } catch (error) {
      // 大模型匹配失败（没 Key、网络问题、返回异常）不致命，退回词表匹配
      console.warn("[kb] 大模型匹配失败，退回词表匹配：", error instanceof Error ? error.message : error);
    }
  }

  return Response.json({ match: matchPosition(body.jd, positions, title) });
}
