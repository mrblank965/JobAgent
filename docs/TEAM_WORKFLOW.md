# 五人协作流程

## 分支与职责

| 角色 | 分支 | 主要职责 |
| --- | --- | --- |
| A 队长/集成 | `feature/integration` | 公共布局、共享状态、数据契约、联调和验收 |
| B 简历解析 | `feature/resume-parser` | 简历上传、OCR、解析、结构化编辑 |
| C JD 解析 | `feature/jd-parser` | JD 获取、拆解和岗位信息分析 |
| D 匹配分析 | `feature/match-analysis` | 岗位方向、匹配和简历定制逻辑 |
| E 结果展示 | `feature/result-page` | 匹配结果、投递看板、面试页面和交互测试 |

## 开始开发前

1. 确认自己当前所在分支。
2. 保证工作区没有来源不明的修改。
3. 先同步公共底座，再开始本模块开发。
4. 不直接在 `main` 开发或推送。
5. 修改共享文件前先与集成人员确认。

本机可以用一个目录切换分支，也可以为各分支建立 Git worktree。worktree 外层目录仅存在于本机，不会上传到 GitHub。

## Pull Request 顺序

```text
feature/resume-parser ─┐
feature/jd-parser ─────┤
feature/match-analysis ├─→ feature/integration ─→ main
feature/result-page ───┘
```

功能分支的 PR 目标必须是 `feature/integration`。集成分支完成全站检查后，再向 `main` 创建最终 PR；未经负责人验收，不合并最终 PR。

## 每次提交前检查

1. 查看改动文件，确认都属于本次职责。
2. 确认没有 `.env.local`、API Key、Token、真实简历和个人隐私。
3. 确认没有 `node_modules`、`.next` 或临时文件。
4. 运行 `npm run lint`。
5. 运行 `npm run build -- --webpack`。
6. 在 PR 中写明完成内容、测试方式、影响页面和已知限制。

## 共享文件

下列文件是冲突热点，由集成人员协调：

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/styles/`
- `src/components/layout/`
- `src/lib/store.tsx`
- `src/types/analysis.ts`
- `src/lib/schemas/analysis.ts`
- `package.json`、`package-lock.json`、`next.config.ts`

如功能确实需要修改共享文件，应在 PR 说明中单独列出原因。

## 合并验收

- lint 和生产构建通过。
- 首页、导航和全部功能页面可以打开。
- 简历、JD、匹配、定制、看板和面试流程能够组合。
- 没有秘密、真实个人数据或构建产物。
- 功能 PR 已合并到 `feature/integration`。
- 最终 PR 由负责人确认后才合并到 `main`。
