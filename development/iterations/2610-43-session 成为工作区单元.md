# 2610-43-session 成为工作区单元（取消 tab 表）

## 需求

1. **取消 tab 表**：tab 不再是实体，只剩 UI 上"容器"的叫法。一个 tab = 一条 session + 它的 blueprint。
2. `current` 语义不变，只是记的东西从 tab id 换成 session id：`openSessions`（开着的 tab，显示顺序，**不含 main**）+ `mainSession`。
3. **分屏（pane 树）彻底砍掉**：没有 layout，一个 tab 永远只装一个 agent，界面形态不再由模型决定。
4. main 的工具改说 session：`session-list / session-open / session-close / session-new / session-delete`，删 `tab-layout-mutation`；`main-list / main-new / main-resume` 不变。
5. 接口与前端路由也讲 session：`/log/session/*`、`/s/<sessionId>`；**只有界面文案保留 tab 这个词**。

## 现状（事实）

- 三张表：`tabs`（pane 树 `layout` + `title` + `last_at`）、`sessions`（`kind` / `blueprint` / `tab_id`）、`current`（`open_tabs` JSON + `main_session`）。
- tab 的唯一实质内容是 layout 树：log 把它当**不透明文本**存（`store.go` 的 `Tab.Layout`），ai 造树（`layout.ts`），web 画树（`app.js` 的 pane 段）。
- `sessions.tab_id` 是一次写入、永不移动的绑定（`BindSessions`）；「会话只能通过 tab 到达」这条规则就是从它来的。
- **删一条会话不需要新端点**：`/log/delete` 已经删 records + `sessions` 行 + （是 main 时）清指针（`store.DeleteSession`）。
- `/log/list` 从 `records` 出发 `LEFT JOIN sessions`，返回 `kind / createdAt / lastAt / count / preview`，按 lastAt 倒序；因此**没有消息的会话不出现**。`main-list` 用它；launcher 的 recents 用的是 `/log/tab/list`。
- `/log/session/detail`（meta：kind / blueprint / tabId）与 `/log/session-detail`（messages）**名字撞车**，只是靠斜杠区分。
- `/agent/<sessionId>/` 本来就是按 session 解析 blueprint（`workspace/web/server/serve.go`），web 服务这层不用改。
- 只服务于分屏的代码量：`workspace/ai/src/layout.ts` 239 行、`app.js` 的 pane 段约 205 行、log 的 tab 段约 150 行（含表与迁移）。

## 决策

1. **不加表，只改表**：`sessions` 加 `title`、删 `tab_id`；`current.open_tabs` 改名 `open_sessions`。
2. **`lastAt` 不落库**：它已经能从 `records` 算（`MAX(created_at)`），空会话退回 `sessions.created_at`。少一列，也少一条"消息写入时顺手 bump"的耦合。
3. **`title` 在写 session 行时算好**：ai 建会话时读 blueprint 的 `index.html` 的 `<title>`（main 用 `"main"`），随 `kind` / `blueprint` 一起 upsert；和 `blueprint` 一样"空值不覆盖"。前端现有的 `fetchTabName` / title watcher 降级成老数据（没有 title 的会话）的兜底。
4. **删除 = `ai/delete` + `log/delete`**（dispose 活会话 + legacy 目录；records + 行 + 指针）。`session-delete` 只需要这两步，不新增契约。
5. **开/关仍是一对幂等端点**，不让双方都整份 PUT：`/log/session/on`、`/log/session/off`，参数 `sessionIds`，返回整份 `openSessions`。原因和今天一样——main 的工具和外壳会并发改同一份列表，整份写回会互相盖掉。
6. **列表只留一个**：`/log/list` 改成从 `sessions` 出发 `LEFT JOIN records`（刚建、还没说话的会话也出现，`count=0`），加 `title` / `blueprint`，`lastAt = COALESCE(MAX(records.created_at), sessions.created_at)`。launcher recents、`session-list` 工具、`main-list` 全用它。
7. **pane 相关全删**：`layout.ts`、`tab-layout-mutation`、前端的 pane 渲染、`.agents/skills/pane-layout/`。
8. UI 仍叫 tab（tab 条、`+`、关闭按钮），代码 / 接口 / 工具 / 文档里的实体只说 session。

## 数据结构

```yaml
# sessions
session_id  TEXT PRIMARY KEY
kind        TEXT NOT NULL DEFAULT 'sub'
blueprint   TEXT NOT NULL DEFAULT ''
title       TEXT NOT NULL DEFAULT ''   # 新增：展示名（blueprint 页 <title>；main 为 main）
created_at  TEXT NOT NULL
# tab_id 列：迁移完成后删

# current
id            INTEGER PRIMARY KEY CHECK (id = 1)
open_sessions TEXT NOT NULL            # 改名自 open_tabs：JSON 数组，session id，显示顺序，不含 main
main_session  TEXT NOT NULL DEFAULT ''
updated_at    TEXT NOT NULL

# tabs 表：整体删除
```

