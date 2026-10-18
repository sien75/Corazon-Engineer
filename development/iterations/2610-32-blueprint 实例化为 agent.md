# blueprint 实例化为 agent（类 / 实例收敛，技能发现下线）

> 概念收缩的一单：**类只剩 blueprint，实例只剩 agent**。blueprint 由“页面”变成“模板”，代价是实例化时要连文件一起复制；skill 退回成“给 agent 读的操作说明”，不再是任何入口，配套的技能发现整块删除。

## 需求

1. **类只有一个：blueprint。** 原型在 `.agents/blueprints/<slug>/`，目录里**只允许两个文件**：`README.md` + `index.html`；`index.html` 必须**自包含**（不能带同级的 js / css / 图片）。
2. **实例只有一个：agent。** new agent = 选中一个 blueprint → 把这两个文件**复制一份**、按 `sessionId` 绑定存起来；从此实例与 `.agents/blueprints/` 里的原型**再无关系**（改原型不影响已开的 agent）。
3. **复制的 `README.md` 就是 agent 一开始的上下文。**
4. **空白 agent 保留**：不选 blueprint，直接开一段对话。
5. **URL**：tab 用 `/tab/<tabId>`（当前是 `/chat/<sessionId>`）；agent 的 UI 用 `/agent/<sessionId>`（当前是 `/pages/<slug>`）。agent 的 URL 里**不出现 slug** —— 服务端读的是复制体，按 sessionId 定位。
6. **skill 就是 skill**：agent 自己知道去 `.agents/skills/` 找技能，不需要在提示里特殊说明；**技能发现整块删除**（`.engineer/suggested-skills/` + 扫描）。原「skill-chat / blueprint-page」两种对应关系作废，只剩「blueprint → agent」。
7. **删除**：沿用现状的硬删，复制体一起删，不做软删 / 回收。
8. 前端“怎么展示”这一层本轮先不动（static 除 validate 单之外不改）。

## 现状（事实）

| 层 | 现在 | 位置 |
|---|---|---|
| launcher | 两个“类”：skill（`run`）与 blueprint（`page`），外加 suggested 候选与 recents | `workspace/web/app.js:2952-3330` |
| 跑 skill | `ai-new` 建 session → skill 全文塞进 composer，**发送才开跑** | `app.js:3318` `newTabRun` |
| 开 blueprint | `openPageTab`，tab 无 session、无历史，pane 里 iframe 指 `/pages/<slug>/` | `app.js:2853-2878` |
| 路由 | `/` graph、`/new[/skills\|/blueprints]`、`/chat/<sessionId>`、`/pages/<slug>`、`/<section>` | `app.js:463-470` |
| tab 记录 | `tabId = t_<hex>` 来自 `/log/tab/new`，pane 树存在 log 的 `tabs` 表；前端另有本地 `tab.id = tab_xxxx` | `app.js:1478`、`workspace/log/internal/store/store.go:109` |
| pane 叶 | `paneId` + `contentType: chat \| page` + `contentId`（sessionId 或 blueprint slug）+ `flex` | `app.js:620-740`、`.agents/skills/pane-layout/SKILL.md` |
| 静态多根 | `--pages <project>/.agents/blueprints` 挂在 `/pages/`；`<dir>/` 默认取 `index.html` | `workspace/web/server/serve.go:68-182` |
| 技能发现 | `Suggester` 扫已 settle 的 run → 写 `.engineer/suggested-skills/<slug>.md` | `workspace/ai/src/skill/suggest.ts`（271 行）、`skill/store.ts`（301 行） |
| 技能发现外露 | `static-query.suggested-skills`、`static-query-detail` 的 `suggested-skill` 类型、launcher 的 suggested 分区 | `contracts/static-query*.yaml`、`app.js:3155/3235-3245` |
| 删除 | 硬删：`/ai/delete` dispose 内存 agent + `/log/delete` 清该 session 的 conversation 记录 | `workspace/ai/src/registry.ts:592`、`app.js:3634-3650` |
| 提示 | `agents/AGENTS.md` 把 skill 说成“跑一次开一段对话”，blueprint 是前端资源 | `agents/AGENTS.md` L22-23、L43-45 |

## 决策（已拍板）

1. 类 = blueprint，实例 = agent；`chat` / `page` 两个概念取消。
2. blueprint 原型两文件、`index.html` 自包含；实例化即复制，复制体与原型脱钩。
3. 复制体的 `README.md` = agent 初始上下文。
4. 空白 agent 保留。
5. tab 的 URL 用 log 的 `tabId`；agent 的 URL 用 `sessionId`，不带 slug。
6. skill 保留为可读说明，不再是入口；技能发现整块删除。
7. 删除沿用硬删，复制体一并删除。
8. 前端展示层本轮不动。

