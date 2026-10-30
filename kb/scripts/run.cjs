/**
 * 总控（调度层）：按串行接力调度各 Agent，校验交接契约，重试、回退、失败隔离。
 *
 * 运行：
 *   node kb/scripts/run.cjs                         跑默认阶段（plan,parse,clean,structure,index,qa）
 *   node kb/scripts/run.cjs plan,collect,parse        指定阶段
 *   node kb/scripts/run.cjs qa fin-bank-rm            只对某个岗位跑某阶段
 *
 * 职责边界：只调度、只检查，**不产出任何交付物**，也不修改各 Agent 的产出内容。
 * 唯一落盘的是内部失败日志 kb/state/errors.jsonl（用于失败隔离留痕，不是交付物）。
 *
 * 调度规则：
 *   1. 串行：上一阶段产出通过契约校验后才推进下一阶段
 *   2. 每步之间用 validate.cjs 校验；不合格退回重做，最多重试 2 次
 *   3. 质检判「不忠实」→ 退回结构化重做（≤2 轮）
 *   4. 单条/单岗位失败不卡死整批：跳过并记录
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");
const STATE_DIR = path.join(KB, "state");
const ERRORS_PATH = path.join(STATE_DIR, "errors.jsonl");
const CONFIG = JSON.parse(fs.readFileSync(path.join(KB, "pipeline.config.json"), "utf8"));

const MAX_RETRIES = CONFIG.orchestration?.maxRetriesPerStage ?? 2;
const QA_ROUNDS = CONFIG.orchestration?.maxQaFallbackRounds ?? 2;

// collect 会打开浏览器并需要登录态，默认不跑，必须显式指定
const STAGE_SCRIPT = {
  plan: { script: "plan.cjs", perPosition: false },
  collect: { script: "collect.cjs", perPosition: true, args: (pid) => ["collect", pid] },
  parse: { script: "parse.cjs", perPosition: true, args: (pid) => [pid] },
  clean: { script: "clean.cjs", perPosition: true, args: (pid) => [pid] },
  structure: { script: "structure.cjs", perPosition: true, args: (pid) => [pid] },
  index: { script: "build-index.cjs", perPosition: true, args: (pid) => [pid] },
  qa: { script: "qa.cjs", perPosition: true, args: (pid) => [pid] },
};
const DEFAULT_STAGES = ["plan", "parse", "clean", "structure", "index", "qa"];

function listPositionIds() {
  const planJson = path.join(OUT, "01-plan", "plan.json");
  if (fs.existsSync(planJson)) {
    return JSON.parse(fs.readFileSync(planJson, "utf8")).positions.map((p) => p.id);
  }
  const mdPath = path.join(OUT, "01-plan", "岗位清单.md");
  if (!fs.existsSync(mdPath)) return [];
  return fs
    .readFileSync(mdPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^##\s+(\S+)\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: path.resolve(KB, ".."),
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function runValidate(stage, arg) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "validate.cjs"), stage, ...(arg ? [arg] : [])], {
    cwd: path.resolve(KB, ".."),
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function recordError(stage, unit, reason) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(
    ERRORS_PATH,
    JSON.stringify({ stage, unit, reason: String(reason).slice(0, 300), at: new Date().toISOString() }) + "\n",
    "utf8",
  );
}

/** 跑一个「产出脚本 + 契约校验」单元，失败最多重试 MAX_RETRIES 次；仍失败则记录并跳过。 */
function runUnit(stage, label, scriptArgs, validateArg) {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    console.log(`\n=== [${stage}] ${label} 第 ${attempt} 次尝试 ===`);
    if (!runNode(STAGE_SCRIPT[stage].script, scriptArgs)) {
      console.log(`[${stage}] ${label} 产出脚本失败`);
      continue;
    }
    if (runValidate(stage, validateArg)) {
      console.log(`[${stage}] ${label} 通过契约校验`);
      return { ok: true, attempts: attempt };
    }
    console.log(`[${stage}] ${label} 契约校验不合格，退回重做`);
  }
  recordError(stage, label, `重试 ${MAX_RETRIES} 次后仍未通过契约校验`);
  console.log(`[${stage}] ${label} 跳过并记录到 kb/state/errors.jsonl`);
  return { ok: false, attempts: MAX_RETRIES + 1 };
}

function failedQaPositions() {
  const dir = path.join(OUT, "07-qa");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).faithful === false;
      } catch {
        return false;
      }
    })
    .map((f) => f.replace(/\.json$/, ""));
}

function main() {
  const stageArg = process.argv[2];
  const targetArg = process.argv[3];
  const stages = stageArg ? stageArg.split(",").map((s) => s.trim()) : DEFAULT_STAGES;

  for (const stage of stages) {
    if (!STAGE_SCRIPT[stage]) {
      console.log(`[warn] 未知阶段：${stage}，已忽略`);
      continue;
    }
  }

  const positionIds = listPositionIds();
  console.log(`>>> 总控启动：阶段 ${stages.join(" → ")}`);
  console.log(`>>> 岗位清单：${positionIds.length} 个${positionIds.length ? `（${positionIds.slice(0, 5).join(", ")}${positionIds.length > 5 ? " …" : ""}）` : ""}`);

  for (const stage of stages) {
    if (!STAGE_SCRIPT[stage]) continue;

    if (!STAGE_SCRIPT[stage].perPosition) {
      runUnit(stage, "全量", [], undefined);
      continue;
    }

    const targetIds = (targetArg && targetArg !== "all" ? targetArg.split(",") : []).map((s) => s.trim()).filter(Boolean);
    const targets = targetIds.length > 0 ? targetIds : positionIds;
    if (targets.length === 0) {
      console.log(`[${stage}] 没有可处理的岗位，跳过`);
      continue;
    }

    let ok = 0;
    let skipped = 0;
    for (const pid of targets) {
      const res = runUnit(stage, pid, STAGE_SCRIPT[stage].args(pid), pid);
      if (res.ok) ok += 1;
      else skipped += 1;
    }
    console.log(`\n>>> [${stage}] 完成：通过 ${ok}，跳过 ${skipped}`);

    if (stage === "qa" && skipped === 0) {
      const failed = failedQaPositions();
      if (failed.length > 0) {
        console.log(`\n>>> 质检判定 ${failed.length} 个岗位不忠实，退回结构化 Agent 重做`);
        for (let round = 1; round <= QA_ROUNDS; round += 1) {
          console.log(`\n=== [qa-fallback] 第 ${round} 轮回退 ===`);
          for (const pid of failed) {
            runNode("structure.cjs", [pid]);
            runNode("build-index.cjs", [pid]);
            runNode("qa.cjs", [pid]);
          }
          const still = failedQaPositions();
          if (still.length === 0) {
            console.log(">>> 回退后全部通过");
            break;
          }
          if (round === QA_ROUNDS) {
            for (const pid of still) {
              recordError("qa-fallback", pid, `回退 ${QA_ROUNDS} 轮后仍判定不忠实，保留并标记 qaStatus=fail`);
            }
            console.log(`>>> 仍有 ${still.length} 个岗位不忠实，已记录并保留（不删除、不隐瞒）`);
          }
        }
      }
    }
  }

  console.log("\n>>> 总控完成。各阶段交付物见 kb/output/");
}

main();
