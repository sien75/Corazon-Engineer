# Page 与 Blueprint

## 需求

给 tab 承载的内容加第二种：**page**，由 **blueprint** 实例化而来。概念分层：

```
Tab                承载单元（前端的一格，能关）
 ├── kind=chat     skill 是它的 class —— 可空白 new
 └── kind=page     blueprint 是它的 class —— 必须真有 bp 才能 new
```

- **chat**：沿用现状，一个会话实例；skill 只是一段文本，用来开一个 chat；空白 chat 不依赖 skill。
- **page**：一个 blueprint 的渲染实例。blueprint 是**前端资源**：单一 HTML 入口
  （`index.html`），可带任意 js / css / assets。住在项目里 `.agents/blueprints/<slug>/`。
  page **不能空白 new**——没有 blueprint 就没有 page。
- blueprint **不做发现、不进 sqlite**：只有「新增 blueprint 的 tool」，加上前端需要的
  list / delete；和 my skills 一样由 ai 服务**直接读文件**。
- **多 root 服务**：web 的 Go 服务在现有 `--assets` 之外再加一条 root ——
  `/pages/...` → `<project>/.agents/blueprints/...`；page 内容用 iframe 渲染。
- **新建页改版**：两列 → 单列，四段（Chat / Skills / Blueprints / Recents）；
  Skills 与 Blueprints 各是一个可点进去的子页，子页左上角有返回按钮。

关于 **Window**：需求里说「tab 是目录、window 是内容」，但代码里没有 window。这次
**不引入 window**——一个 tab 仍只承载一个内容，用 `kind` 区分 chat / page。`kind` 就是
将来拆 window 时那个槽位。

## 现状

- **web 文件服务** `workspace/web/server/serve.go`：单 root（`--assets`），`/config.js`
  生成运行地址，未知路径回落 `index.html`（SPA 路由），`filepath.Join(root, …)` +
  `strings.HasPrefix(file, root)` 防穿越。**没有任何项目目录的入口**。
- **前端 tab** `workspace/web/app.js:1634`：`openTabs = [{ id, skillId, sessionId, name, text }]`；
  `openTab` / `activateTab` / `closeTab`（1790 / 1807 / 1846）只认会话。
- **路由** `app.js:452` `parseRoute()`：`/` graph、`/new` 新建页、`/chat/<sessionId>`、
  `/<section>[/<id>]` 五个固定视图，其余回落 graph。
- **新建页** `app.js:2016` `newTabReload()`：两列（左列类：built-in / my skills / suggested，
  右列实例：recent ≤100 条，过滤掉已打开 tab）。`recentSessions()` 在 2082。
- **布局** `app.js:1775` `applyLayout()`：`left / newtab / ai` 三选一（`#ai.tab-mode`）。
  `workspace/web/index.html` 里只有 `#left`、`#newtab`、`#ai` 三个内容容器。
- **ai 服务** `workspace/ai/src/skill/store.ts`：custom skill = `.agents/skills/<slug>/SKILL.md`
  （`customSkills()` 直接扫目录）；suggested 在 `.engineer/skill.db`；`registry.ts:216`
  `buildSkillTool()` 造 `save_skill` 工具，工具白名单在 `registry.ts:365-380`；
  路由在 `server.ts:233-303`（`/ai/skill/{list,save,delete,ignore,run,refresh}`）。
- **静态关系**：契约 `contracts/ai-skill-*.yaml`；`atoms/ai.yaml` provides / `atoms/web.yaml`
  consumes / `edges/web-to-ai.yaml` 逐条列出。
- **启动** `how-to/deploy/dev/launch.sh:97`、`how-to/deploy/prod/launch.go:131`：
  `serve-web --bind … --assets … --static … --ai … --log …`（参数全部必填，无默认值）。
- **测试** `development/testing/dev/`：`case-core-web-tabs` 断言「两列 + 不贯通分割线 +
  居中」，`case-core-web-serve` 断言单 root 服务行为，`case-core-skill-crud` 断言技能落盘。

## 决策

1. **一个 tab 一个内容，`kind` 区分**。`kind: "chat" | "page"`；不引入 window、不做
   tab 内多内容。localStorage 里的旧记录没有 `kind`，一律按 `chat` 读（不改 key，不做一次性迁移）。
