# JobAgent AI 求职工作台

JobAgent 是面向课程协作的 Next.js 求职辅助网站，覆盖简历解析、岗位拆解、方向分析、匹配展示、简历定制、投递管理和面试练习。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 <http://localhost:3000>。生产检查使用：

```bash
npm run lint
npm run build -- --webpack
```

## 当前功能

- PDF、DOCX、纯文本和图片 OCR 简历解析
- 简历教育、经历、项目、技能和优势的结构化编辑
- JD 粘贴、公开网页读取、截图 OCR 和本地规则拆解
- 岗位方向适配、关键词命中与能力缺口分析
- 按目标 JD 定制简历
- 投递看板与面试练习
- 无 Key 的 Prompt 复制模式，以及只保存在页面内存中的 API 直连配置

当前数据保存在浏览器页面内存中，刷新后清空；项目不包含账号和数据库。

## 分支流程

| 分支 | 负责内容 |
| --- | --- |
| `feature/integration` | 公共底座、完整联调和最终验收 |
| `feature/resume-parser` | 简历上传、OCR、解析与编辑 |
| `feature/jd-parser` | JD 获取、拆解与岗位信息分析 |
| `feature/match-analysis` | 方向匹配与简历定制逻辑 |
| `feature/result-page` | 结果展示、投递看板和面试页面 |
| `main` | 经过验收的稳定版本 |

功能分支先向 `feature/integration` 发起 Pull Request；完整版本通过 lint、生产构建和页面验收后，再由 `feature/integration` 向 `main` 发起 Pull Request。不要直接在 `main` 开发。

## 安全要求

- 不提交 `.env.local`、API Key、Token 或密码。
- 不提交真实简历、手机号、邮箱或其他个人隐私。
- 不提交 `node_modules`、`.next` 或其他构建产物。
- 页面中的 API Key 仅保存在当前内存状态，不写入仓库或本地存储。

协作规则见 [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md)，目录说明见 [`docs/REPOSITORY_MAP.md`](docs/REPOSITORY_MAP.md)。
