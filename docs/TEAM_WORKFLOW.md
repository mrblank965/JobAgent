# 五人协作流程

## 开始开发前

1. 从仓库下载最新代码。
2. 确认当前任务和自己的分支名称。
3. 不在 `main` 分支直接开发。
4. 不修改不属于自己任务的文件，确需修改时先在群里说明。

## 完成一个小功能后

1. 在自己的电脑上运行网页并检查功能。
2. 查看本次修改文件，确认没有密钥、真实简历或无关文件。
3. 使用清楚的中文提交信息，例如“新增简历上传组件”。
4. 推送自己的分支，在 GitHub 创建 Pull Request。
5. 至少由另一位成员运行检查后，才合并到 `main`。

## 合并验收

- `npm run lint` 通过。
- `npm run build` 通过。
- 首页可以打开，原有主流程没有损坏。
- 没有上传 `.env.local`、真实简历或 API Key。
- Pull Request 说明包含：完成内容、测试方法和页面截图。

## 统一数据格式

数据类型集中放在 `src/types/analysis.ts`。各模块先遵守这一约定，后续如需修改，由涉及成员共同确认后再合并。

## 五人模块分工

| 成员 | 分支 | 主要目录 | 验收结果 |
| --- | --- | --- | --- |
| A 队长/集成 | `feature/integration` | `layout.tsx`、`components/layout`、`types`、部署配置 | 主分支始终能运行，各模块能组合 |
| B 简历解析 | `feature/resume-parser` | `components/resume`、`api/parse-resume`、`lib/parsers` | PDF/DOCX 能提取文字并形成 ResumeData |
| C JD 与 AI | `feature/jd-parser` | `components/jd`、`api/analyze-jd`、`lib/ai` | JD 能通过模型生成并校验 JDData |
| D 匹配优化 | `feature/match-analysis` | `api/analyze-match`、部分 `components/analysis` | 生成 MatchResult，不编造经历 |
| E 结果与测试 | `feature/result-page` | `app/match`、部分 `components/analysis`、`data/demo` | 结果页、异常状态、演示数据和测试通过 |

每个人可以修改自己模块需要的多个文件，但如果要修改 `src/types/analysis.ts` 或公共布局，必须先在群里说明，因为这些文件会同时影响其他成员。
