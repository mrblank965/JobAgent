const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const OUT = path.join(KB, "output");

const plan = JSON.parse(fs.readFileSync(path.join(OUT, "01-plan", "plan.json"), "utf8")).positions || [];
const collect = (id) => path.join(OUT, "02-collect", `${id}.json`);
const qa = (id) => path.join(OUT, "07-qa", `${id}.json`);
const postsOf = (id) => { try { return (JSON.parse(fs.readFileSync(collect(id), "utf8")).posts || []).length; } catch { return 0; } };

const pend = plan.filter(p => postsOf(p.id) >= 40 && !fs.existsSync(qa(p.id))).map(p => p.id);
console.log(`[batch] 待推进 ${pend.length} 个：${pend.join(", ")}`);

let ok = 0, fail = [];
for (const id of pend) {
  console.log(`[batch] >>> ${id} 开始 ${new Date().toLocaleTimeString("zh-CN")}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, "run.cjs"), "parse,clean,structure,index,qa", id], {
    stdio: "inherit", cwd: path.resolve(KB, ".."), env: process.env, timeout: 30 * 60 * 1000,
  });
  if (r.status === 0 && fs.existsSync(qa(id))) { ok += 1; console.log(`[batch] ${id} 完成 ✓`); }
  else { fail.push(id); console.log(`[batch] ${id} 失败 ✗`); }
}
console.log(`[batch] 全部结束：成功 ${ok}，失败 ${fail.length}：${fail.join(", ") || "无"}`);

// 索引必须一次性重建：build-index.cjs 按传入集合整体覆盖 kb/store/index.json，
// 若逐岗位调用会被后写的覆盖，导致索引只剩最后一个岗位。故最后统一用 "all" 重建全量索引。
console.log(`[batch] 重建全量索引（build-index all）`);
spawnSync(process.execPath, [path.join(__dirname, "build-index.cjs"), "all"], {
  stdio: "inherit", cwd: path.resolve(KB, ".."), env: process.env, timeout: 60 * 1000,
});

// 前端读的是 kb/store/kb-bundle.json，不是 index.json。
// 结构化产物有变化就必须重打包，否则 JD 页面检索到的还是上一次的岗位和数据。
console.log(`[batch] 重打包前端知识库（build-bundle）`);
const bundle = spawnSync(process.execPath, [path.join(__dirname, "build-bundle.cjs")], {
  stdio: "inherit", cwd: path.resolve(KB, ".."), env: process.env, timeout: 120 * 1000,
});
if (bundle.status !== 0) {
  console.log(`[batch] 打包失败，JD 页面会继续读旧 bundle，需要手动跑 node kb/scripts/build-bundle.cjs`);
}