2. **blueprint 目录形态**：`.agents/blueprints/<slug>/`，必须含 `index.html`，其余文件自由
   （js / css / assets / 子目录）。**没有 manifest 文件**——id 就是目录名，显示名取
   `index.html` 的 `<title>`（缺失回落 id）。
3. **air 服务直接读文件**，与 my skills 一致（同一套 slugify / 路径校验 / 目录扫描习惯）：
   蓝图不落 sqlite、不参与 suggested、不做定时发现。**只有新增 tool**，list / delete 是
   前端需要才提供的 HTTP 端点（不是「发现」）。
4. **`save_blueprint` 工具形状**：`{ name, files: [{ path, content }] }`（可带可选 `id`）。
   `files` 必须含 `index.html`；`path` 必须是目录内的相对路径（禁止绝对路径、`..`、
   含盘符），写入用逐段校验后的 `filepath.Join`。无 `id` → 按 name 派生唯一 slug 建目录；
   有 `id` → 写进该目录（**只写、不删**未列出的旧文件）。
5. **多 root 走「前缀 → 目录」而不是把项目根交给 web**：`serve-web` 新增必填
   `--pages <dir>`，`/pages/` 前缀映射到它。web 不需要、也拿不到整个项目目录
   （`--root` 在 log / static / ai 里是「项目根」，语义不同，不混用）。
6. **URL 方案 A**：地址栏 `/pages/<id>`（不带斜杠）→ 服务器在这个路径读不到文件
   （它是目录）→ **回落 SPA 外壳**，tab 栏还在；iframe 的 src 是 `/pages/<id>/`
   （带斜杠）→ 服务器补 `index.html` → **蓝图本体**。一个斜杠之差，两条路径各归其位，
   不需要新前缀。
7. **page 没有会话**：不开 chat、不写 log、不进 Recents、ai 侧无记录；tab 名 = blueprint 名。
   关掉再打开只是重新加载 iframe，没有「历史」可言。
8. **蓝图能调后端**：已天然成立（ai / log / static 都发 `Access-Control-Allow-Origin: *`），
   不需要新工作。蓝图同源，还能直接 `fetch('/config.js')` 拿到 `window.ENGINEER`
   里的三个服务地址，和 `app.js` 一样用。
9. **新建页单列四段**，用横线分隔：
   1. Chat 按钮（现在的 built-in 那一个）——开空白 chat；
   2. Skills：标题行（点进 `/new/skills`）+ 最多 3 个 my skill 按钮（点 = 用该 skill 开 chat）；
   3. Blueprints：标题行（点进 `/new/blueprints`）+ 最多 3 个 blueprint 按钮（点 = 开 page）；
   4. Recents：直接列 `log/list` 第一页 100 条（仍过滤掉已打开的 chat tab）。
10. **两个子页**（`/new/skills`、`/new/blueprints`）：**只有标题右侧的箭头可点**（标题本身是标签，
    点了不跳），进去后内容列**顶对齐**、左上一个**无边框**的返回按钮（贴在 pane 顶部）；
    Skills 子页 = My Skills（全量，`chat` / `delete`）+ 横线 + Suggested（`chat` / `save` / `ignore`）；
    Blueprints 子页 = 全部 blueprint（`page` / `delete`）。两页都不放 Recents。
    行内动作名：技能用 `chat`，蓝图用 `page`（对称、可读）。
11. **suggested 的发现机制不动**：队列、阈值、扫描、`/ai/skill/refresh` 一概不碰。
12. **iframe 不加 sandbox**：蓝图要跑脚本，且是项目自带资源，与外壳同源。风险（蓝图理论上能
    通过 `window.parent` 触碰外壳）记录在「范围外」，后续用权限控制解决，本次不设计。

## 方案

### ai 服务：`workspace/ai/src/blueprint/store.ts`（新）

与 `skill/store.ts` 同一套习惯，但只有文件一侧（无 sqlite）：

```ts
export interface Blueprint {
  id: string;      // 目录名（slug）
  name: string;    // index.html 的 <title>，缺失回落 id
  entry: string;   // "index.html"
  files: string[]; // 目录内相对路径，排序，不含 index.html 之外的隐藏文件
  createdAt: string;
  updatedAt: string;
}

export class BlueprintStore {
  constructor(root: string)            // <root>/.agents/blueprints
  list(): Blueprint[]                  // 按 updatedAt 倒序；没有 index.html 的目录跳过
  get(id: string): Blueprint | undefined
  save(input: { id?; name: string; files: { path; content }[] }): Blueprint | undefined
  remove(id: string): boolean          // rm -rf 目录
}
```