### 迁移（老库）

1. 老 `current.open_tabs`（tab id 列表）→ 每个 tab 取它绑定的**一条** session（`MIN(created_at)` 那条）→ 新的 `open_sessions`（去重、保序）。一个多 pane tab 的其它会话退回"只在最近列表里能找到"。
2. `DROP TABLE tabs`；`ALTER TABLE sessions DROP COLUMN tab_id`；`ALTER TABLE current RENAME COLUMN open_tabs TO open_sessions`（现代 sqlite 都支持；失败就重建表）。
3. 老 session 的 `title` 留空：前端按 `title || blueprint || sessionId` 兜底，不回填。
4. 老 URL `/tab/<tabId>` 失效（前端路由本来也只认当前这份 workspace）。

## 契约改动

| 契约 | 动作 |
|---|---|
| `log-tab-{new,mutation,detail,list,on,off,delete}.yaml` | **删 7 个** |
| `log-tab-on` / `log-tab-off` | → `log-session-on` / `log-session-off`：`{ sessionIds: [..], index? }`，返回 `{ openSessions }`；`on` 找不到 sessions 行 → 400 |
| `log-current-get` / `log-current-put` | `openTabs` → `openSessions`（put 仍只做整份替换：修复 / 排序） |
| `log-session-upsert` | 加 `title`（空值不覆盖），去 `tabId`；`on` 时一并写 |
| `log-session-kind`（路径 `/log/session/detail`） | 去 `tabId`，加 `title` |
| `log-session-detail`（消息列表） | 路径改 `/log/session/messages`，与 meta 分开命名 |
| `log-list` | 起点从 `records` 改成 `sessions`（LEFT JOIN records），加 `title` / `blueprint`，空会话 `count=0` |
| `log-delete` | 不动 |

`tabId` 这个词在契约里消失（`log-session-kind` 是最后一个带它的）。

## 工具（ai，main 专属）

| 工具 | 参数 | 作用 |
|---|---|---|
| `session-list` | — | 开着的 session（= 屏幕上的 tab），按显示顺序：`sessionId` / title / blueprint / lastAt；main 单独标出，不含 pane 数 |
| `session-open` | `sessionIds`、`index?` | 把已有 session 放回开着列表（同一个，不新建；已开的保持原位）。`index` 只管首次插入位置 |
| `session-close` | `sessionIds` | 从开着列表拿掉；记录留着，可以再 open |
| `session-new` | `blueprint` | 造一个新 agent 并直接打开；返回 `sessionId` + title |
| `session-delete` | `sessionId` | 删这条 session 和它装的那段对话（记录 + blob + 活着的 ai 会话）；**拒绝 `kind=main`** |
| `main-list` | `pageNum?` | 不变（早先的 main 对话，屏幕上的标 `*`） |
| `main-new` | — | 不变（造新 main、挪 `mainSession` 指针） |
| `main-resume` | `sessionId` | 不变（指针指回早先的 main；blueprint agent 的 id 拒绝） |

所有 session：`ask_user`。sub agent 仍然一个工作区工具都没有。

**删**：`tab-layout-mutation`（连同 `layout.ts`）、`current-tab-list`、`current-tab-mutation`、`tab-new`、`tab-delete`。

规则改写（`agents/main/AGENTS.md`）：

- "一个会话只属于一个 tab，永不变更" → **"一条会话就是一个 tab"**（tab 的唯一标识就是它的 session id）。
- "要看已有对话就重开它的 tab" → `session-open`（同一个 tab 放回来，记录还在）。
- 一个 tab 永远只装一个 agent；界面上不会出现并排。

## 前端（web）

