/**
 * 采集 Agent（工具型）：按岗位关键词抓「搜狗微信搜索」的公众号文章。
 *
 * 运行：
 *   node kb/scripts/collect.cjs collect               抓取岗位清单里的全部岗位
 *   node kb/scripts/collect.cjs collect fin-bank-rm   只抓一个岗位
 *   node kb/scripts/collect.cjs probe "关键词"         搜索连通性 + 详情页抓取诊断
 *
 * 输入：kb/output/01-plan/岗位清单.md（固定格式；缺失时回退读 plan.json）
 * 产出：kb/output/02-collect/<positionId>.md   ← 交付物（给人看）
 *       kb/output/02-collect/<positionId>.json ← 机器可读副本（流水线内部交接）
 *
 * 规则：每个关键词取前 15 条；只抓图文（公众号正文），视频号跳过；单条失败记录后继续。
 * 运行环境需能 require("playwright")（NODE_PATH 指向 @playwright/mcp 自带的 node_modules）。
 * 说明：搜狗微信搜索免登录，但会限频/弹验证码，脚本控制速度并在遇到验证码时停下提示。
 */

const { chromium } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KB = path.resolve(__dirname, "..");
const PLAN_DIR = path.join(KB, "output", "01-plan");
const OUT_DIR = path.join(KB, "output", "02-collect");
const PROFILE_DIR = path.join(KB, ".browser-profile");

const MAX_NOTES_PER_TERM = Number(process.env.MAX_NOTES_PER_TERM || 15);
const PAGE_SIZE = 10; // 搜狗微信搜索单页约 10 条

function ensureDirs() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function shortHash(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 16);
}

/** 读岗位清单：优先 plan.json，缺失则解析 岗位清单.md 的固定格式。 */
function readPlan() {
  const jsonPath = path.join(PLAN_DIR, "plan.json");
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")).positions || [];
  }
  const mdPath = path.join(PLAN_DIR, "岗位清单.md");
  if (!fs.existsSync(mdPath)) {
    throw new Error(`找不到岗位清单：${mdPath}（请先运行 node kb/scripts/plan.cjs）`);
  }
  const positions = [];
  let current = null;
  for (const line of fs.readFileSync(mdPath, "utf8").split(/\r?\n/)) {
    const head = line.match(/^##\s+(\S+)\s*$/);
    if (head) {
      current = { id: head[1], title: "", keywords: [], aliases: [] };
      positions.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^-\s*(岗位名|JD 常见别名|搜索关键词)\s*：\s*(.*)$/);
    if (!field) continue;
    const values = field[2].split("|").map((s) => s.trim()).filter(Boolean);
    if (field[1] === "岗位名") current.title = values[0] || "";
    if (field[1] === "JD 常见别名") current.aliases = values;
    if (field[1] === "搜索关键词") current.keywords = values;
  }
  return positions.filter((p) => p.id && p.keywords.length > 0);
}

async function openContext() {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    locale: "zh-CN",
    args: ["--disable-blink-features=AutomationControlled", "--start-maximized", "--window-position=0,0"],
  });
}

/** 搜狗微信搜索：搜索某关键词，返回 { ok, captcha }。 */
async function searchTerm(page, term) {
  const url =
    `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(term)}` +
    `&ie=utf8&s_from=input&_sug_=n&_sug_type_=&page=1`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const captcha = await page
    .evaluate(() => !!document.querySelector("input#seccodeInput, img#seccodeImage, [class*=seccode], [id*=seccode]"))
    .catch(() => true);
  return { ok: !captcha, captcha };
}

/** 解析当前列表页的公众号文章（标题/摘要/公众号/时间/链接）。 */
async function harvestPage(page) {
  return page.evaluate(() => {
    const items = [];
    for (const li of Array.from(document.querySelectorAll("ul.news-list li"))) {
      const a = li.querySelector("h3 a") || li.querySelector('a[target="_blank"]') || li.querySelector("a");
      const title = (a?.innerText || "").trim();
      const href = a?.getAttribute("href") || "";
      if (!title || !href) continue;
      const summary = (li.querySelector(".txt-info, [class*=txt-info]")?.innerText || "").trim();
      const account = (li.querySelector(".account, [class*=account], .s-p a, .s2")?.innerText || "").trim();
      const time = (li.querySelector("[class*=time], .s-p span, .time")?.innerText || "").trim();
      items.push({ title, href, summary: summary.slice(0, 500), account, time });
    }
    return items;
  });
}

