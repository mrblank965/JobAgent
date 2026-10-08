# JobAgent 五人协作使用手册（零基础版）

> 适用对象：第一次使用 VS Code、Git 和 GitHub 完成小组项目的成员。  
> 仓库：`mrblank965/JobAgent`  
> 核心原则：`main` 是可以演示的正式版本；每个人在自己的功能分支工作，完成并检查后通过 Pull Request 合并。

## 1. 先理解四个词

### 仓库（Repository）

仓库就是整个项目文件夹在 GitHub 上的版本。里面包含页面、接口、说明文档和每一次修改记录。

### 分支（Branch）

分支可以理解为从正式版本复制出来的“独立工作台”。在功能分支中修改，不会马上影响 `main`。

### 提交（Commit）

一次提交是一份带说明的修改快照，例如“完成 PDF 文件上传校验”。提交只记录你明确加入的文件。

### Pull Request（PR）

PR 是“申请把我的分支合并进 `main`”。另一名成员检查代码、运行结果和安全问题后，才点击合并。

## 2. 当前分支与五人分工

| 角色 | 建议分支 | 主要负责内容 | 主要目录 |
| --- | --- | --- | --- |
| A 队长/集成 | `feature/integration` | 公共布局、统一数据格式、模块联调、最终部署 | `src/app/layout.tsx`、`src/components/layout`、`src/types` |
| B 简历解析 | `feature/resume-parser` | 上传 PDF/DOCX、提取文本、形成简历结构 | `src/components/resume`、`src/app/api/parse-resume`、`src/lib/parsers` |
| C JD 与 AI | `feature/jd-parser` | 输入岗位描述、调用 DeepSeek、得到结构化 JD | `src/components/jd`、`src/app/api/analyze-jd`、`src/lib/ai` |
| D 匹配优化 | `feature/match-analysis` | 对比简历与 JD、生成缺口和修改建议 | `src/app/api/analyze-match`、部分 `src/components/analysis` |
| E 结果与测试 | `feature/result-page` | 匹配结果页面、异常状态、演示数据和测试 | `src/app/match`、部分 `src/components/analysis`、`src/data/demo` |

这五条分支现在都从同一个最新版 `main` 创建，因此起点完全一致。请队长把真实姓名或 GitHub 用户名填入小组分工表，不要只靠口头记忆。

## 3. 每位成员第一次开始前

### 第一步：接受仓库邀请

登录自己的 GitHub 账号，接受 JobAgent 仓库邀请。能够打开私有仓库不代表一定有写入权限；如果上传失败，请让队长检查该成员是否显示为 Collaborator。

### 第二步：把仓库下载到自己的电脑

在 VS Code 中打开命令面板，选择 **Git: Clone**，粘贴仓库地址：

```text
https://github.com/mrblank965/JobAgent.git
```

选择电脑上的保存位置，下载完成后打开 `JobAgent` 文件夹。

也可以在终端执行：

```bash
git clone https://github.com/mrblank965/JobAgent.git
cd JobAgent
```

### 第三步：安装项目工具

在 VS Code 终端执行：

```bash
npm install
```

这个命令会按照 `package.json` 和 `package-lock.json` 安装项目所需工具。生成的 `node_modules` 不需要上传。

### 第四步：准备本机密钥