- `slugify` / `uniqueSlug` 与 skill 同规则（小写、非字母数字→`-`、冲突加 `-2` / `-3`）。
- `blueprintDir(id)` 只接受 `^[a-z0-9][a-z0-9-]*$`，与 `SkillStore.skillDir` 一致。
- 每个 `files[].path`：拒绝绝对路径、`..`、反斜杠与盘符，逐段净化后 join，再校验结果前缀。
- `name` 只用于**首次**写目录：保存时不改用户 HTML（不注入 title），显示名读取时现取 `<title>`；
  `save` 的 `name` 只在没有 `id` 时决定目录 slug。
- **入口要求落在目录上，不落在请求上**：一次 `save` 可以不带 `index.html`，只要该目录里已经有一个
  （给已有页面加一个 css 是正常保存）；新建时必须带。

### ai 服务：接线

- `registry.ts`：新增 `blueprintStore` + `save_blueprint` 工具（`promptSnippet` /
  `parameters`：`name`、`files`），加进 `customTools` 与工具白名单（和 `save_skill` 并列）；
  暴露 `get blueprints()`。
- `server.ts`：新增
  - `POST /ai/blueprint/list` → `{ blueprints: [...] }`
  - `POST /ai/blueprint/save` → `{ id?, name, files }` → `{ blueprint }`（不存在且无 id 则新建；
    404 仅当给了不存在的 id）
  - `POST /ai/blueprint/delete` → `{ id }` → `{ blueprintId }`（不存在 → 404）
  返回形状与 skill 系列一致（camelCase wire 投影）。

### web 服务（Go）：多 root

`workspace/web/server/serve.go`：

- 新增必填 `--pages <dir>`（蓝图目录，启动方计算）。usage 与启动校验一起更新。
- `handler` 按前缀选 root：

  | 路径 | root | 行为 |
  | --- | --- | --- |
  | `/pages/…` | `--pages` | 命中即静态文件；`/pages/<id>/` 补 `index.html`；`/pages/<id>`（目录）读不到 → 落 SPA 外壳 |
  | 其余 | `--assets` | 现状：`/config.js`、静态文件、未知路径回落外壳 |

- 穿越防护按所选 root 各自做前缀校验（`/pages/../..` 之类既有的 403 用例必须继续通过）。
- web **不 list 蓝图**：它只是文件服务器，清单归 ai 服务。

### 契约与静态关系

新增 `contracts/ai-blueprint-list.yaml` / `-save.yaml` / `-delete.yaml`：

```yaml
# list 响应
blueprints:
  - id: string        # .agents/blueprints/ 下的目录名
    name: string      # index.html 的 <title>，缺失回落 id
    entry: string     # 固定 "index.html"
    files: [string]   # 目录内相对路径（排序）
    createdAt: string
    updatedAt: string
```

`request.body`（save）：`id?`、`name`、`files: [{ path: string, content: string }]`。

- `atoms/ai.yaml`：provides 加三条；description 补一句 blueprint（`.agents/blueprints/<slug>/`，
  无发现、无 sqlite）。
- `atoms/web.yaml`：consumes 加三条（`path: /ai/blueprint/…`）；description 补一句
  `--pages` 多 root 与 iframe 渲染。
- `edges/web-to-ai.yaml`：加 `web-to-ai-blueprint-{list,save,delete}` 三条。
- `docs/ai.md`：补 blueprint 一节（工具、存储、与 skill 的差别：无发现 / 无 sqlite）。
- 改完跑 `static/validate`。

### 前端 `workspace/web/app.js` / `index.html` / `style.css`

**tab 模型**（`app.js`）：

```js
{ id, kind: "chat" | "page", name,
  skillId?, sessionId?, text?,   // kind=chat
  pageId? }                       // kind=page
```

- `loadTabs()`：旧记录无 `kind` → `"chat"`；`page` tab 只要求 `id` / `pageId` / `name`。
- `openPageTab(pageId, name)`：起 tab（去重：同 `pageId` 复用已有 tab）。
- `activateTab()`：`kind === "chat"` 走现有分支；`kind === "page"` 设置 iframe 的
  `src = /pages/<id>/`，不碰 composer / session。