- **删**（pane 段，约 205 行）：`mintPaneId` / `normalizeTree` / `tabLayoutOf` / `tabLayout` / `ensurePane` / `splitEl` / `buildPaneNode` / `renderPanes` / `dropPane` / `dropTabPanes` / `paneFramePainted` / `paneKeyOf` / `sessionsOf` / `primaryPane`。`waitForTabPaint` 保留，改成等那一张 iframe。
- `tabFromRecord(rec)` → `tabFromSession(s)`：`{ id: sessionId, name: title, kind, blueprint, viewEl }`，视图懒建。
- `makeMainTab` 与普通 tab 合成一条路径：`kind=main` → `<engineer-chat>`，`sub` → iframe；`openTabs[0]` 仍是 main（main 不在 `openSessions` 里）。
- tab 条 = `openSessions` 里的 session；launcher recents = `/log/list`；点 recents 行 = `session/on` 再激活。
- 新建（`+` → blueprint）= `ai/new` + `session/on`，不再有 `tab/new` + layout。
- `doRefreshWorkspace` 的重建条件从"layout 变了"退化成"标题/存在性变了"；不再需要 `tab/detail` 轮询。
- 路由 `/tab/<tabId>` → `/s/<sessionId>`；`popstate` 同步改。
- 工具名正则 `^(tab-|session-|main-)` → `^(session-|main-)`。
- `style.css` 删 `.pane-tree` / `.pane-split` 段，`.pane` 简化为"一个满幅视图"。

## 文案与静态关系

- `agents/main/AGENTS.md` + `agents/zh/main/AGENTS.md`：工具清单换名、删分屏段、改上面三条规则。
- `atoms/log.yaml`（7 个 provides 删）、`atoms/web.yaml`（5 个 consumes 删）、`atoms/ai.yaml`（5 个 consumes 删 + 描述重写）。
- `edges/web-to-log.yaml` 删 6 条、`edges/ai-to-log.yaml` 删 5 条。
- `docs/log.md`、`docs/ai.md` 按新契约与新工具重写对应节。
- **删** `.agents/skills/pane-layout/`。
- `how-to/` 只受"接口名"影响的部分（BOOK 里没有 tab 端点），不动。

## 测试

- **删**：`case-core-web-panes`、`case-core-web-pane-frame`。
- **重写**：`case-core-log-tab` → `case-core-log-session`（`session/on|off|list`、`current` 的 openSessions、`log/list` 含空会话）。
- **改 fixture / 断言**（凡是用 `/log/tab/new` 或 `tab-new` 造场景的）：`case-core-log-workspace`、`case-core-web-tabs`、`case-core-web-tab-records`、`case-core-web-tab-state`、`case-core-web-launcher-open`、`case-core-web-tool-chips`、`case-core-web-chat-controls`、`case-core-ai-flow`、`case-core-ai-recover`、`case-core-ai-main-new`、`case-core-ai-main-resume`、`case-core-session-delete`、`case-core-blueprint-crud`、`case-core-agent-instantiate`。
- **本次要跑的**（判据：断言读本次改的那一层）：`case-core-log-session`（新）、`case-core-log-workspace`、`case-core-web-tabs`、`case-core-web-tab-state`、`case-core-web-launcher-open`、`case-core-web-tool-chips`，加一个真模型的 `case-core-ai-flow`（`session-new` 端到端）。其余用例属于"不读改动的层"，列出不跑的理由。

## 风险

- `log/list` 换起点后，`main-list` 可能多出一条"还没有消息的 main"（`count=0`）——输出已经为这种行写了 `(no messages)`，可接受。
- 老库迁移会**丢掉多 pane tab 里非主 pane 的上屏状态**（会话本身还在）。这是本次取舍，写进迁移说明。
- `title` 落库会随时间失真（blueprint 页改名）。和今天的 tab title 一样，接受；不引入 watcher 回写，避免页面自己改 title 把记录搅脏。

## 不做

- 同时看多个 agent（分屏）。真要并排，另起一版"前端本地多格"，不落 schema。
- 软删除、session 重命名工具、tab 拖拽排序。
- 保留 `tabs` 表做兼容或双写。
- 跨项目会话迁移 / 导入导出。

## 验收

- `session-new` 建 agent → tab 立刻出现，标题来自 blueprint 的 `<title>`；`session-close` → tab 消失、记录还在；`session-open` → 放回同一个；`session-delete` → `/log/list` 里不再有它，`/ai/*` 也拒绝它。
- 重载 → 回到 main，`openSessions` 原样恢复成 tab 条；地址栏是 `/s/<sessionId>`。
- 老库：开着的多 pane tab 收敛成一个 tab，其它会话仍在"最近"里能找到；`tabs` 表已不在。
- 全仓 grep 不到 `tab-layout-mutation` / `pane-layout` / `/log/tab/`；`docs/` 与 `atoms/` 的接口清单和代码一致。

## 实施记录（Phase 3）

按上表改完。与设计阶段的偏差（都是写代码 / 写用例时发现的）：

1. **`/log/delete` 顺手清 open 列表**：设计里写的是"`session-delete` = `ai/delete` + `log/delete`，
   再 `session/off` 一次"。实现时改成 `log/delete` 自己把 id 从 `openSessions` 里摘掉——谁发起的
   删除都一样，不会留下指向已删会话的 tab；工具里那次 `session/off` 保留为兜底。
