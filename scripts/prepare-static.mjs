/**
 * 静态导出前的准备。
 *
 * 知识库打包文件原本只在服务端按 fs 读取，静态站点拿不到。
 * 构建前复制到 public/，构建后会原样出现在 out/kb-bundle.json，
 * 浏览器用 fetch("./kb-bundle.json") 取。
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "kb/store/kb-bundle.json");
const target = resolve(root, "public/kb-bundle.json");

if (!existsSync(source)) {
  console.error(`[prepare-static] 找不到知识库文件：${source}`);
  process.exit(1);
}

copyFileSync(source, target);
console.log(`[prepare-static] 已复制知识库到 ${target}`);
