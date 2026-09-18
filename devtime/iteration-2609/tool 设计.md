# Tool 设计

## 工具分层

| 层 | 来源 | 工具 | 权限 |
| --- | --- | --- | --- |
| 1 | pi 内置 | `read` `grep` `find` `ls` | 全权限保留（只读） |
| 2 | pi 内置 | `bash` | 全权限保留（执行原语，HTTP 也走它） |
| 3 | pi 内置 | `write` `edit` | 暂保留全权限，未来考虑限制范围 |
| 4 | 外部 | Browser / Computer Use / 云厂商 / 云服务 CLI | 先安装并启用，经 `bash` 调用 |

- 不再有自定义 `http` / `cli` 工具：`bash` 已覆盖 HTTP 调用和外部程序执行。
- 层 3 未来限制时，在 `beforeToolCall` 里对 `path` 做根目录前缀校验即可（不处理软链接）。
- pi 配置相应改为：允许列表 `["read","grep","find","ls","bash","write","edit"]`，`customTools` 清空。

## 自定义工具：先安装启用，再调用

原则：**不是调用时临时问，而是先把工具装好、启用，之后经 `bash` 自由调用。**

```
候选工具（内置推荐列表 / 用户提供）
        │
        ▼
  检测本机是否已安装（command -v / --version）
        │
   ┌────┴─────┐
  有           无
   │            │
   │        安装
   └────┬─────┘
        ▼
   启用
        │
        ▼
   工具在 PATH 上，AI 经 bash 直接调用
```

- 不落全局工具清单：装没装用 `command -v` 查即可，装完就是系统里的普通程序。
- 推荐列表不是死列表：AI 可自行找工具，用户也可直接提供，两者走同一条流程。
- 检测手段：`command -v <cmd>` / `<cmd> --version`；具体命令由 AI 按推荐列表自行判断（不硬编码）。
- 安装失败就停下，把命令 / 步骤告诉用户，由用户处理。

### 登录 / 鉴权由用户执行

安装、启用之后，凡是需要登录或配置凭据的外部工具（云厂商 CLI、数据库、浏览器登录态等），**由用户自己执行，不建议让大模型执行**。

- 登录/鉴权往往涉及密码、2FA、OAuth 跳转、交互式输入、浏览器登录态，交给模型既有凭据泄漏风险，也容易误操作。
- AI 只负责：检测是否已配置、未配置时暂停并提示用户手动完成、以及后续经 `bash` 调用已鉴权的工具。
- 凭据由各工具自己存储（如 `~/.aws/credentials`、`~/.aliyun/config.json`、浏览器 profile 等），Corazon 不另设统一凭据目录，AI 也不读取。
- 典型手动步骤：`aws configure`、`aliyun configure`、数据库连接串/密码、`agent-browser` 的登录态、Ego 首次 onboarding。

## 内置推荐列表（md）

内置推荐列表是一份 md，不是硬编码清单，仅供 AI 参考和发挥。落在 `agents/tools.md`，对应中文版 `agents/zh/tools.md`。安装命令一律以各工具官网当前版本为准。

下面各条带上了定位、底层技术等背景，是**方案里为了说明选型**才写的。真正落到给 AI 看的 skill / prompt 时只留重点：这个工具干什么用、怎么安装、怎么检测、典型用法；底层技术这类展开不必带进去。

### Browser Use

1. **agent-browser** —— `https://agent-browser.dev/`

   定位：通用 Browser CLI，适合普通网页自动化。
   底层：读用 Browser Accessibility Tree，写用 CDP，补充支持 JS execution。
   适合：网页读取、点击、输入、表单、后台系统、网页自动化。

   安装（macOS 推荐 Homebrew，或全平台 npm）：
   ```bash
   brew install agent-browser        # 或 npm install -g agent-browser
   agent-browser install             # 首次下载 Chrome for Testing
   ```
   注意事项：
   - 让 agent 会用，需另装 skill：`npx skills add vercel-labs/agent-browser`。skill 本身很薄，实际指令由 `agent-browser skills get <name>` 运行时提供，避免版本漂移；**不要**直接拷贝 `node_modules` 里的 `SKILL.md`。
   - 检测：`command -v agent-browser` / `agent-browser --version`。

