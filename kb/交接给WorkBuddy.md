# 岗位知识库流水线 · WorkBuddy 交接文档

> 你（WorkBuddy）将接管一条已经运转的「岗位知识库构建流水线」。本文档自包含：读完即可接管，无需追问历史对话。

## 一、任务背景与总目标

用户是金融专业背景，正在做一个 JobAgent 项目（Next.js，位于本目录）。项目有个「拆解 JD」功能：用户输入岗位描述，系统要分析这个岗位到底做什么、还原完整工作流程。

分析原则（铁律，不可违背）：
1. **优先采用知识库里的真实岗位内容作为依据**——内容必须来自真实从业者分享，不脑补
2. 知识库没覆盖的，才由大模型补充，且**必须明确标注为「推测」**（对应代码中的 `supplemented` 字段）
3. 因此知识库必须：内容真实、可溯源（每条能反查原文链接）、结构化（可被检索）

为此需要把社交媒体上的岗位分享内容，通过 7 个 Agent 组成的流水线，加工成岗位知识库。

## 二、团队阵容（7 个 Agent，全部已实现为脚本）

| # | Agent | 职责 | 脚本 | 产出目录 |
|---|---|---|---|---|
| 0 | 总控 | 只调度、只检查，不产出交付物 | `kb/scripts/run.cjs`（单岗位）/ `kb/scripts/autopilot.cjs`（自驱全流程） | 仅 `kb/state/errors.jsonl` |
| 1 | 规划 | 岗位清单（含 JD 别名 + 搜索关键词） | `kb/scripts/plan.cjs` / `plan-extend.cjs` / `plan-merge.cjs` | `kb/output/01-plan/` |
| 2 | 采集 | 按关键词抓帖子（**搜狗微信** weixin.sogou.com，Playwright 浏览器） | `kb/scripts/collect.cjs` | `kb/output/02-collect/` |
| 3 | 解析 | 图文 OCR 转纯文本 | `kb/scripts/parse.cjs` | `kb/output/03-parse/` |
| 4 | 清洗 | 去广告引流、质量打分、过滤低质 | `kb/scripts/clean.cjs` | `kb/output/04-clean/` |
| 5 | 结构化 | 抽取为标准化知识点 | `kb/scripts/structure.cjs` | `kb/output/05-structure/` |
| 6 | 入库 | 关键词倒排 + 来源链落盘 | `kb/scripts/build-index.cjs` | `kb/output/06-index/` |
| 7 | 质检 | 抽样 10% 判定忠实性 | `kb/scripts/qa.cjs` | `kb/output/07-qa/` |

每个 Agent 文件夹里有 `README.md`（该 Agent 的工作说明）和 `<岗位id>.md`（交付物）+ `<岗位id>.json`（机器可读副本，双轨制）。

## 三、必须遵守的执行规则

1. **串行接力**：采集→解析→清洗→结构化→入库→质检，上一步合格才进下一步
2. **契约校验**：每步之间用 `kb/scripts/validate.cjs <stage> <positionId>` 校验，不合格退回重做，最多 2 次
3. **质检回退**：质检判「不忠实」→ 退回结构化 Agent 重做（≤2 轮）
4. **失败隔离**：单岗位失败跳过并记录，不卡死整批
5. **来源链**：原文链接 → 清洗后文本 → 结构化知识点 → 库内 ID，由入库 Agent 落盘

用户对交付物的具体要求（已固化在脚本中，勿回退）：
- 岗位清单：**不做 P0/P1/P2 优先级**；同类岗位**不按公募/私募/券商拆分**（机构差异放进别名和搜索关键词）
- 采集：每个关键词取**前 15 条**，**只抓图文，不抓视频**
- 交付粒度：**每个岗位一份 md**（不是每篇帖子一份）
- 结构化：改写为**自然严谨的书面语，不口语化，风格统一，不需要原文原句**；按五类归档：核心职责 / 工作流程 / 技能工具 / 典型的一天 / 坑与经验
- 质检：只判内容**是否有原文依据**，不判措辞是否与原文一致（因为结构化已改写）

## 四、当前进度（以实时命令为准）

**交接时快照（2026-10-18 17:20，此前数字以此为准，之后以 status.cjs 实时输出为准）**：