/** 打开详情页（搜狗 link 会 302 到 mp.weixin.qq.com），抓正文与元信息。 */
async function readDetail(page, item) {
  const link = item.href.startsWith("http") ? item.href : `https://weixin.sogou.com${item.href}`;
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  return page.evaluate(() => {
    const text = (document.querySelector("#js_content, .rich_media_content")?.innerText || "").trim();
    const title = (document.querySelector("#activity-name, h1.rich_media_title")?.innerText || "").trim();
    const account = (document.querySelector("#js_name, .rich_media_meta a")?.innerText || "").trim();
    const date = (document.querySelector("#publish_time, .rich_media_meta_text")?.innerText || "").trim();
    const isVideo = !!document.querySelector('video, [class*="video_player"], mp-common-videosnap');
    return { text: text.slice(0, 6000), title, account, date, isVideo, url: location.href };
  });
}

async function collectTerm(page, term) {
  const found = await searchTerm(page, term);
  if (!found.ok) {
    return { term, hit: 0, adopted: 0, captcha: true, items: [], skipped: [] };
  }

  const adopted = [];
  const skipped = [];
  let pageNo = 1;
  while (adopted.length < MAX_NOTES_PER_TERM && pageNo <= 2) {
    if (pageNo > 1) {
      const url =
        `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(term)}` +
        `&ie=utf8&s_from=input&_sug_=n&_sug_type_=&page=${pageNo}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    const items = await harvestPage(page);
    if (items.length === 0) break;
    for (const item of items) {
      if (adopted.length >= MAX_NOTES_PER_TERM) break;
      await page.waitForTimeout(800);
      try {
        const detail = await readDetail(page, item);
        if (detail.isVideo) {
          skipped.push({ postId: shortHash(item.href), url: item.href, title: detail.title || item.title, reason: "视频号内容（按规则跳过）" });
          continue;
        }
        adopted.push({
          postId: shortHash(detail.url || item.href),
          positionId: "",
          searchTerm: term,
          url: detail.url || linkOf(item.href),
          title: detail.title || item.title,
          text: detail.text || item.summary,
          images: [],
          author: detail.account || item.account,
          postedAt: detail.date || item.time,
          collectedAt: new Date().toISOString().slice(0, 10),
        });
      } catch (error) {
        skipped.push({ postId: shortHash(item.href), url: item.href, title: item.title, reason: `抓取失败：${String(error).slice(0, 120)}` });
      }
    }
    pageNo += 1;
    await page.waitForTimeout(1500);
  }

  return { term, hit: adopted.length + skipped.length, adopted: adopted.length, captcha: false, items: adopted, skipped };
}

function linkOf(href) {
  return href.startsWith("http") ? href : `https://weixin.sogou.com${href}`;
}

function renderMd(position, result) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# 采集结果 · ${position.title}（${position.id}）`,
    "",
    `> 采集 Agent · ${today} · 关键词 ${position.keywords.length} 个 · 采纳 ${result.posts.length} 条 · 跳过 ${result.skipped.length} 条`,
    "",
    "## 关键词命中情况",
    "",
    "| 关键词 | 命中 | 采纳 | 备注 |",
    "| --- | --- | --- | --- |",
  ];
  for (const s of result.termStats) {
    lines.push(`| ${s.term} | ${s.hit} | ${s.adopted} | ${s.captcha ? "触发验证码，已跳过" : "—"} |`);
  }
  lines.push("");

  if (result.skipped.length > 0) {
    lines.push("## 跳过记录", "");
    for (const s of result.skipped) {
      lines.push(`- ${s.reason}｜${s.title || s.postId}｜${s.url}`);
    }
    lines.push("");
  }

  lines.push("## 帖子明细", "");
  result.posts.forEach((p, i) => {
    lines.push(
      `### ${i + 1}. ${p.title || "（无标题）"}`,
      "",
      `- 链接：${p.url}`,
      `- 来源公众号：${p.author || "未知"}`,
      `- 发布时间：${p.postedAt || "未知"}`,
      `- 检索词：${p.searchTerm}`,
      "",
      "正文：",
      "",
      "```text",
      p.text || "（正文为空，仅摘要）",
      "```",
      "",
    );
  });
  return lines.join("\n");
}