- `applyLayout()`：四选一 —— `left` / `newtab` / `#ai.tab-mode` / `#page.page-mode`。
- 路由：新增 `PAGES_PREFIX = "pages"`；`parseRoute()` 命中 `/pages/<id>` → `{ view: "page", pageId }`；
  `routePage(id)` 找已有 tab 或 `openPageTab`。
- `index.html` 新增 `<div id="page" hidden><iframe id="page-frame" title="page"></iframe></div>`；
  `#tab-add` 的 title 从 `skills` 改成中性的文案。

**新建页**（`newTabReload()` 重写）：

```html
<div class="newtab-body">
  <section class="newtab-sec" data-section="chat">   Chat 按钮 </section>
  <section class="newtab-sec" data-section="skills">
    <div class="newtab-sec-head"><h3>Skills</h3><span>n</span><button data-action="open-skills">more →</button></div>
    ≤3 个 my skill 按钮（data-action="run"）
  </section>
  <section class="newtab-sec" data-section="blueprints">
    <div class="newtab-sec-head"><h3>Blueprints</h3><span>n</span><button data-action="open-blueprints">more →</button></div>
    ≤3 个 blueprint 按钮（data-action="page"）
  </section>
  <section class="newtab-sec" data-section="recent">     100 条 chat 历史 </section>
</div>
```

- 数据：`/ai/skill/list`（现状）+ `/ai/blueprint/list`（新）+ `log/list`（现状）；
  任一个失败只让那一段显示错误，其余照常渲染。
- my skills 取全部、显示前 3；blueprints 取全部、显示前 3。
- 子页：`newTabMode = "home" | "skills" | "blueprints"`；`renderNewTabHome()` /
  `renderNewTabSkills()` / `renderNewTabBlueprints()` 共用同一个 `#newtab` 容器。
  子页与 `/new/skills`、`/new/blueprints` 双向对应（`parseRoute` 支持 `/new/<sub>`，
  pushState 同步）。
- 返回按钮：子页内容列左上角（`data-action="newtab-back"`）→ 回 `/new`。
- delete 复用现有 `.skill-confirm` popover，语义文案按蓝图/技能区分。

**样式**：

- `.newtab-body` 保持居中（宽度上限收敛到单列舒适值，如 `min(720px, 100%)`）。
- 段与段之间：`border-top: 1px solid var(--border)`（第一段除外）。
- Skills / Blueprints 的 3 个按钮横排（`display: flex; gap`），窄屏换行。
- `.page-mode`：`#page` 占满内容区，`iframe { width:100%; height:100%; border:0 }`。

### 测试

- **新增** `development/testing/dev/case-core-blueprint-crud`：ai 服务的蓝图 CRUD
  （落盘路径、slug 派生、`<title>` 取名、路径穿越拒绝、delete 删目录、list 排序）。
- **新增** `case-core-web-page`：新建页单列四段 + Skills/Blueprints 子页与返回 +
  点蓝图开 page tab（iframe `src` = `/pages/<id>/`）+ 地址栏 `/pages/<id>` 刷新后仍是 tab +
  page 不进 Recents + blueprint delete。
- **改** `case-core-web-tabs`：两列 / 不贯通分割线的断言 → 单列四段断言；
  built-in 文案 → Chat 按钮；`#newtab h3` 顺序断言同步。
- **改** `case-core-web-serve`：补 `/pages/<id>/`（蓝图 root 命中）、`/pages/<id>`
  （外壳）、`/pages/<id>/../../…`（403）三组断言；setup 加 `--pages`。
- **改** `case-core-skill-crud` 等用 `serve-web` 的用例：setup 里补 `--pages`（必填参数）。
- 结果写 log（`kind: test`）。

### 启动与手册

- `how-to/deploy/dev/launch.sh`：serve-web 加 `--pages "$ROOT/.agents/blueprints"`。
- `how-to/deploy/prod/launch.go`：serve-web 加 `--pages filepath.Join(root, ".agents", "blueprints")`。
- `how-to/deploy/{dev,prod}/BOOK.md`：参数清单补 `--pages`（属 Type 3，随本次一起改）。

## 实施记录（Phase 3）

