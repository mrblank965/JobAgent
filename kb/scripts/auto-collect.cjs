/**
 * 自动循环采集器：冷却 → 采集全部缺口岗位 → 撞限频自动进入下一轮 → 直到采够为止。
 *
 * 运行：
 *   node kb/scripts/auto-collect.cjs
 *
 * 判定标准：02-collect/<id>.json 存在且 posts >= 40 视为已采够；
 * collect.cjs 自带断点续采（已采够自动跳过、验证码中止落盘），本脚本只负责循环重启。
 * 上限 30 轮，防止死循环。
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const COLLECT_DIR = path.join(KB, "output", "02-collect");
const NODE_PATH =
  process.env.NODE_PATH ||
  "C:\\Users\\Harrin\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\vm\\tools\\node\\node_modules\\@playwright\\mcp\\node_modules";
const COOLDOWN_MS = 20 * 60 * 1000;
const MAX_CYCLES = 30;

const plan = JSON.parse(fs.readFileSync(path.join(KB, "output", "01-plan", "plan.json"), "utf8"));

function remaining() {
  return (plan.positions || [])
    .filter((p) => {
      const f = path.join(COLLECT_DIR, `${p.id}.json`);
      if (!fs.existsSync(f)) return true;
      try {
        return (JSON.parse(fs.readFileSync(f, "utf8")).posts || []).length < 40;
      } catch {
        return true;
      }
    })
    .map((p) => `${p.id}(${p.title})`);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
  const rest = remaining();
  if (rest.length === 0) {
    console.log("\n[auto] 全部岗位采集完成，退出");
    process.exit(0);
  }
  console.log(`\n[auto] ===== 第 ${cycle}/${MAX_CYCLES} 轮 ===== 待采 ${rest.length} 个：${rest.slice(0, 4).join(", ")}${rest.length > 4 ? " …" : ""}`);
  if (cycle > 1) {
    console.log(`[auto] 冷却 20 分钟避开限频…`);
    sleepMs(COOLDOWN_MS);
  }
  const r = spawnSync(process.execPath, [path.join(__dirname, "collect.cjs"), "collect", "all"], {
    stdio: "inherit",
    cwd: path.resolve(KB, ".."),
    env: { ...process.env, NODE_PATH },
  });
  console.log(`[auto] 本轮 collect 退出码 ${r.status}（沙箱噪音可能导致非 0，以落盘数量为准）`);
  sleepMs(60 * 1000);
}

console.log(`\n[auto] 达到 ${MAX_CYCLES} 轮上限，剩余：${remaining().join(", ") || "无"}`);