## 决策（补齐：原先的待定项已拍板）

1. **副本存文件系统**（原 A）：`.engineer/agents/<sessionId>/{README.md,index.html}`，web 的第二个根（`--agents`）指向它，挂 `/agent/`。原 `--pages` 根删除 —— 原型目录不再外露。
2. **复制在后端做**：`POST /ai/new { blueprint: <slug> }` —— ai 复制两文件并注入上下文。前端不再往输入框填内容。
3. **README 隐式追加**：顺序是 pi 基础 prompt → `agents/AGENTS.md`（+ runtime endpoints）→ **该 agent 的 README 最后**。用户一提问，它自然在上下文里。
4. **pane 只有一种内容**：叶子的 `contentType` 字段整块删除，只剩 `paneId` + `contentId`(sessionId) + `flex`。旧记录里的 `contentType` / `content` / `id` 仍按旧义读出，回写时按新形状。
5. **必须从 blueprint 建实例，空白 agent 取消**：没有 `index.html` 就没有可显示的东西，所以不存在空白 agent。建 tab 记录失败就停在 launcher，不进新 tab。
6. **每格一个 iframe**：pane = agent，agent 的 UI 就是它 blueprint 的 `index.html`，iframe 指 `/agent/<sessionId>/`。

## 已实现（本轮）

| 位置 | 改动 |
|---|---|
| `workspace/ai/src/blueprint.ts` | 新增：slug 校验、两文件规则、复制、按 sessionId 删副本 |
| `workspace/ai/src/registry.ts` | `new(blueprint?)`；按会话构造 resource loader（README 追加在最后）；`layout` 工具改为 `contentId` / `blueprint`，无 `contentType` |
| `workspace/ai/src/server.ts` | `/ai/new` 收 `blueprint`，`BlueprintError` → 400；`/ai/delete` 连副本一起删 |
| `workspace/ai/src/skill/` | 整块删除（技能发现下线），`registry.ts` 里 `Suggester` / `onRunSettled` / `oneShot` 一并删 |
| `workspace/web/server/serve.go` | `--pages` → `--agents`，前缀 `/pages/` → `/agent/`；`.md` 补 `text/markdown` |
| `workspace/web/app.js` | 路由 `/chat/<sid>` → `/tab/<tabId>`；pane 叶去 `contentType`；pane 一律 iframe；tab 记录先建、失败即停在 launcher；launcher 只列 blueprint + recents；`/new` 命令改为打开 launcher |
| 契约 | `ai-new`（`blueprint` + 400）、`ai-delete`、`static-query`（去 `suggested-skills`）、`static-query-detail`（去 `suggested-skill`） |
| atoms / edges | `ai`（描述、不再 consume static-validate）、`static`（去 suggested-skills、去 validate）、`web`（去 validate） |
| static 代码 | `ObjectTypes` / `TypeDirs` 去 `suggested-skill`；query 去 `suggested-skills` |
| 部署 | `--pages` → `--agents`（dev `launch.sh`、prod `launch.go`、两份 BOOK） |
| 提示 | `agents/AGENTS.md` + zh：blueprint 是类、agent 是实例、README 是开场上下文、两文件规则、skill 不再被实例化、技能发现已下线 |
| 项目 | 新增 `.agents/BLUEPRINT_how-to.md`（占位，写了三条规则）；9 个 blueprint 各补 `README.md` |
| 用例 | 新增 `case-core-agent-instantiate`；`case-core-web-serve` 改 `/agent/`；删除 `case-core-skill-suggest`、`case-core-web-page`（旧页面模型） |

## 验证（本轮真跑过）

- `case-core-agent-instantiate` 1–7 全过：复制两文件、`/agent/<sid>/` 供 200 且是该 agent 的 html、改原型不影响副本、第二个 agent 另起一份、第三个文件 400、坏 slug 400、删除后副本消失。
- `case-core-web-serve` 1–7 全过：shell / assets / `config.js` / `/agent/` 根 / `/tab/<id>` 落到 shell / 未知路径落 shell / 四个穿越 403、favicon 404。
- 浏览器（ego-browser）冒烟：`+` → launcher 列出 9 个 blueprint → 点 `hello` → tab 名 `Hello`、URL `/tab/t_985ba845e3ecef7e`、一格 iframe 指向 `/agent/s_fe7f9ea31521601b/`、iframe 标题 `Hello`；`reload` 后 tab 与 iframe 都从记录恢复。
- `case-core-static-query` / `case-core-static-stream`：validate 删除后仍正常（见 2610-33）。

## 收尾（用户点了后做的）

