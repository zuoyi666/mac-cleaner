# Mac Cleaner

中文 | [English](README.en-US.md)

Mac Cleaner 是一款免费、开源、本地运行的 macOS 存储空间清理助手，使用 Electron、React 和 TypeScript 构建。它会建立启动磁盘用户态目录的空间占用地图，用普通人能看懂的话解释大项是什么；只有明确安全或需确认的清理候选，才会在你二次确认后移到废纸篓。

## 安装为中文界面

任何 GitHub 用户都可以在本机构建并安装一个带 Mac Cleaner 图标、可双击启动的本地 App。不需要我们的 Apple Developer 账号，也不需要你自己有 Apple Developer 账号。

```bash
git clone https://github.com/zuoyi666/mac-cleaner.git
cd mac-cleaner
npm ci
npm run install:local:zh
```

默认会安装到桌面：

```bash
~/Desktop/Mac Cleaner.app
```

这条命令会把这台 Mac 上的默认界面语言设置为中文。语言偏好只保存在本机：

```bash
~/Library/Application Support/Mac Cleaner/settings.json
```

首次安装时，终端会允许你输入其它安装目录；直接回车会使用桌面。也可以显式指定目录：

```bash
npm run install:local:zh -- --install-dir "$HOME/Tools"
```

安装后你仍然可以在 App 左侧的“本地设置”里切换到英文。这个安装包是从源码在本机构建的 unsigned App，第一次打开时 macOS 可能会显示未签名提示。

## 安全边界

- 不自动删除。
- 不永久删除。
- 不申请管理员权限。
- 不做遥测、云同步、账号系统或后台自动清理。
- 清理动作只接受扫描器生成的候选 ID，renderer 不能传任意路径。
- 清理确认会绑定扫描 ID 和路径快照，避免预览后路径变化还继续清理。
- 确认清理后只通过 Electron `shell.trashItem` 移到 macOS 废纸篓，并验证原路径已经移走。
- 无权限目录、符号链接、越界路径会被跳过或阻断。
- 废纸篓变化只做估算展示；macOS 可能会重命名废纸篓里的同名项目。

## 当前扫描范围

当前版本把扫描结果拆成两层：

- `安心清理`：只展示明确安全或需确认的候选项，才有清理按钮。
- `空间地图`：展示启动磁盘用户态目录中的大体积目录和文件，只解释和定位，不提供自动清理。

空间地图默认扫描这些可访问区域：

- 当前用户目录 `~`
- `/Users/Shared`
- `/Applications`
- `/Library`
- `/private/var/folders`

系统保护核心路径、外接卷、符号链接和无法确认安全性的内容会被跳过或只做说明。Full Disk Access 是可选授权：开启后能看清更多目录，但不会让工具自动删除这些目录。

安心清理候选来自这些固定安全目录和规则：

- `~/Library/Caches`
- `~/Library/Logs`
- `~/Library/Logs/DiagnosticReports`
- `~/Library/Logs/CrashReporter`
- `~/Library/HTTPStorages`（需要确认，因为可能包含 cookie、会话或网站数据）
- `~/Library/Saved Application State`
- `~/Library/Developer/Xcode/DerivedData`
- `~/Library/Caches/Homebrew`、`~/Library/Caches/pip`、`~/.npm`、`~/.cache/yarn` 等开发缓存
- `~/Downloads` 里的旧安装包和压缩包
- `~/.Trash` 只统计体积；App 不会清空废纸篓

每个清理项都会标记为：

- `安全可清理`：低风险缓存、日志或诊断数据
- `需确认`：用户可能还会用到的下载内容或生成数据
- `不建议清理`：受阻、无权限、不支持或风险不清楚的数据

同类小文件会默认聚合，避免扫描结果里出现一大堆体积很小、很难逐个判断的文件。大体积安全缓存、开发缓存和旧安装包会保持优先展示；照片、邮件、消息、项目目录、Docker 镜像、Xcode Archives、应用本体和普通大文件只会出现在空间地图中。

## 语言

界面支持中文和英文。不同安装命令会设置这台 Mac 上的默认界面语言：

```bash
npm run install:local:zh
npm run install:local:en
```

App 内的语言切换按钮仍然保留在“本地设置”里。语言偏好只保存在本机，不会上传。

## 皮肤主题

界面支持 4 款本地皮肤主题：

- `黑客终端`：深色黑客风，适合夜间和高对比操作。
- `极光浅色`：浅色科技风，适合跟随 macOS 浅色模式。
- `霓虹夜城`：霓虹赛博风，和黑客终端形成更明显区分。
- `日光极简`：暖色浅色极简风格。

首次启动默认 `极光浅色`。你可以在左侧“本地设置”里切换皮肤；主题偏好只保存在本机，不影响扫描、清理确认或本地同步更新。

## 开发

要求：

- macOS
- Node.js 22+
- npm

安装依赖：

```bash
npm ci
```

运行桌面 App：

```bash
npm run dev
```

安装一个默认中文界面的本地双击 App：

```bash
npm run install:local:zh
```

运行检查：

```bash
npm run icon:build
npm run typecheck
npm test
npm run build
npm run smoke:electron
npm audit
```

创建 unsigned 本地开发 App bundle：

```bash
npm run package:dir
```

这会生成一个带 Mac Cleaner 图标、可双击打开的 `.app`，但它会保持 unsigned，本地开发使用。

维护者本机源码同步更新：

- App 会在启动时和“本地设置”中检查当前 GitHub 分支。
- 有更新时，“同步并安装”会执行 `git pull --ff-only`、`npm ci`、`npm run package:dir`，安装到 `~/Desktop/Mac Cleaner.app` 并重启 App。
- 如果 tracked 文件有未提交改动，或分支与 upstream 分叉，更新会被阻断。

创建 unsigned macOS 发布产物：

```bash
npm run dist:mac
```

维护者专用 signed/notarized macOS 发布产物：

```bash
npm run release:mac:preflight
npm run dist:mac:signed
```

签名使用维护者本机 Keychain 里的 `Developer ID Application` 证书和 Apple notarization 凭据。证书、API key 和密码不会放进 public repo 或 GitHub Actions。完整流程见 [docs/release-macos.md](docs/release-macos.md)。

## 当前版本

`v0.8.1` 修复本地同步更新卡片的进度文案排版：检查完成后的蓝色进度提示会自动换行完整显示，不再被省略号截断。清理按钮仍只出现在固定安全 catalog 中。GitHub CI 会运行 typecheck、tests、production build、Electron smoke test、audit 和 unsigned Electron packaging dry-run。

## 维护者推送辅助

验证后推送普通改动：

```bash
npm run changes:push -- --message "feat: describe change"
```

按 SemVer 升级版本、验证、提交并推送当前 PR 分支：

```bash
npm run version:push -- --level patch --message "chore: release patch"
```

使用 `--dry-run` 可以预览命令，不会改文件或推送。

## 版本规则

本项目使用 SemVer：

- patch：bugfix、小范围安全/UI 改进
- minor：新增扫描类别、清理能力或用户功能
- major：清理策略或公开接口发生不兼容变化

## License

MIT