- **契约 / atoms / edges**：新增 3 个 blueprint 契约，`atoms/ai.yaml`（3 provides + description）、
  `atoms/web.yaml`（3 consumes + description）、`edges/web-to-ai.yaml`（3 edges）补齐，
  `static/validate` → `ok: true`。
- **实现期修正的两处设计**：
  1. `save_blueprint` / `/ai/blueprint/save` 的「必须含 index.html」从**请求**放宽到**目录**——
     给已有蓝图补一个 css（请求里没有 index.html）是正常保存；只有新建时才强制带入口。
  2. 行内类名统一换成中性的 `.launch-item/.launch-main/.launch-name/.launch-desc/.launch-actions`
     （之前 recent 会话也在用 `skill-*`，蓝图行套上去更名不副实）。
- **子页导航用 push、子页自己的返回按钮用 replace**：浏览器的 back 因此能从子页退回 launcher 首页，
  而 launcher 自己的返回按钮不会把子页留在历史里。`/new` 仍是「进入一次、替换一次」的那一条历史。
- **改到用例的既有断言**：`case-core-web-tabs` 的两列/不贯通分割线断言改为单列四段 + 横线；
  `case-core-web-chat-route` 跑技能改从 launcher 首页的技能预览行点入（沿用「/new 不留在历史」的原断言）；
  7 个用 `serve-web` 的用例 setup 补上必填 `--pages`；`case-core-web-serve` 补多 root 断言。
- **review 后回改**（用户 2026-10-10 反馈）：
  1. **只有箭头可点**：`Skills` / `Blueprints` 的标题行不再整行可点，`data-action` 挂到右侧 `→`
     按钮（`.newtab-sec-open`）上；用例新增「标题是标签、点它不跳转」的断言。
  2. **返回按钮**：去边框，改成贴在 pane 顶部的 `sticky` 文字按钮；子页整体从垂直居中改为**顶对齐**
     （`#newtab.subpage`），因此按钮真的在最上面（实测距 pane 顶 0px）。
  3. **报错文案**：`Failed to fetch · Failed to fetch` 改成按服务分行（`skills: …` / `blueprints: …`）——
     那两个列表都来自 ai，用户看到这次是**我把 dev 栈的 ai 进程误杀**导致的（`pkill 'main.ts.*port 85'`），
     重启后不再出现。
  4. 给项目里放了一个**示例蓝图** `.agents/blueprints/hello/`（一页 html，自述它从哪来、
     ai 地址、蓝图清单；删掉即可）——仓库里没有任何蓝图时 launcher 的 Blueprints 段与 `/pages/…`
     看不了东西，review 需要一个活样本。
- **实跑**（全部 dev、`--stub`）：
  - `core-blueprint-crud` 6 步通过（含错误分支 400/404 序列与重启后仍在）。
  - `core-web-serve` 8 组通过（含 `/pages/<id>` 与 `/pages/<id>/` 的分工、四条穿越 403）。
  - `core-web-page` ok:true 11/11。
  - `core-web-tabs` ok:true 40/40。
  - 回归：`core-skill-crud`（7 步）、`core-skill-run`、`core-skill-suggest`、`core-web-chat-route`（18/18）通过。
  - `how-to/deploy/dev/launch.sh` 带 `--pages` 正常起四件套。
  - 测试记录已写入 log（`kind: test`）。
- **未做**：`core-web-chat-scroll` / `core-web-input-grow` / `core-web-tool-chips` 未重跑——
  这三条只碰会话区渲染，本次没动那部分代码（改了它们的 setup 参数，未跑）。
  也没把改动打进安装态应用（`~/.engineer/apps/current` 仍跑旧 web 资源）——那是 Type 2，走
  `how-to/deploy/prod/BOOK.md`，等 review 通过再说。

## 范围外

- **不引入 window**：一个 tab 只承载一个内容；tab 内多内容 / 分屏不做。
- **不做 blueprint 的发现机制**：没有 suggested、没有扫描、没有 sqlite 表；
  也不动 skill 现有的发现机制。
- **不做 blueprint 的编辑 / 重命名 / 版本化**：改内容靠 agent 再用 `save_blueprint` 覆盖；
  重命名 = 改 `<title>`（目录名不变，同 skill 的 id 语义）。
