# JobAgent 仓库地图

本文件描述 GitHub 仓库内部结构。开发者在本机使用多个 Git worktree 时，外层工作区文件夹不会上传到 GitHub，也不属于下面的项目结构。

```text
jobagent-web/
├── public/
│   └── images/
│       └── greet-banner.jpg             # 首页横幅
├── src/
│   ├── app/
│   │   ├── page.tsx                     # 工作台首页 /
│   │   ├── layout.tsx                   # 全局布局、导航和状态 Provider
│   │   ├── globals.css                  # 设计变量和公共基础样式
│   │   ├── resume/page.tsx              # 简历解析 /resume
│   │   ├── analysis/page.tsx            # 岗位方向分析 /analysis
│   │   ├── jd/page.tsx                  # JD 拆解 /jd
│   │   ├── match/page.tsx               # 匹配结果 /match
│   │   ├── optimize/page.tsx            # 简历定制 /optimize
│   │   ├── board/page.tsx               # 投递看板 /board
│   │   ├── interview/page.tsx           # 面试练习 /interview
│   │   └── api/
│   │       ├── parse-resume/route.ts     # PDF/DOCX 简历解析接口
│   │       ├── ocr/route.ts              # 图片 OCR 接口
│   │       ├── fetch-jd/route.ts         # 公开网页 JD 读取接口
│   │       ├── analyze-jd/route.ts       # JD AI 接口预留
│   │       └── analyze-match/route.ts    # 匹配 AI 接口预留
│   ├── components/
│   │   ├── home/                         # 首页设置组件
│   │   ├── layout/                       # 导航与公共布局组件
│   │   ├── resume/                       # 简历上传、解析、编辑组件
│   │   ├── jd/                           # JD 输入组件
│   │   └── analysis/                     # 分数、关键词和建议组件
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── resume.ts                 # 简历 AI 双模式与结果规范化
│   │   │   ├── provider.ts               # AI Provider 接口
│   │   │   ├── deepseek.ts               # DeepSeek 服务端实现预留
│   │   │   └── prompts.ts                # JD 与匹配 Prompt
│   │   ├── parsers/                       # PDF、DOCX 和简历文本解析
│   │   ├── schemas/analysis.ts            # 共享数据结构校验
│   │   ├── store.tsx                      # 页面内存状态
│   │   ├── ocr.ts                         # Tesseract OCR
│   │   ├── jd.ts                          # JD 拆解和技能匹配规则
│   │   ├── career.ts                      # 岗位方向规则
│   │   └── strengths.ts                   # 简历优势建议
│   ├── styles/
│   │   ├── dashboard.css                  # 首页与统计展示样式
│   │   ├── results.css                    # 面试、看板和结果样式
│   │   └── resume.css                     # 简历编辑样式
│   └── types/analysis.ts                  # 全员共享的数据契约
├── docs/                                  # 协作手册和仓库说明
├── package.json                           # 依赖和运行脚本
├── next.config.ts                         # Next.js 与 OCR 构建配置
└── .gitignore                             # 本地秘密和构建产物排除规则
```

## 主要数据流

```text
简历文件、文本或图片
  → /api/parse-resume 或 /api/ocr
  → lib/parsers + lib/ai/resume
  → ResumeData
  → 页面内存 Store

JD 文本、网页或截图
  → /api/fetch-jd 或 /api/ocr
  → lib/jd
  → JD 关键词、职责、要求和匹配信息

ResumeData + JD
  → 岗位方向分析、匹配结果、简历定制
  → 投递看板和面试练习
```

## 共享修改热点

以下文件会影响多个模块，修改前应由集成人员协调：

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/layout/`
- `src/lib/store.tsx`
- `src/types/analysis.ts`
- `package.json`、`package-lock.json`、`next.config.ts`

功能成员优先修改自己的页面、组件和工具目录，完成后向 `feature/integration` 发起 PR。