- `.agents/skills/pane-layout/SKILL.md` 改写为现状：叶子只有 `paneId` + `contentId`（已有 agent）+ `flex`，或 `blueprint: <slug>` 现开一个新 agent；"每格都是一个 agent，界面就是它 blueprint 的 index.html"；配方示例全部换成新形状。
- `development/testing/dev/case-core-blueprint-crud` 按现状重写并真跑：两文件清单、第三个文件只被 static 列出而在实例化时 400、缺 README → 404、追加写不动兄弟文件、副本不随原型变化、rm 即删除、无 CRUD 契约、跨类型 id → 400。
- 顺带修掉用例暴露的一个真问题：`static-query-detail` 原来只比对请求 id 的前缀，`type: blueprint` + `.agents/blueprints/../skills/x/SKILL.md` 会把 **skill 文件当 blueprint 返回**（项目内文件，不越界，但类型对不上）。现在先 clean 再判类型，返回 400 `it is a skill file, not a blueprint`；`docs/static.md` 的 400 说明补了这一条。

## 已知遗留（用户确认先不动）

1. **shell 的 chat 机制整块变成死代码**：pane 全是 iframe 后，`makeChatPane` / composer / 流渲染 / `ask_user` 的作答入口都不再有入口。对话与 `ask_user` 现在必须由 blueprint 页面自己实现 —— `.agents/BLUEPRINT_how-to.md` 要写清这套契约，然后删掉死代码。
2. **旧 tab 记录**：这次改动前建的 agent 没有副本，重新打开时 `/agent/<sid>/` 落到 shell，iframe 里会嵌一层外壳。需要一次性清理或给个空态。

## 方案骨架

### ai（`workspace/ai/`）
- 删 `src/skill/suggest.ts` 与 `src/skill/store.ts` 的 suggested 部分；`registry.ts` 里 `onRunSettled` / `Suggester` 的接线一并删。
- `ai-new` 增加可选 `blueprint`，按待定 1/2/3 的结论做复制与上下文注入。
- `layout` 工具的 content 类型校验按待定 4 调整。

### web（`workspace/web/`）
- 路由：`/chat/<sessionId>` → `/tab/<tabId>`；`/pages/<slug>` → `/agent/<sessionId>`；`/new/blueprints` 保留为 blueprint 列表页，`/new/skills` 去掉。
- launcher：blueprint 为唯一“类”，加“空白 agent”入口，suggested 分区删除。
- pane：blueprint agent 的格子是 iframe（`/agent/<sessionId>/`），空白 agent 的格子是对话；同一 session 两格 = 共同消费一条流（`aiHubs` 已支持）。

### web server（`workspace/web/server/serve.go`）
- `--pages` → 指向复制体根目录（待定 1 的结论）；前缀 `/pages/` → `/agent/`。
- `<dir>/` 默认取 `index.html` 恰好成立（复制体就叫 `index.html`）。

### log
- `tabs` 表不动（布局仍按 `tabId` 存）。选 B 才加表。

### 部署
- `how-to/deploy/dev/launch.sh`、`how-to/deploy/prod/launch.go`、两份 `BOOK.md` 里的 `--pages` 参数或新增根参数。

### 提示
- `agents/AGENTS.md`（+ `agents/zh/AGENTS_zh.md`）：概念段改写 —— blueprint 是唯一的类、README 是 agent 的初始上下文、skill 不再能实例化、技能发现已下线。
- 项目 `AGENTS.md`：加一句“blueprint 照 `.agents/BLUEPRINT_how-to.md` 模板写”（模板文件先留空）。

## 契约与静态关系

| 变更 | 对象 |
|---|---|
| `ai-new` 加 `blueprint?` | `contracts/ai-new.yaml` |
| 新增（选 B 时）实例副本读写 | 新契约 + `atoms/log.yaml` + edge |
| `static-query` 去 `suggested-skills` | `contracts/static-query.yaml`、`workspace/static/internal/schema/schema.go` |
| `static-query-detail` 去 `suggested-skill` | `contracts/static-query-detail.yaml` |
| `blueprints` 清单改为列目录（README.md + index.html） | 同上（本轮可后置） |
| atoms 描述改写 | `atoms/ai.yaml`、`atoms/static.yaml`、`atoms/web.yaml` |
| edges 复核 | `web-to-ai`（new 带 blueprint）、`web-to-log`（若选 B 新增实例读写）、`ai-to-log` 不变 |

## 顺序

契约 → atoms/edges → `development/testing/` 用例 → `workspace/` 代码 → 按 `how-to/deploy/dev/BOOK.md` 重打包、跑覆盖到的用例 → 人工评审。

> 关联单：`validate` 链路下线（`2609` 待补记录）与本单独立，不互相阻塞；`.agents/skills/` 本轮不动，`validate-schema` 会指向已删接口，作为已知遗留记着。
