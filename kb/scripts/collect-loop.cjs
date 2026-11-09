/**
 * 采集自驱循环（Collect Loop）：只跑采集，不碰下游，等价于 autopilot 的采集部分。
 *
 * 用途：当 LLM 阶段（clean/structure/qa）因余额或故障不可用时，仍让采集持续推进，
 *      避免 autopilot 反复重试下游造成空转。
 *
 * 运行：
 *   node kb/scripts/collect-loop.cjs
 *
 * 逻辑：每轮跑一次 collect all（断点续采，已采够>=40 自动跳过），
 *      全部达标则刷新看板退出；仍有缺口则等 15 分钟后 probe，放行即进下一轮。
 */

const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");
const COLLECT_OK = 40;
const WAIT_MS = 15 * 60 * 1000;
const NODE_PATH =
  process.env.NODE_PATH ||
  "C:\\Users\\Harrin\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\vm\\tools\\node\\node_modules\\@playwright\\mcp\\node_modules";

const plan = JSON.parse(fs.readFileSync(path.join(OUT, "01-plan", "plan.json"), "utf8")).positions || [];

function postsOf(id) {
  try {
    return (JSON.parse(fs.readFileSync(path.join(OUT, "02-collect", `${id}.json`), "utf8")).posts || []).length;
  } catch {
    return 0;
  }
}

function pending() {
  return plan.filter((p) => postsOf(p.id) < COLLECT_OK);
}

function log(m) {
  console.log(`[loop] ${new Date().toLocaleTimeString("zh-CN")} ${m}`);
}

function runNode(script, args) {
  return spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: "inherit",
    cwd: path.resolve(KB, ".."),
    env: { ...process.env, NODE_PATH },
    timeout: 40 * 60 * 1000,
  });
}

function probeOk() {
  const term = pending()[0]?.keywords?.[0] || "银行客户经理日常";
  const r = spawnSync(process.execPath, [path.join(__dirname, "collect.cjs"), "probe", term], {
    cwd: path.resolve(KB, ".."),
    env: { ...process.env, NODE_PATH },
    encoding: "utf8",
    timeout: 3 * 60 * 1000,
  });
  const m = String(r.stdout || "").match(/"captcha"\s*:\s*(true|false)/);
  return m ? m[1] === "false" : false;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

log(`启动，待采 ${pending().length} 个：${pending().map((p) => p.id).join(", ") || "无"}`);

for (let cycle = 1; ; cycle += 1) {
  const todo = pending();
  if (!todo.length) {
    log("全部岗位采集达标，退出");
    runNode("status.cjs", []);
    break;
  }
  log(`第 ${cycle} 轮开始，待采 ${todo.length} 个`);
  runNode("collect.cjs", ["collect", "all"]);

  if (!pending().length) {
    log("全部岗位采集达标，退出");
    runNode("status.cjs", []);
    break;
  }
  log(`本轮结束，仍待采 ${pending().length} 个，等 15 分钟后探测`);
  sleep(WAIT_MS);
  if (probeOk()) log("探测放行，进入下一轮");
  else log("探测仍被限，再等 15 分钟");
}