- **不做新建页里的创建表单**（技能、蓝图都没有）。
- **不做 page 与 chat 的关联**（没有「从 page 开一个 chat」、没有 page 参数化）。
- **不改 `log/list` 的分页与 `PageSize`**（仍是 100，被三个端点共用）。
- **不做 iframe 沙箱 / 蓝图的权限控制**：同源、可脚本，权限留待后续（见 `plans/2610/第 2 批.md` 的权限控制一条）。
- **不做 blueprint 的跨机器分发**：只有项目目录 `.agents/blueprints/`。

## 验收

- 目录与工具：agent 调 `save_blueprint` 后，`<root>/.agents/blueprints/<slug>/index.html`
  存在，返回的 `id` = 目录名；带 js / css 的多文件也能写进去；`path` 含 `..` 或绝对路径被拒。
- `GET`/`POST /ai/blueprint/list` 列出所有蓝图（有 `index.html` 的目录），按 updatedAt 倒序，
  `name` = `<title>`。
- `/ai/blueprint/delete` 删掉整个目录；再删 → 404。
- 重启 ai 服务后蓝图仍在（文件在，不在内存）。
- web 服务：`/pages/<id>/` 返回蓝图 `index.html`，`/pages/<id>/app.js` 返回对应文件，
  `/pages/<id>` 返回 SPA 外壳（`text/html`，与 `/` 一致），`/pages/../../etc/passwd` → 403。
- 新建页：单列四段（Chat / Skills / Blueprints / Recents），段间有横线；
  Skills 段 ≤3 个 my skill、Blueprints 段 ≤3 个 blueprint；Recents 直接 100 条 chat 历史、
  不含 page、过滤掉已打开的 chat。
- 点 Skills 标题右侧的 `→` 进 `/new/skills`：左上角返回按钮、My Skills（全部）+ 横线 + Suggested，
  动作分别是 `chat`/`delete` 与 `chat`/`save`/`ignore`；返回按钮（和浏览器后退）都能回新建页。
  点 Blueprints 标题右侧的 `→` 进 `/new/blueprints`：全部蓝图，动作 `page`/`delete`。
- 点一个 blueprint 开一个 page tab：tab 名 = 蓝图名，内容是 iframe 且 `src` 指向
  `/pages/<id>/`；刷新页面后 tab 仍是 tab（地址栏 `/pages/<id>`，不整页跳进蓝图）。
- 蓝图里 `fetch(location.origin + '/config.js')` 能拿到 `window.ENGINEER`，
  并能直接 POST ai / log / static 的接口（CORS 已有）。
- page tab 不出现在 Recents 里，也不产生 log 会话。
- `static/validate` 通过（契约 / atoms / edges 无悬空引用）。
- `development/testing/dev/` 下 `case-core-web-tabs`、`case-core-web-serve`、
  `case-core-blueprint-crud`、`case-core-web-page`、`case-core-skill-crud`、
  `case-core-skill-run` 全部通过。

## 影响面

| 文件 | 改动 |
| --- | --- |
| `workspace/ai/src/blueprint/store.ts` | 新：BlueprintStore |
| `workspace/ai/src/registry.ts` | `save_blueprint` 工具 + `blueprints` getter + 白名单 |
| `workspace/ai/src/server.ts` | 三个 blueprint 路由 |
| `workspace/web/server/serve.go` | `--pages` + 多 root |
| `workspace/web/app.js` | tab `kind`、page tab、路由 `/pages/<id>`、新建页重写、两个子页 |
| `workspace/web/index.html` | `#page` iframe 容器、`#tab-add` 文案 |
| `workspace/web/style.css` | 单列四段、段间横线、子页、`.page-mode` |
| `contracts/ai-blueprint-{list,save,delete}.yaml` | 新 |
| `atoms/ai.yaml`、`atoms/web.yaml`、`edges/web-to-ai.yaml` | provides / consumes / edges |
| `docs/ai.md` | blueprint 一节 |
| `development/testing/dev/…` | 新增 2 个用例、改 3 个用例（+ setup 里补 `--pages`） |
| `how-to/deploy/dev/launch.sh`、`how-to/deploy/prod/launch.go` | `--pages` |
| `how-to/deploy/{dev,prod}/BOOK.md` | 参数清单补 `--pages` |

`log`、`static` 服务不动；`log/list` 契约不动；`.gitignore` 不动（`.agents/` 进版本库，
`.engineer/` 已忽略）。
