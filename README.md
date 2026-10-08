# JobAgent AI 求职智能助手

JobAgent 是五人课程小组共同开发的 AI 求职辅助网站。中期版本聚焦一条核心流程：上传简历、粘贴 JD、分析匹配情况、给出有依据的修改建议。

## 第一次运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在浏览器打开 <http://localhost:3000>。

## 中期版本范围

- PDF/DOCX 简历上传和文本提取
- JD 结构化解析
- 简历与 JD 匹配分析
- 已匹配、部分匹配、缺失项和修改建议展示
- DeepSeek API 仅由服务端调用

暂不包含 OCR、招聘网站抓取、自动投递、用户登录和复杂数据库。

## 分支建议

| 分支 | 负责内容 |
| --- | --- |
| `feature/resume-parser` | 简历上传和 PDF/DOCX 解析 |
| `feature/jd-parser` | JD 结构化解析 |
| `feature/match-analysis` | 匹配分析和建议生成 |
| `feature/result-page` | 结果页和交互展示 |
| `main` | 始终保持可运行的团队正式版本 |

每位成员从最新的 `main` 创建自己的功能分支。完成后先运行检查，再推送分支并发起 Pull Request；不要直接向 `main` 上传未检查的代码。

## 安全要求

- DeepSeek API Key 只写入本机 `.env.local`。
- 不上传真实用户简历和个人信息。
- `.env.local`、`node_modules` 和构建文件已经被 `.gitignore` 排除。
- 仓库中的演示简历必须匿名化。

更完整的协作方法见 [`docs/TEAM_WORKFLOW.md`](docs/TEAM_WORKFLOW.md)。

仓库中每个文件夹和文件的中文说明见 [`docs/REPOSITORY_MAP.md`](docs/REPOSITORY_MAP.md)。
