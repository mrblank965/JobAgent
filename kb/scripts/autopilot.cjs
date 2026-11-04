/**
 * 自驱总控（Autopilot）：一条命令跑到全部岗位完成，无人值守。
 *
 * 运行：
 *   node kb/scripts/autopilot.cjs
 *
 * 每轮循环：
 *   1. 下游补跑：已采够但还没质检报告的岗位 → run.cjs parse..qa（跳过 25 分钟内进行中的）
 *   2. 采集缺口：collect all（断点续采，撞验证码自动中止）
 *   3. 仍有缺口 → 自适应冷却：每 5 分钟 probe 一次，放行即进下一轮（4 次未放行则整段等 20 分钟）；
 *      全部完成 → 刷新看板退出
 *
 * 判定标准：02-collect posts >= 40 为已采够；07-qa json 存在为已完成。
 * 上限 80 轮，随时 Ctrl+C 可停，重跑自动续。
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");
const NODE_PATH =
  process.env.NODE_PATH ||
  "C:\\Users\\Harrin\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\vm\\tools\\node\\node_modules\\@playwright\\mcp\\node_modules";
const COOLDOWN_MS = 20 * 60 * 1000;
const PROBE_FIRST_MS = 15 * 60 * 1000;
const PROBE_EVERY_MS = 15 * 60 * 1000;
const MAX_PROBE_ROUNDS = 2;
const PROBE_TIMEOUT_MS = 3 * 60 * 1000;
const FRESH_MS = 25 * 60 * 1000;
const MAX_CYCLES = 80;
const COLLECT_OK = 40;

const plan = JSON.parse(fs.readFileSync(path.join(OUT, "01-plan", "plan.json"), "utf8"));
const positions = plan.positions || [];

const collectJson = (id) => path.join(OUT, "02-collect", `${id}.json`);
const qaJson = (id) => path.join(OUT, "07-qa", `${id}.json`);

function postsOf(id) {
  try {
    return (JSON.parse(fs.readFileSync(collectJson(id), "utf8")).posts || []).length;
  } catch {
    return 0;
  }
}

function needCollect(id) {
  return postsOf(id) < COLLECT_OK;
}

function inFlight(id) {
  for (const dir of ["03-parse", "04-clean"]) {
    const p = path.join(OUT, dir, `${id}.json`);
    if (fs.existsSync(p) && Date.now() - fs.statSync(p).mtimeMs < FRESH_MS) return true;
  }
  return false;
}

function needDownstream(id) {
  return fs.existsSync(collectJson(id)) && postsOf(id) > 0 && !fs.existsSync(qaJson(id)) && !inFlight(id);
}

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    cwd: path.resolve(KB, ".."),
    env: { ...process.env, NODE_PATH },
  });
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 冷却等待（自适应探测版）。
 * 原逻辑：撞限频后死等 COOLDOWN_MS(20 分钟) 再进下一轮，平均有近半时间在空等。
 * 现逻辑：先等首个探测点 PROBE_FIRST_MS，之后每 PROBE_EVERY_MS 用一次 probe 检测搜狗是否放行；
 *        一放行立刻进下一轮。若探到上限 MAX_PROBE_ROUNDS 次仍被限，则退回整段 COOLDOWN_MS 硬等。
 * 探测代价：1 次搜索请求（不读详情页），远小于一轮采集，不会加重限频。
 */
function waitForRecovery() {
  const started = Date.now();
  console.log(`[auto] 撞限频，进入自适应冷却（首个探测点 ${PROBE_FIRST_MS / 60000} 分钟后）`);
  sleepMs(PROBE_FIRST_MS);
  for (let i = 1; i <= MAX_PROBE_ROUNDS; i += 1) {
    const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);
    const ok = probeOnce();
    if (ok) {
      console.log(`[auto] 第 ${i} 次探测（+${elapsedMin} 分钟）已放行，立即进入下一轮`);
      return;
    }
    console.log(`[auto] 第 ${i} 次探测（+${elapsedMin} 分钟）仍被限频`);
    if (i < MAX_PROBE_ROUNDS) sleepMs(PROBE_EVERY_MS);
  }
  const leftMin = (COOLDOWN_MS - (Date.now() - started)) / 60000;
  if (leftMin > 0) {
    console.log(`[auto] 探测 ${MAX_PROBE_ROUNDS} 次仍被限，改整段冷却，再等 ${leftMin.toFixed(0)} 分钟后进下一轮`);
    sleepMs(COOLDOWN_MS - (Date.now() - started));
  }
}

/** 跑一次 collect probe，判定 captcha 字段是否为 false。探测异常按“未放行”处理。 */
function probeOnce() {
  const term = positions[0]?.keywords?.[0] || "银行客户经理日常";
  const r = spawnSync(process.execPath, [path.join(__dirname, "collect.cjs"), "probe", term], {
    cwd: path.resolve(KB, ".."),
    env: { ...process.env, NODE_PATH },
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  const out = String(r.stdout || "");
  if (!out.trim()) return false;
  const m = out.match(/"captcha"\s*:\s*(true|false)/);
  return m ? m[1] === "false" : false;
}

function summary() {
  const doneQa = positions.filter((p) => fs.existsSync(qaJson(p.id))).length;
  const okCollect = positions.filter((p) => !needCollect(p.id)).length;
  const partial = positions.filter((p) => postsOf(p.id) > 0 && postsOf(p.id) < COLLECT_OK).map((p) => `${p.id}(${postsOf(p.id)}条)`);
  console.log(`[auto] 进度：采集 ${okCollect}/${positions.length}，完成全链路 ${doneQa}/${positions.length}${partial.length ? `，缺口部分采集：${partial.join(", ")}` : ""}`);
  return { doneQa, okCollect, partial };
}

for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
  console.log(`\n[auto] ===== 第 ${cycle}/${MAX_CYCLES} 轮 ${new Date().toLocaleTimeString("zh-CN")} =====`);
  const s = summary();
  if (s.doneQa === positions.length) {
    console.log("[auto] 全部岗位完成全链路，刷新看板后退出");
    runNode(path.join(__dirname, "status.cjs"), []);
    process.exit(0);
  }

  const downIds = positions.filter((p) => needDownstream(p.id)).map((p) => p.id);
  if (downIds.length) {
    console.log(`[auto] 下游补跑：${downIds.join(", ")}`);
    for (const id of downIds) {
      console.log(`[auto] >>> 下游 ${id}`);
      runNode(path.join(__dirname, "run.cjs"), ["parse,clean,structure,index,qa", id]);
    }
  }

  const rest = positions.filter((p) => needCollect(p.id)).map((p) => p.id);
  if (rest.length) {
    console.log(`[auto] 采集缺口 ${rest.length} 个：${rest.slice(0, 6).join(", ")}${rest.length > 6 ? " …" : ""}`);
    runNode(path.join(__dirname, "collect.cjs"), ["collect", "all"]);
  }

  const after = summary();
  if (after.doneQa === positions.length) {
    console.log("[auto] 全部岗位完成全链路，刷新看板后退出");
    runNode(path.join(__dirname, "status.cjs"), []);
    process.exit(0);
  }
  if (after.okCollect + 0 < positions.length || rest.length) {
    waitForRecovery();
  }
}

console.log(`\n[auto] 达到 ${MAX_CYCLES} 轮上限退出。当前状态：`);
summary();