2. **Ego** —— `https://lite.ego.app/`

   定位：专门为 Agent 设计的独立 Browser Runtime。
   底层：读用 Browser Accessibility Tree，中间表示为 Ego Semantic Snapshot，写用 CDP + JS。
   特点：自带 Chromium；Agent 有独立 Space；不和用户当前浏览器 Tab 混在一起；需安装 Ego App，首次 onboarding 需要人工。
   适合：长期 Browser Agent、多任务 Session、独立 Agent 浏览环境。

   安装（macOS）：
   ```bash
   # skill 在 ~/.agents/skills/ego-browser（软链到 ~/.local/share/ego/ego-skills）
   sh ~/.agents/skills/ego-browser/scripts/install.sh
   ```
   注意事项：
   - 脚本只支持 macOS，会下载 DMG 装到 `/Applications`、去 quarantine、然后打开 App；非 macOS 去 `https://lite.ego.app/` 下载。
   - 脚本打开 App 后，**需用户在 GUI 完成首次 onboarding**，onboarding 才会把 `ego-browser` 注册到 PATH（通常 `~/.local/bin`）。要等用户确认完成再继续。
   - `command -v ego-browser` 找不到时，多半是 PATH 缺 `~/.local/bin`：`export PATH="$HOME/.local/bin:$PATH"`。
   - 验证：`ego-browser nodejs <<'EOF'\nconsole.log('ego-browser ready')\nEOF`。

### Computer Use

3. **agent-computer-use** —— `https://www.agent-computer-use.dev/`（命令是 `agent-cu`）

   定位：通用桌面 CLI，结构化操作整个电脑。
   底层：读用 OS Accessibility Tree（macOS AX / Windows UI Automation / Linux AT-SPI），写用 Accessibility / UI Automation API；Electron App 可切到 CDP。
   适合：IDE、文件管理器、桌面软件、跨应用流程。

   安装（任选其一）：
   ```bash
   npm install -g agent-cu                         # npm 包名/命令均为 agent-cu
   cargo install --git https://github.com/kortix-ai/agent-computer-use --path cli
   # 或 clone 后 ./scripts/setup.sh（装 Rust、依赖、编译、提示权限）
   ```
   注意事项：
   - 需要无障碍权限：系统设置 → 隐私与安全 → 辅助功能 → 勾选终端 App（Terminal / iTerm2 / Warp / Cursor / VS Code）。
   - 验证：`agent-cu check-permissions`、`agent-cu --version`、`agent-cu apps`。
   - skill：`npx skills add kortix-ai/agent-computer-use -g`（装到 `~/.claude/skills/agent-computer-use/SKILL.md`）。
   - `agent-cu setup --yes` 会写 `Bash(agent-cu *)` 到 Claude Code 设置里以跳过逐条审批——这是 Claude Code 的机制，Corazon 未必照搬。

### 云服务厂商 CLI

- **aws**：通用 `curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash`（macOS/Linux），macOS 也可 `brew install awscli`。检测 `aws --version`；凭证由用户 `aws configure` 或 env 自行配置。
- **aliyun**：通用 `/bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"`，也可 `brew install aliyun-cli`。检测 `aliyun version`；凭证用 `aliyun configure`。

### 云服务能力 CLI

- **mysql**（client）：macOS `brew install mysql-client`（把 `/opt/homebrew/opt/mysql-client/bin` 加进 PATH）；Debian/Ubuntu `sudo apt-get install mysql-client`；Fedora/RHEL `sudo dnf install mysql`。检测 `mysql --version`。
- **redis-cli**：macOS `brew install redis`；Debian/Ubuntu `sudo apt-get install redis-tools`；Fedora/RHEL `sudo dnf install redis`。检测 `redis-cli --version`。

## 与现有实现的关系

- 旧的「按程序即时授权」权限系统已整体移除：不再有 `beforeToolCall` 审批、`/ai/approval` 接口、web 审批卡，也不再写项目内 `.corazon/ai-approved-cli.json`。当前所有工具调用直接放行。
- 落地时改为：`tools: ["read", "grep", "find", "ls", "bash", "write", "edit"]`，去掉自定义 `http` / `cli`。
- 外部工具一律经 `bash` 执行，不再有 argv 白名单式 `cli`，也不落工具清单/授权文件。

## 待确认

无。
