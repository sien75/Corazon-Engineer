# chat 会话 URL 路由

## 需求

web 端把「当前视图」写进地址栏，会话 tab 参与路由：

1. **单向同步**：切到某个 session 的 tab，URL 变成 `/chat/<sessionId>`；切回固定视图
   （`/how-to` 等）走各自的既有路径。
2. **深链**：直接打开 / 刷新 `/chat/<sessionId>`，能 resume 这个会话并开成 tab。
3. **前进 / 后退**：跟着切 tab。

## 现状

- 已有 SPA 路由：`parseRoute()` / `navigate()` / `route()` / `popstate`（`app.js:445`-`475`），
  路径为 `/`（graph）、`/<section>`、`/<section>/<id>`；非 section 的首段一律回落 graph。
- web server 有 SPA fallback（`workspace/web/server/serve.go`：磁盘上找不到就返回
  `index.html`），所以 `/chat/<id>` 能被接住，**无需改 server**。
- session tab 完全不参与 URL：`activeSkillId` / `newTabOpen` 只在内存里；激活的是哪个
  tab 另存 localStorage（`TAB_ACTIVE_KEY`），启动时按它恢复（`app.js:2705`）。也就是说
  在 `/` 刷新会把上次的 tab 拉回来——地址栏与所见内容可以不一致。
- sessionId 形如 `s_<16hex>`（`workspace/ai/src/registry.ts:312`），可直接做路径段。

## 方案

### 路由表（`parseRoute` 增加两支）

| 路径 | 视图 |
| --- | --- |
| `/` | graph |
| `/new` | 新建页（`+` 页） |
| `/chat/<sessionId>` | 该会话的 tab |
| `/<section>[/<id>]` | 既有固定视图 |
| 其它 | graph |

**history 规则**：显式「去某个 tab / 视图」= `push`（点 tab、点固定视图、点 `+`）；
同一段导航的延续或就地状态变化 = `replace`（在新建页里选 skill / recent、`/new` 命令、
删当前会话后重绑、关 tab 落到邻居、Esc 离开新建页）；由 URL 驱动的渲染（深链、前进后退）
= 不写 history。

### 1. 路由（app.js）

- `parseRoute()`：加 `/chat/<id>` → `{ view:"chat", sessionId }`、`/new` → `{ view:"newtab" }`。
- `navigate(path, mode = "push")`：push / `replaceState` 后 `route()`。
- `route()`：`chat` → `routeChat(sessionId)`（不碰 `currentView`，`activeSkillId` 由
  `activateSkillTab` 设）；`newtab` → `openNewTab({ push: false })`；其余照旧。
- `routeChat(sessionId)`：找 `sessionId` 对应的 tab，有就直接 `activateSkillTab(id, "none")`；
  没有就 `openSkillTab({ skillId:"", sessionId, name:"chat", text:"" }, "none")` 当深链开一个
  tab（与 recent 里打开同一个入口）。会话不存在（`/ai/resume` 404）由 `activateSkillTab` 既有
  的 catch 渲染 `[error]`，tab 保留——地址栏就是这个不存在的会话，页面照实反映错误，不自动清 tab。
- `openNewTab(push = true)`：push 时 `pushState("/new")` 并记下 `newTabReturn = 进页前的
  pathname`（第二次点 `+` 只刷新列表、不重复 push）；`closeNewTab()`（Esc）→
  `navigate(newTabReturn, "replace")`。原来它用 `showView(parseRoute())`，URL 变成 `/new` 后
  那样会解析回新建页。
- `showView()`：`chat` / `newtab` 直接 return（布局归 skill mode，schema 推送的 refresh 不能
  把列表画进隐藏的 `#content`）。
- **启动**：删掉 `TAB_ACTIVE_KEY` 的读 / 写与「恢复上次 tab」。URL 是激活视图的唯一真相：
  `/chat/<id>` 由 `routeChat` 恢复（打开的 tab 列表照旧存 localStorage），`/` 就是 graph。

### 2. URL 同步（app.js）

- `syncChatUrl(sessionId, mode)`：目标 `/chat/${encodeURIComponent(sessionId)}`；URL 已相同或
  `mode` 为空时不动。
- `activateSkillTab(id, history = "push")`：`syncTabActive()` 之后调
  `syncChatUrl(tab.sessionId, history)`。所有「切到某 tab」的入口都经过这里。
- `openSkillTab({...}, history = "push")`：透传给 `activateSkillTab`。新建页里的
  run / newchat / recent-resume 传 `"replace"`（从 `/new` 继续，`/new` 不留历史）。
- 关 tab：`closeSkillTab` → 邻居 `activateSkillTab(next.id, "replace")`；没有邻居
  `navigate("/", "replace")`。
