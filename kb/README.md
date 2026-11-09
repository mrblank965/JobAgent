# 岗位知识库构建工作区（kb/）

> **目标**：支撑 JobAgent 的「拆解 JD」功能——用户输入一句岗位描述，系统判断岗位到底做什么、还原完整工作流程。
> **原则**：拆解时优先采用知识库里的**真实岗位内容**作为依据；知识库未覆盖的地方，再由大模型用自身知识补充，并**明确标注为「推测」**。
> **因此知识库必须满足**：内容真实（不脑补）、可溯源（每条能反查原文）、结构化（可被检索）。

原料来源：小红书上求职者 / 从业者分享的岗位真实工作内容（如"银行客户经理的一天""券商行研实习做什么""产品经理日常"）。

---

## 1. 流水线：7 个 Agent 串行接力

| # | 阶段 | Agent | 职责（只做一件事） | 输入 | 输出 | 工具依赖 |
|---|---|---|---|---|---|---|
| 1 | `plan` | 规划 Agent | 确定覆盖哪些岗位 + 生成检索词 | 用户背景与覆盖范围 | 岗位清单（含优先级）+ 每个岗位的检索词 | 纯 LLM |
| 2 | `collect` | 采集 Agent | 按检索词抓取小红书帖子 | 检索词 | 原始帖子（正文+图片+视频+链接+作者+时间） | **爬虫 / 浏览器** |
| 3 | `parse` | 解析 Agent | 把帖子的图文/视频转成纯文本 | 原始帖子 | 纯文本 | **OCR / 转写 + 多模态兜底** |
| 4 | `clean` | 清洗 Agent | 去广告引流、质量打分、过滤低质 | 纯文本 | `{保留, 质量, 理由, 清洗后文本}` | 纯 LLM |
| 5 | `structure` | 结构化 Agent | 抽取标准化岗位知识点并打标签 | 清洗后文本 | `{岗位名称, 行业, 核心职责[], 工作流程[], 技能工具[], 典型的一天, 坑与经验[]}` | 纯 LLM |
| 6 | `index` | 入库 Agent | 向量化、入库、建立来源映射 | 结构化知识点 | 入库状态 + 知识点唯一 ID + 来源映射记录 | **embedding + 向量库** |
| 7 | `qa` | 质检 Agent | 抽查知识点是否忠实原文 | `{原文, 结构化结果}` | `{是否忠实, 问题列表[]}` | 纯 LLM |

> 质检 Agent 跑在结构化之后；入库与质检可并行，但质检判定"不忠实"时必须把该条退回**结构化 Agent** 重做。

---

## 2. 总控调度规则（本工作区的运行契约）

1. **串行调度**：按 `plan → collect → parse → clean → structure → index` 顺序推进，一个 Agent 产出**合格结果**后才把数据交给下一个。
2. **格式校验**：每一步之间按 `contracts/handoff-contracts.json` 校验输出结构，**格式不对退回重做，最多重试 2 次**；仍不合格则按第 5 条处理。
3. **来源链**：全程记录 `原文链接 → 清洗后文本 → 结构化知识点 → 向量库 ID`，落在 `state/source-chain.jsonl`。
4. **质检回退**：质检 Agent 判定"不忠实"时，把该条退回**结构化 Agent** 重做（同样最多重试 2 次）。
5. **失败隔离**：单条失败不卡死整批——**跳过并记录**到 `state/errors.jsonl`，其余继续。
6. **抽样质检**：每批入库后随机抽 **10%** 交给质检 Agent。

---

## 3. 目录结构

```text
kb/
├── README.md                     本文件：流水线说明 + 调度规则
├── pipeline.config.json          流水线配置（覆盖范围、参数、岗位清单）
├── contracts/
│   └── handoff-contracts.json    7 个 Agent 的交接契约（输入/输出 Schema）
├── state/
│   ├── manifest.json             批次与阶段状态、计数器
│   ├── source-chain.jsonl        来源链（每行一条）
│   └── errors.jsonl              失败与跳过记录（每行一条）
├── artifacts/                    各阶段产出，按阶段分目录
│   ├── stage1_plan/              规划 Agent 产出
│   ├── stage2_raw/               采集 Agent 产出（原始帖子）
│   ├── stage3_parsed/            解析 Agent 产出（纯文本）
│   ├── stage4_cleaned/           清洗 Agent 产出
│   ├── stage5_structured/        结构化 Agent 产出
│   ├── stage6_indexed/           入库 Agent 产出
│   └── stage7_qa/                质检 Agent 产出
└── store/
    ├── knowledge-base.json       最终知识库（可被拆解 JD 检索）
    └── index.json                检索索引（向量/关键词）
```

---

## 4. 来源链格式（`state/source-chain.jsonl`）

每行一条 JSON，字段固定：

```json
{
  "kpId": "kp-fin-bank-rm-0001",
  "positionId": "fin-bank-rm",
  "sourceUrl": "https://www.xiaohongshu.com/explore/xxxx",
  "author": "作者昵称",
  "postedAt": "2026-08-12",
  "rawArtifact": "stage2_raw/xxxx.json",
  "parsedArtifact": "stage3_parsed/xxxx.json",
  "cleanedArtifact": "stage4_cleaned/xxxx.json",
  "structuredArtifact": "stage5_structured/xxxx.json",
  "vectorId": "vec-0001",
  "qaStatus": "pass | fail | skipped",
  "createdAt": "2026-10-15"
}
```

---

## 5. 与「拆解 JD」的对接

- 拆解 JD 时，先用岗位名 / 行业 / 方向 / 关键词在 `store/index.json` 里召回知识库条目。
- **召回命中**：职责、工作流程、工具等字段以知识库内容为准（对应 `src/lib/ai/jd.ts` 里 `supplemented = false`）。
- **未命中**：由大模型补充，并置 `supplemented = true`，界面灰显为"按岗位常识补充（推测）"。
