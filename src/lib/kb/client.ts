import { buildKbMatchPrompt, KB_MATCH_SYSTEM_PROMPT, parseKbMatch } from "@/lib/ai/jd";
import type { AISettings } from "@/lib/store";
import { callChatJSON } from "@/lib/ai/resume";
import { buildMatchForPosition, matchPosition } from "./match";
import type { KbBundle, KbMatch, KbPosition } from "./types";

/**
 * 浏览器端知识库匹配。
 *
 * 原来在 /api/kb/match 里用 fs 读 bundle，静态站点拿不到文件系统。
 * 构建前 scripts/prepare-static.mjs 把 bundle 复制到 public/，
 * 这里 fetch 一次后缓存在模块变量里。
 */

let bundlePromise: Promise<KbBundle> | null = null;

function emptyBundle(): KbBundle {
  return { builtAt: "", positionCount: 0, pointCount: 0, positions: [] };
}

async function loadBundle(): Promise<KbBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch("/kb-bundle.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`知识库读取失败：HTTP ${response.status}`);
        return (await response.json()) as KbBundle;
      })
      .catch((error) => {
        // 读不到就按空库处理，界面显示「未覆盖」，不要挡住 JD 拆解。
        console.warn("[kb] 知识库读取失败，按未覆盖处理：", error instanceof Error ? error.message : error);
        return emptyBundle();
      });
  }
  return bundlePromise;
}

async function loadPositions(): Promise<KbPosition[]> {
  return (await loadBundle()).positions;
}

/**
 * 先尝试大模型语义匹配（有 AI 配置时），失败或没结果退回词表匹配。
 * 和原服务端接口的两种匹配方式保持一致。
 */
export async function matchKb(jd: string, title = "", ai?: AISettings): Promise<KbMatch> {
  const positions = await loadPositions();

  if (positions.length === 0) return matchPosition("", []);

  if (ai && ai.apiKey.trim().length > 0) {
    try {
      const candidates = positions.map((position) => ({
        id: position.positionId,
        title: position.title,
        aliases: position.aliases,
        coreDuties: position.sections.coreDuties,
      }));

      const raw = await callChatJSON(
        ai,
        buildKbMatchPrompt(jd, candidates),
        KB_MATCH_SYSTEM_PROMPT,
      );
      const parsed = parseKbMatch(raw);

      if (parsed) {
        const match = buildMatchForPosition(parsed.positionId, positions, "llm", parsed.reason);
        if (match.matched) return match;
      }
    } catch (error) {
      // 大模型匹配失败不致命，退回词表匹配。
      console.warn("[kb] 大模型匹配失败，退回词表匹配：", error instanceof Error ? error.message : error);
    }
  }

  return matchPosition(jd, positions, title);
}