- `/new` 命令：`activateSkillTab(tab.id, "replace")`——instance 就地换新 session，不是导航。
- 删当前会话：`aiConfirmAccept` 重绑 tab 后 `syncChatUrl(tab.sessionId, "replace")`。
- 固定视图 / 详情页：沿用 `navigate()`（push）。

### 3. 相邻修复：`/resume` 重绑当前 tab（app.js）

同一根因（`tab.sessionId` 与视图不同步）在 `2610-07` 里只修了「删当前会话」一条路径。
现在 URL 跟着 tab 走，`/resume` 选了会话 X 却仍显示旧 sessionId 就会直接暴露成错地址。
本次把 `/resume` 也对齐 tab 模型：`aiLoadSession` 成功后把当前 tab（`renderedTabId`）重绑到 X，
用会话 preview 当 tab 名，`syncChatUrl(X, "replace")`；旧 session 不删，仍可从 recent / log 打开。

### 范围外

- `/resume` 应重绑当前 tab 还是新开 tab——本次取「重绑」（最小改动，与「删当前会话」路径一致）；
  「新开 tab」与 recent 列表语义一致，如需要另开迭代。
- 深链到不存在的 session：不清 tab、不自动回退，保留错误显示（见上）。
- 后台 tab 仍可能指向已删 session（不是当前 `aiSession`）——既有问题，本次不动。
- 草稿不持久化、`2610-07` 的 tab 模型不变。
- 不改 `contracts/` `atoms/` `edges/`（纯前端路由；SPA fallback 已存在），
  不改 ai / log / static 服务。

## 验收

- 点某个 session tab → URL 变 `/chat/<sessionId>`；再点另一个 tab → 跟着变。
- 点固定视图 tab / 列表里的条目 → URL 回到 `/how-to` `/how-to/<id>` 等。
- 在 `/chat/<sid>` 刷新 → 仍停在该会话（tab + 消息都在）。
- 直接打开 `/chat/<sid>`（未开过这个 tab 的新浏览器状态）→ tab 打开并 resume 出历史消息。
- 浏览器后退 → 回到上一个视图（上一个 tab 或固定视图）并正确渲染；前进 → 回来。
- `/chat/<不存在的 id>` → 该 tab 显示 `[error]`（不崩、不白屏）。
- 点 `+` → URL `/new`，Esc → 回到进入前的视图（含详情页路径）。
- `/new` 命令 → 当前 tab 就地变新 chat，URL `replace` 成新 session（不留旧地址）。
- 关掉当前 tab → URL 落到邻居 tab（或 `/`），不留已关会话的地址。

## 影响面

`workspace/web/app.js`。测试新增 `development/testing/dev/case-core-web-chat-route/`
（复用 `case-core-web-skill-tabs` 的隔离栈：log :8513 / ai `--stub` :8511 / web 8610），
并回归 `case-core-web-skill-tabs`（其中「reload 后仍停在当前 tab」现在由 URL 承担）。

## 验证

新增用例 `development/testing/dev/case-core-web-chat-route/`，自起隔离栈（log :8523、
ai `--stub` :8521、web 8620，不碰真实 `.engineer`），ego-browser 跑上述验收点：
**18 项检查全过，exit 0**（多次运行，含 URL 写入参数改名后的复跑）。

- 路径：`/` = graph；固定视图保持自己的路径；back / forward 在它们之间走（3 项）。
- `+` → `/new`；从它跑 skill → `/chat/<sid>`；back 跳过 `/new`（replace 生效）；
  forward 仅凭 URL 重画会话（5 项）。
- 点 tab push 该 tab 的地址，back 离开它（2 项）。
- 深链：清空 localStorage 后直接开 `/chat/<sid>` → 新 tab + 重放历史（`seeded instruction`）；
  在该地址 reload 仍停在同一会话（3 项）。
- `+` 后 Esc 回到进去时的会话；`/new` 命令换 session 且 `history.length` 17 → 17
  （就地 replace）；关掉当前 tab → 地址落到邻居（4 项）。
- `/chat/s_0000…`（不存在的会话）→ 屏上 `[error] session not found`，不白屏（1 项）。

回归（同一份 web 资源）：`case-core-web-skill-tabs`（tab / `/new` / 草稿 / reload）、
`case-core-web-tool-chips`、`case-core-web-serve`（含 `GET /chat/<id>` → `200 text/html`，
深链依赖的 SPA fallback）、`case-core-web-input-grow` —— 全部 `ok: true`，无失败检查。

schema 未改，`POST /static/validate` → `ok: true`。

log 记录：`31f273f64b1e4f4c`、`30bd2f0d2e5ca932`（kind `test`，env dev，atom web）。