复制 `.env.example`，把副本命名为 `.env.local`，再填写自己的 DeepSeek Key：

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=填写自己的真实密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.env.local` 已被 `.gitignore` 排除，不能截图公开，也不能复制进代码或群文件。

### 第五步：切换到自己的功能分支

先下载远程最新分支：

```bash
git fetch origin
```

再根据自己的角色选择一条命令：

```bash
git switch feature/integration
git switch feature/resume-parser
git switch feature/jd-parser
git switch feature/match-analysis
git switch feature/result-page
```

五条命令只执行属于自己的那一条。执行 `git branch --show-current` 可以检查当前分支；输出不应该是 `main`。

## 4. 每天开始开发的固定动作

先保存自己的未完成内容，然后在项目目录运行：

```bash
git switch main
git pull origin main
git switch 自己的分支名
git merge main
npm install
npm run dev
```

含义是：先取得最新正式版本，再把它合入自己的工作分支，最后启动网站。浏览器打开 <http://localhost:3000>。

如果 `git merge main` 出现冲突，不要随便删除别人代码；把冲突文件和提示截图发到小组群，由涉及该文件的两位成员共同处理。

## 5. 开发过程中应该改什么

成员优先修改分工表中属于自己的目录。以下文件会影响多人，修改前必须在群里说明：

- `src/types/analysis.ts`：所有模块共同使用的数据格式。
- `src/app/layout.tsx`：整个网站的公共布局。
- `src/components/layout/Sidebar.tsx`：左侧导航栏。
- `package.json` 和 `package-lock.json`：项目依赖版本。
- `.env.example`：全员环境变量模板。

图片放进 `public/images` 后不会自动显示。还需要在页面或组件代码中引用，例如 `/images/logo.png`，并随分支一起提交。

## 6. 完成一个小功能后怎么上传

### 第一步：自己检查

```bash
npm run lint
npm run build
```

还要亲自在网页中操作一次。不能把“AI 工具说完成了”当成验收结果。

### 第二步：确认上传内容

```bash
git status
git diff
```

重点检查没有出现：

- `.env.local` 或任何 API Key；
- 真实姓名、手机号、邮箱和未匿名化简历；
- `node_modules`、`.next`；
- 与当前任务无关的大量文件。

### 第三步：提交

```bash
git add 需要提交的文件
git commit -m "完成简历 PDF 文本提取"
```

不要习惯性把所有文件一起加入。提交说明应写清“完成了什么”，不要只写“更新”“修改”或“test”。

### 第四步：上传自己的分支

以简历解析成员为例：

```bash
git push origin feature/resume-parser
```

其他成员把最后的分支名替换成自己的分支。

## 7. 如何把功能申请合并进 main

1. 打开 GitHub 仓库。
2. 进入 **Pull requests**，点击 **New pull request**。
3. `base` 选择 `main`。
4. `compare` 选择自己的功能分支。
5. 标题写清功能，例如“完成 PDF/DOCX 简历解析”。
6. 说明中填写完成内容、测试步骤、页面截图、尚未完成的问题。
7. 指定至少一位不是开发者本人的成员检查。
8. 检查者在自己的电脑运行该分支，确认 `lint`、`build` 和页面操作都通过。
9. 队长或检查者再点击 **Merge pull request**。

只有完成第 9 步，功能才真正进入 `main`，成为全组下一次下载时的正式版本。分支里的代码不会因为“已经上传 GitHub”就自动出现在 `main`。

## 8. 合并后的处理

功能进入 `main` 后，原开发者执行：

```bash
git switch main
git pull origin main
git switch 自己的分支名
git merge main
```

如果这条功能分支已经彻底完成，可以在 GitHub 删除它；下一个任务再从最新 `main` 创建新的分支。长期保留五条模块分支也可以，但每次继续开发前必须先同步 `main`。

## 9. 队长的职责

队长不是替所有人写代码，而是维护共同规则：

- 确认每个任务只有一名主要负责人；
- 管理 `src/types/analysis.ts` 的统一数据格式；
- 检查 PR 是否通过测试、有无密钥和真实简历；
- 控制进入 `main` 的顺序，避免同时修改公共文件；
- 每周至少做一次完整流程演示；
- 中期汇报前冻结新功能，只修复影响演示的问题；
- 最终部署使用的环境变量只配置在部署平台，不提交 GitHub。

## 10. 推荐合并顺序

为了减少接口摩擦，建议按以下顺序集成：

1. 队长先确认 `ResumeData`、`JDData`、`MatchResult`。
2. B 完成简历解析并合并。
3. C 完成 JD 与 DeepSeek 调用并合并。
4. D 基于前两种数据完成匹配分析并合并。
5. E 接入真实结果，完善加载、失败和空状态。
6. A 完整联调并部署演示版本。

页面样式可以并行做，但真实数据联调最好按上述依赖顺序进行。

## 11. 常见问题

### 为什么我的修改在 GitHub 上有，但网站正式版本没有？

先检查 GitHub 页面左上角当前查看的分支。上传到功能分支只表示代码已备份；只有 PR 合并后，`main` 才会变化。

### 为什么 `git push` 被拒绝？

常见原因是没有接受邀请、没有写入权限、当前分支不对、远程已有更新，或网络无法连接 GitHub。先执行 `git status` 和 `git branch --show-current`，把完整错误发给队长，不要使用强制推送。

### 可以直接在 main 改一个小地方吗？

不建议。再小的修改也可能破坏演示版本。文档、样式和代码都走功能分支与 PR，团队才知道是谁、为什么、何时改了什么。

### AI 可以直接替我提交吗？

可以让 Claude Code 或 Codex协助编写、检查和提交，但负责人必须能说明改了哪些文件、为什么这样写，并亲自验证页面。真实 API Key 不能发送到聊天或写进仓库。

## 12. 每次 PR 的最低验收清单

- [ ] 当前分支不是 `main`。
- [ ] 功能能在浏览器中实际操作。
- [ ] `npm run lint` 通过。
- [ ] `npm run build` 通过。
- [ ] 没有 API Key、真实简历或个人隐私。
- [ ] 没有意外修改其他成员模块。
- [ ] PR 写明完成内容、测试方法和剩余问题。
- [ ] 至少一位其他成员完成检查。