- 总清单 **32 个岗位**（用户亲自删减过，以 `kb/output/01-plan/plan.json` 为唯一权威）
- **已采集 9 个**：fin-bank-rm、fin-bank-teller、fin-bank-mgmt-trainee、fin-ib-ibd、fin-ib-research、fin-ib-sales-trader、fin-fund-ra、fin-fund-pm、fin-fund-ops
- **全链路完成 7 个**（上述前 7 个，质检均「忠实」）；fin-fund-pm、fin-fund-ops 已采集、下游未完，autopilot 会自动补跑
- **未采集 23 个**：保险 3（精算/理赔/代理人）+ 互金 3（风控/产品/数分）+ 互联网 6（用户运营/内容运营/产品运营/产品经理/数分/风控策略）+ PE 3 + VC 2 + 券商 3（资管/财富投顾/合规风控）+ 公募补充 3（渠道/产品/交易员）

**查看实时进度**（两种方式）：
```powershell
node kb/scripts/status.cjs        # 重新生成看板
Get-Content kb/output/00-进度看板.md   # 看板本体（32 岗位 × 6 阶段时间矩阵）
```

**接管后的第一个动作**：跑 `node kb/scripts/status.cjs` 核对实时进度，再决定是否需要启动 autopilot。

## 五、如何继续跑（核心命令）

**第一件事：检查是否已有 autopilot 在跑**（避免双开抢浏览器）：
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*autopilot*' }
```
若没有在跑，启动自驱总控（一条命令跑到 32/32 完成，无需人工接力）：
```powershell
$env:NODE_PATH = "C:\Users\Harrin\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\node\node_modules\@playwright\mcp\node_modules"
node kb/scripts/autopilot.cjs
```

autopilot 的行为（已固化）：每轮 = ①给已采够但没质检报告的岗位补跑下游 5 阶段 → ②`collect all` 采缺口（断点续采，已采够≥40条的岗位自动跳过）→ ③撞搜狗验证码自动中止落盘 → 冷却 20 分钟进下一轮 → 直到 32/32 全部有质检报告，自动刷新看板退出。Ctrl+C 随时可停，重跑自动续。

其他命令：
```powershell
node kb/scripts/run.cjs "parse,clean,structure,index,qa" <岗位id>   # 手动补跑某岗位下游
node kb/scripts/collect.cjs probe "<任意关键词>"                      # 探测搜狗是否限频
node kb/scripts/collect.cjs collect <岗位id> [--force]               # 采某岗位（--force 重采）
node kb/scripts/validate.cjs <stage> <岗位id>                        # 手动契约校验
```

## 六、环境与坑（必读）

1. **搜狗限频**：连续搜索约 3-5 个关键词后会弹验证码。脚本遇验证码自动中止并保留进度。**不要硬撞**，冷却 20 分钟再试。探测命令见上。
2. **NODE_PATH 必须设置**（Playwright 依赖路径，见上方启动命令），否则 collect 报找不到模块。
3. **`.env.local`** 含 DeepSeek API Key（清洗/结构化/质检/规划用）。文件可能是 UTF-16 编码——`kb/scripts/lib/llm.cjs` 已做 BOM 兼容读取，勿重写此逻辑。Key 为 `sk-243` 开头，已验证可用。
4. **采集浏览器 profile**：`kb/state/browser-profile`（持久化登录态），脚本自动使用，勿删除。
5. **改岗位清单**：`plan.json` 是流水线唯一权威数据源，`岗位清单.md` 是给人看的交付物。用户若手动改了 md，必须同步进 plan.json 后重启 autopilot（autopilot 启动时加载一次清单，改完必须重启进程才生效）。
6. **已完成岗位的 id 不可改**（下游成果按 id 关联，改了会孤儿化）。
7. **幂等性**：所有阶段脚本可安全重跑（重写同名文件），不会产生重复数据。
8. 后台跑长任务用 `run_in_background`；查看产出用日志文件尾部的 `[collect]` / `[clean]` 等标记。

## 七、验收标准（全部跑完后的动作）

32 个岗位全部有 `kb/output/07-qa/<id>.json` 且结论「忠实」后：
1. 刷新看板（autopilot 会自动做）
2. 向用户输出质量简报：每岗位知识点条数、清洗废弃率、质检抽样结论、来源链覆盖情况
3. 抽查 2-3 个岗位的 `05-structure/<id>.md`，确认五类归档齐全、书面语风格统一
4. 提醒用户：知识库已可用于「拆解 JD」功能（`src/lib/ai/jd.ts` 的 `supplemented` 标记机制对接知识库条目）

## 八、用户沟通偏好

- 中文沟通；作业式任务要求明确标注「问题处理方式及结果」
- 重要修改要先说明方案再动手；用户经常亲自改文件（尤其 plan 清单），动手前先核对磁盘最新状态
- 数据要核实，数字对不上要查明原因，不许含糊
