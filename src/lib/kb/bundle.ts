/**
 * 知识库读取。
 *
 * bundle 由 kb/scripts/build-bundle.cjs 生成，放在 kb/store/kb-bundle.json。
 * 只在服务端读：文件系统在浏览器里拿不到，而且 800 多 KB 全量下发也没必要，
 * 前端只取匹配到的那一个岗位。
 *
 * 进程内缓存：开发模式热更新时文件会变，用 mtime 判断要不要重读。
 *
 * 路径不能只认 process.cwd()：本地 next dev / next start 的 cwd 是项目根，
 * 但 standalone 产物、容器里 cwd 可能是别的目录，硬编码会让知识库静默变空。
 * 所以按候选列表探测一遍，都找不到再报「未覆盖」。
 */

import fs from "node:fs";
import path from "node:path";
import type { KbBundle, KbPosition } from "./types";

/** 相对项目根的固定位置。 */
const RELATIVE = path.join("kb", "store", "kb-bundle.json");

/** 探测顺序：显式指定 > 项目根 > 上一级 > standalone 结构。 */
const CANDIDATES = [
  process.env.KB_BUNDLE_PATH ?? "",
  path.join(process.cwd(), RELATIVE),
  path.join(process.cwd(), "..", RELATIVE),
  path.join(process.cwd(), "..", "..", RELATIVE),
  path.join(process.cwd(), ".next", "standalone", RELATIVE),
].filter((item) => item.length > 0);

/** 解析一次就记住，免得每次请求都 stat 一串路径。 */
let resolved: string | null = null;
let warned = false;

let cache: { mtimeMs: number; bundle: KbBundle } | null = null;

const EMPTY: KbBundle = { builtAt: "", positionCount: 0, pointCount: 0, positions: [] };

function resolveBundlePath(): string | null {
  if (resolved && fs.existsSync(resolved)) return resolved;

  for (const candidate of CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) {
        resolved = candidate;
        return candidate;
      }
    } catch {
      // 这个位置没有，试下一个
    }
  }

  resolved = null;
  if (!warned) {
    warned = true;
    console.warn(
      `[kb] 没找到知识库打包文件，JD 检索会一律返回「未覆盖」。已尝试：\n  ${CANDIDATES.join("\n  ")}\n` +
        `先在项目根执行 node kb/scripts/build-bundle.cjs，或用 KB_BUNDLE_PATH 指定路径。`,
    );
  }
  return null;
}

/** 读 bundle。文件不存在时返回空库，调用方按「未覆盖」处理，不要让整页报错。 */
export function loadKbBundle(): KbBundle {
  const file = resolveBundlePath();
  if (!file) return EMPTY;

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return EMPTY;
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache.bundle;

  try {
    const bundle = JSON.parse(fs.readFileSync(file, "utf8")) as KbBundle;
    cache = { mtimeMs, bundle };
    return bundle;
  } catch (error) {
    console.warn(`[kb] 知识库打包文件解析失败：${file}`, error);
    return EMPTY;
  }
}

export function listKbPositions(): KbPosition[] {
  return loadKbBundle().positions;
}

export function getKbPosition(positionId: string): KbPosition | null {
  return loadKbBundle().positions.find((item) => item.positionId === positionId) ?? null;
}
