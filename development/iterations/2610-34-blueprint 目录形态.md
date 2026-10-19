# blueprint 目录形态：从「两个文件」到「一个目录」

## 需求

blueprint 目前只允许 `README.md` + `index.html` 两个文件，`index.html` 必须把所有 css / js
内联。这让页面只能「借」外壳的 `/chat.css`、`/vendor/*`，或者写成一大坨内联代码——前者隐晦，
后者难维护。要求：

1. 去掉「只允许两个文件」的限制：blueprint 目录里可以放自己的 `.css` / `.js` / 图片 / 子目录。
2. `README.md` 与 `index.html` 仍是必需项（前者是 agent 的开场上下文，后者是 UI 入口）。
3. 实例化仍是**整目录复制**，页面用相对路径引用自己的资源（`./simple.css`、`./assets/x.png`）。
4. `simple` 拆成 `README.md` + `index.html` + `simple.css` + `simple.js`，作为示范。

## 现状

- `workspace/ai/src/blueprint.ts`：`readBlueprint` 用 `readdirSync` 把 `README.md` / `index.html`
  之外的文件全部拒绝（400）；`instantiateBlueprint` 只写这两个文件。
- web 已经按目录服务：`/agent/<sessionId>/…` 直接读副本目录，任意扩展名都有 content type
  （`.css` / `.js` / `.png` / `.svg` / `.md` …），所以**服务侧不用改**。
- static 只列目录，不限制文件数（`case-core-blueprint-crud` 已按「第三个文件只被列出」写过）。
- 文档里「two files / self-contained」的表述分散在：`agents/AGENTS.md`（+ zh）、
  `contracts/ai-new.yaml`、`atoms/ai.yaml`、`docs/ai.md`、`.agents/BLUEPRINT_how-to{,_zh}.md`、
  两个 E2E 用例。

## 决策

1. **必需项不变**：`README.md` 与 `index.html` 缺失 → 400；其余文件与子目录**全部随复制走**。
2. **复制整目录**：实例化 = 递归复制（普通文件 + 目录），**跳过符号链接**——副本是整目录服务的，
   一个指向目录外的链接会把项目里别的东西也暴露出去。
3. **页面自包含的单位从「文件」变成「目录」**：`index.html` 用相对路径引用同目录文件；
   想借外壳的 `/chat.css` / `/vendor/*` 仍然可以（同源），但不再是唯一选择。
4. **原型 → 副本仍是一次快照**：改原型不影响已开的 agent，改副本只影响自己。
5. 不做 blueprint 的发现 / 版本化 / 热更新（沿用现状）。

## 方案

### ai（`workspace/ai/src/blueprint.ts`）

- `readBlueprint`：只检查两个必需文件存在并读出 README；不再 `readdirSync` 拒绝额外文件。
- `instantiateBlueprint`：`copyTree(prototype, agentDir)` 递归复制；目录用 `mkdirSync(recursive)`，
  普通文件用 `copyFileSync`，`Dirent` 是符号链接则跳过。
- 错误文案：`blueprint <slug>: README.md missing` / `index.html missing`。

### 契约 / atoms / docs

- `contracts/ai-new.yaml`：`blueprint` 字段说明改为「整个目录被复制（README.md + index.html 必需）」；
  400 说明改为「缺失 / 未知 / 缺 README.md 或 index.html」。
- `atoms/ai.yaml`：description 里「copies the prototype's two files」改为「copies the prototype
  directory」；`docs/ai.md` 同步。
- `agents/AGENTS.md`（+ `agents/zh/AGENTS_zh.md`）：blueprint 一节改为「目录、两个必需文件、
  其余资源随复制走、相对路径」。
- `.agents/BLUEPRINT_how-to{,_zh}.md`：标题与正文从「只有两个文件」改为「一个目录、两个必需文件」；
  「自包含」改为「目录自包含」；示例改成 4 个文件。

### `simple` 拆分

| 文件 | 内容 |
| --- | --- |
| `README.md` | agent 开场上下文（不变，补一句自己的文件布局） |
| `index.html` | 结构 + 首帧主题脚本 + `<link ./simple.css>` + `<script src="/config.js">` + `<script type="module" src="./simple.js">` |
| `simple.css` | 页面布局（整页一列、滚动区、hint） |
| `simple.js` | 对话逻辑（ask / stream / 渲染 / 图片 / 输入） |

仍链 `/theme.css` + `/chat.css` + `/vendor/*`（外壳的调色板、会话区样式和库），自己的代码与布局
放进同目录——正好证明相对路径这条路。

### 测试

- `case-core-agent-instantiate`：
  - setup 的 `demo` 增加 `style.css` 与 `assets/logo.svg`；删掉 `stray`（不再是错误）；
  - 第 1 步断言副本包含这些文件；
  - 第 5 步从「第三个文件 → 400」改为「资源随复制走且能取到」：`/agent/<sid>/style.css` 200
    `text/css`、`/agent/<sid>/assets/logo.svg` 200 `image/svg+xml`；另起一个缺 `index.html` 的
    `broken` blueprint → 400；
  - 标题里「two-file rule」的措辞同步改掉。
- `case-core-blueprint-crud`：第 5 步（额外文件只在 static 里出现、实例化 400）改为
  「额外文件是蓝图的一部分：static 列得出、实例化照抄」。
- 真跑这两条用例。

## 影响面

| 文件 | 改动 |
| --- | --- |
| `workspace/ai/src/blueprint.ts` | 递归复制、必需文件校验 |
| `contracts/ai-new.yaml`、`atoms/ai.yaml`、`docs/ai.md` | 描述与错误文案 |
| `agents/AGENTS.md`、`agents/zh/AGENTS_zh.md` | blueprint 定义 |
| `.agents/BLUEPRINT_how-to{,_zh}.md` | 目录形态、示例 |
| `.agents/blueprints/simple/{index.html,simple.css,simple.js,README.md}` | 拆分 |
| `development/testing/dev/case-core-{agent-instantiate,blueprint-crud}` | 断言更新 |

web / static / log 服务代码不改。

## 验收

- 含 `style.css`、`assets/logo.svg`、子目录的 blueprint 能实例化，副本目录结构一致；
- `/agent/<sid>/style.css`、`/agent/<sid>/assets/logo.svg` 返回正确 content type；
- 缺 `README.md` 或 `index.html` → 400；坏 slug → 400；
- `simple` 从副本加载 `./simple.css`、`./simple.js`，对话、markdown、芯片、图片粘贴、主题照常；
- `case-core-agent-instantiate`、`case-core-blueprint-crud` 通过并记 log。

## 实施记录（Phase 3）

- `workspace/ai/src/blueprint.ts`：`readBlueprint` 只校验两个必需文件；`copyTree` 递归复制
  （目录 + 普通文件，跳过符号链接）；不再往副本里写死两个文件名。
- `simple` 拆成 4 个文件后，页面实际加载 `theme.css` → `chat.css` → `/agent/<sid>/simple.css`，
  `simple.js` 作为 module 从副本加载；对话、markdown、芯片、图片粘贴照常。
- 跑过：`case-core-agent-instantiate` 1–7 全过（副本含 `style.css` + `assets/logo.svg`，
  `style.css` / `logo.svg` 的 content type 正确；缺 `index.html` → 400）；`case-core-blueprint-crud`
  1–4 全过（额外文件被 static 列出、不再被拒）。
- 记录已写 log（`kind: test`，3 条）。未提交，等 review。