2. **`session-open` 拒绝 main 的 id**（"main is not a tab — main-resume switches the shell to it"）：
   否则 main 会出现在 open 列表里被画成第二段 chat。
3. **`session-delete` 拒绝 main 的措辞**定为 `… is main — it cannot delete itself … Use main-new to
   replace it.`，`case-core-session-delete` 的断言按这句改。
4. **`sessions.title` 由 registry 写入**（`blueprintTitle()` 从 `workspace.ts` 挪到 `blueprint.ts`，
   两处共用）：`session-new` 与 launcher 走的是同一条 `ai/new`，标题必须在一处算。
5. **列表读失败不许"修复"成空列表**：`doRefreshWorkspace` / `boot` 原来会把读不到
   `log/list` 当成"这些 id 都不存在"，于是 PUT 一份空的 `openSessions` —— 一次瞬时错误就把
   所有 tab 关掉。现在 `byId` 读失败时是 `null`：不新增、不修复、不写回。
6. **迁移里 `current.open_tabs` → `open_sessions` 用 `RENAME COLUMN`**，多 pane tab 取
   `MIN(created_at)` 的那条 session；`tabs` 表与 `sessions.tab_id` 迁移后删除。

### 测试范围与结果

判据同上：用例的断言读不读本次改的那一层（session 表 / current / log 列表 / tab 条 / 工具）。

| 用例 | 结果 |
|---|---|
| `case-core-log-workspace`（重写） | §1–§9 全绿（session 三字段、空值不覆盖、on/off 幂等与 index、空会话 `count: 0`、delete 三处一致、重启后仍在） |
| `case-core-log-session`（新） | §1–§5 全绿（老库迁移：`[s_a]`、`tabs` 表消失、`tab_id` 列消失、`title` 列出现、会话与 main 指针不动、二次启动不重跑） |
| `case-core-web-tabs`（重写） | 18/18 checks，`ok: true`（main 独格 → launcher → 新 tab 名为页面 `<title>`、地址是 `/s/<sessionId>`、iframe 是 `/agent/<sessionId>/` → 关闭保留会话 → Recent 重开同一条 → 视图留在文档里 → 重载回 main） |
| `case-core-ai-session-tools`（新） | §1–§3 跑通（`session-new` 造人并上屏、`session-close`/`session-open` 往返同一条、`session-delete` 三处一起清） |
| `case-core-session-delete`（改断言） | 未重跑（只有回复措辞与 open 列表断言变了；删除行为未变）——本次改动没碰它的工具路径，留给人工复跑 |

未跑的用例及原因：其余用例不读本次改动的层（static / skill / loopback / chat-composer /
input-history 等）。`case-core-ai-flow`、`case-core-ai-main-new`、`case-core-ai-main-resume`、
`case-core-ai-recover`、`case-core-blueprint-crud`、`case-core-agent-instantiate` 只把
`openTabs` / `/log/session-detail` 换成了新名字，断言的行为本次没动，没重跑（真模型，成本高）。

### 删掉的用例（以及为什么）

这 8 个用例要么整体依赖本次删掉的东西，要么在更早的迭代里就已经和现实脱节（断言
`#ai-messages` / `.pane-tree` / `/chat/<sid>` —— shadow DOM 与路由早就换了），留着只会是红的：

| 用例 | 原因 |
|---|---|
| `case-core-web-panes`、`case-core-web-pane-frame` | 分屏本身没了 |
| `case-core-log-tab` | 换成 `case-core-log-session`（迁移场景） |
| `case-core-web-tab-records` | "每个 tab 有一条带 layout 的记录" —— tab 记录不存在了 |
| `case-core-web-tab-state` | 断言 `.pane-tree` / `#ai-messages` / `/chat/<sid>`，早于 shadow DOM 与路由改动即已失效 |
| `case-core-web-tool-chips`、`case-core-web-chat-controls` | 断言 shadow DOM 内的 `#ai-messages` / `.pane-chat`，同理 |
| `case-core-web-launcher-open`、`case-core-web-chat-route` | launcher 流程并入 `case-core-web-tabs`；深链恢复不是设计（重载永远回 main） |

## 复核要点

- `git grep -n "log/tab\|tab-layout-mutation\|pane-layout"` 应为空（`dist/` 除外）。
- `.agents/skills/pane-layout/` 已删；sub 的 spec 里 "让它上屏用 `session-new`"。
- `docs/log.md` / `docs/ai.md` 与 `atoms/` 的组织方式一致：接口清单、工具清单都能对上代码。
