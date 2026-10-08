# JobAgent 仓库地图（带中文说明）

这份文件是给第一次参加项目协作的成员看的。它说明每个目录由谁负责、文件承担什么责任，以及修改后网站会产生什么效果。

符号说明：

- `[页面]`：浏览器能够直接访问和看到。
- `[组件]`：页面中的一块可重复界面。
- `[接口]`：页面看不到，用于接收请求、解析数据或调用 AI。
- `[工具]`：被接口调用的底层能力。
- `[配置]`：控制项目如何运行、检查和构建。
- `[文档]`：给组员阅读，不会改变网页。

```text
jobagent-web/                                  # 整个网站仓库的根目录
│
├── public/                                   # [公开资源] 浏览器可以直接访问的图片、图标等
│   ├── images/
│   │   └── README.md                         # 说明图片应该放在哪里、怎样在页面中引用
│   └── *.svg                                 # Next.js 初始图标，确定不用后可以删除
│
├── src/                                      # [源代码] source 的缩写，网站主要代码都放在这里
│   │
│   ├── app/                                  # [页面与接口] Next.js 根据这里的文件夹生成网址
│   │   ├── layout.tsx                        # [公共布局] 包裹所有页面，当前负责显示左侧导航栏
│   │   ├── globals.css                       # [全局样式] 控制整个网站的基础字体、背景和通用样式
│   │   ├── page.tsx                          # [页面] 首页，对应网址 /
│   │   ├── favicon.ico                       # 浏览器标签页上显示的小图标
│   │   │
│   │   ├── resume/
│   │   │   └── page.tsx                      # [页面] 简历解析页，对应网址 /resume
│   │   ├── match/
│   │   │   └── page.tsx                      # [页面] 岗位匹配页，对应网址 /match
│   │   ├── optimize/
│   │   │   └── page.tsx                      # [页面] 简历优化页，对应网址 /optimize
│   │   ├── interview/
│   │   │   └── page.tsx                      # [页面] 模拟面试页，目前只是最终版占位页
│   │   │
│   │   └── api/                              # [服务端接口] 密钥和 AI 请求只能在服务端处理
│   │       ├── parse-resume/
│   │       │   └── route.ts                  # [接口/B] 接收 PDF/DOCX，调用解析器，返回 ResumeData
│   │       ├── analyze-jd/
│   │       │   └── route.ts                  # [接口/C] 接收 JD，调用 AI，返回 JDData
│   │       └── analyze-match/
│   │           └── route.ts                  # [接口/D] 比较简历和 JD，返回 MatchResult
│   │
│   ├── components/                           # [组件] 可以被多个页面重复使用的界面小模块
│   │   ├── layout/
│   │   │   └── Sidebar.tsx                   # [组件/A] 左侧导航，新增栏目时修改这里
│   │   ├── resume/
│   │   │   └── ResumeUpload.tsx              # [组件/B] 简历上传框和文件选择状态
│   │   ├── jd/
│   │   │   └── JDInput.tsx                   # [组件/C] JD 输入框、字数和分析按钮
│   │   └── analysis/
│   │       ├── MatchScore.tsx                # [组件/E] 显示匹配分数和进度条
│   │       ├── KeywordList.tsx               # [组件/E] 显示匹配、部分匹配和缺失关键词
│   │       └── SuggestionList.tsx            # [组件/E] 显示逐条简历修改建议
│   │
│   ├── lib/                                  # [底层工具] 页面不直接展示，供接口调用
│   │   ├── parsers/
│   │   │   ├── pdf.ts                        # [工具/B] 提取 PDF 简历文字，目前待实现
│   │   │   └── docx.ts                       # [工具/B] 提取 DOCX 简历文字，目前待实现
│   │   ├── ai/
│   │   │   ├── provider.ts                   # [工具/C] 统一 AI 接口，将来换模型时减少改动
│   │   │   ├── deepseek.ts                   # [工具/C] 从服务端调用 DeepSeek，目前待实现请求
│   │   │   └── prompts.ts                    # [工具/C/D] 集中保存 JD 分析和匹配提示词
│   │   └── schemas/
│   │       └── analysis.ts                   # [校验/A+C+D] 检查 AI 返回的数据格式是否正确
│   │
│   ├── types/
│   │   └── analysis.ts                       # [接口约定/全员] ResumeData、JDData、MatchResult 定义
│   │
│   └── data/
│       └── demo/
│           └── analysis.json                 # [演示数据/E] 真接口完成前用于页面开发和汇报演示
│
├── docs/                                     # [文档] 不参与网页运行
│   ├── TEAM_WORKFLOW.md                      # 五人分工、分支和合并验收规则
│   └── REPOSITORY_MAP.md                     # 当前这份仓库中文地图
│
├── .env.example                              # [配置模板] 告诉成员需要哪些 AI 环境变量，不放真 Key
├── .env.local                                # [本机秘密] 每人自己创建，包含真 Key，禁止上传
├── .gitignore                                # [上传过滤规则] 告诉 Git 哪些文件永远不要进入仓库
├── package.json                              # [项目说明书] 依赖工具清单和 npm run dev 等命令
├── package-lock.json                         # [版本锁] 保证五个人安装到尽量相同的工具版本
├── next.config.ts                            # [配置] Next.js 自身设置
├── tsconfig.json                             # [配置] TypeScript 检查规则和 @/ 路径别名
├── postcss.config.mjs                        # [配置] Tailwind/CSS 的处理方式
├── eslint.config.mjs                         # [配置] 代码质量检查规则
├── AGENTS.md                                 # [AI 说明] Codex 等工具编写代码时要遵守的版本规则
├── CLAUDE.md                                 # [AI 说明] Claude Code 读取 AGENTS.md
└── README.md                                 # [项目首页] GitHub 仓库首先展示的运行与协作说明
```

## 一次真实请求会经过哪些文件

```text
ResumeUpload.tsx
  → /api/parse-resume/route.ts
  → pdf.ts 或 docx.ts
  → ResumeData

JDInput.tsx
  → /api/analyze-jd/route.ts
  → deepseek.ts + prompts.ts
  → schemas/analysis.ts 校验
  → JDData

ResumeData + JDData
  → /api/analyze-match/route.ts
  → DeepSeek 或本地匹配规则
  → MatchResult
  → MatchScore + KeywordList + SuggestionList
```

## 目前哪些是真的，哪些还是骨架

已经可以使用：

- 左侧导航和五个页面可以打开。
- 简历文件可以在浏览器中选择并显示文件名。
- JD 可以输入并统计字数。
- 匹配结果组件可以用模拟数据展示。
- 三个 API 会校验最基本的输入，并明确返回“尚未接入”。

还没有完成：

- PDF/DOCX 正文提取。
- DeepSeek 网络请求。
- AI JSON 自动重试和完整 Schema 校验。
- 上传、分析、匹配、结果展示之间的真实连接。
- 用户数据存储、限流和部署环境变量。

任何成员完成一个模块后，都必须删除对应的“尚未实现”占位错误，补充测试，再通过 Pull Request 合并进 `main`。