async function main() {
  ensureDirs();
  const mode = process.argv[2] || "collect";
  const arg = process.argv[3];

  const context = await openContext();
  const page = context.pages()[0] || (await context.newPage());

  try {
    if (mode === "probe") {
      const term = arg || "银行客户经理日常";
      const found = await searchTerm(page, term);
      const items = found.ok ? await harvestPage(page) : [];
      let detail = null;
      if (items.length > 0) detail = await readDetail(page, items[0]);
      console.log(
        JSON.stringify(
          { term, found, url: page.url().slice(0, 120), listCount: items.length, sample: items.slice(0, 3), detail },
          null,
          2,
        ),
      );
      return;
    }

    const positions = readPlan();
    const ids = (arg && arg !== "all" ? arg.split(",") : []).map((s) => s.trim()).filter(Boolean);
    const targets = ids.length > 0 ? positions.filter((p) => ids.includes(p.id)) : positions;
    if (targets.length === 0) throw new Error(`岗位清单里找不到：${arg}`);

    let aborted = false;
    const FORCE = process.argv.includes("--force");
    for (const position of targets) {
      const outFile = path.join(OUT_DIR, `${position.id}.json`);
      if (!FORCE && fs.existsSync(outFile)) {
        try {
          const prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
          if ((prev.posts || []).length >= 40) {
            console.log(`[collect] ${position.id} 已有 ${prev.posts.length} 条产出，跳过（--force 可重采）`);
            continue;
          }
        } catch {}
      }
      const posts = [];
      const skipped = [];
      const termStats = [];
      console.log(`[collect] 岗位 ${position.id}（${position.title}）开始`);

      for (const term of position.keywords) {
        console.log(`[collect]   关键词「${term}」…`);
        const r = await collectTerm(page, term);
        for (const p of r.items) {
          p.positionId = position.id;
          posts.push(p);
        }
        skipped.push(...r.skipped);
        termStats.push({ term: r.term, hit: r.hit, adopted: r.adopted, captcha: r.captcha });
        console.log(`[collect]     ✓ 采纳 ${r.adopted} 条${r.captcha ? "（触发验证码）" : ""}`);
        if (r.captcha) {
          aborted = true;
          break;
        }
        await page.waitForTimeout(8000);
      }

      fs.writeFileSync(path.join(OUT_DIR, `${position.id}.md`), renderMd(position, { posts, skipped, termStats }), "utf8");
      fs.writeFileSync(
        path.join(OUT_DIR, `${position.id}.json`),
        JSON.stringify({ positionId: position.id, title: position.title, keywords: position.keywords, termStats, posts, skipped }, null, 2),
        "utf8",
      );
      console.log(`[collect] ${position.id} 落盘：采纳 ${posts.length} 条，跳过 ${skipped.length} 条${aborted ? "（部分采集）" : ""}`);
      if (!aborted) await page.waitForTimeout(15000);

      if (aborted) {
        const rest = targets.slice(targets.indexOf(position) + 1).map((p) => p.id);
        console.log(`[collect] 触发搜狗验证码（限频），中止本次采集。`);
        console.log(`[collect] 已完成岗位文件已落盘；未采集岗位：${rest.join(", ") || "无"}`);
        console.log(`[collect] 等限频解除后重新运行同一命令即可（已完成岗位会被覆盖补全）。`);
        break;
      }
    }
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error("FAILED:", error.message || error);
  process.exit(1);
});