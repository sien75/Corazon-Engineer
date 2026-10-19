# main-new：给 main 换一段新对话

## 需求

1. main 增加一个工作区工具 `main-new`：新建一段 main（`kind: main`）会话。
2. 工具帧到了以后**前端真的切过去**：屏幕上的 main 变成那段新会话。
3. 老的 main 会话怎么处理：用户选 **replace** —— 记录留在 log，界面上没有入口切回。

## 现状（事实）

- main 是 shell 自带的唯一会话，指针是 `log.current.main_session`（单值，见
  `contracts/log-current-get.yaml`）；web 的 `boot()` 在没有指针时用 `/ai/new {kind: main}` 建一个并写回去。
- `/ai/new` 已经接受 `kind: main`（`workspace/ai/src/server.ts`），`registry.new(undefined, "main")`
  走 `agents/main` spec + `WORKSPACE_TOOLS`；`WORKSPACE_TOOLS`（`registry.ts:32`）是 pi 的**按名字** allowlist。
- 前端 `makeMainTab()` 造的 `<engineer-chat>` 监听 `engineer-tool`，但只对 `/^(tab-|session-)/` 调
  `refreshWorkspace()`（`workspace/web/app.js:193`）—— 名字叫 `main-new` 的工具不会触发任何刷新。
- `doRefreshWorkspace()` 里**已经有**「main 换了 session 就跟过去」的分支（`app.js:353-360`）：
  `dropMainTab()` → 按新 id `makeMainTab()` → 替换 `openTabs[0]` → 若当时正在看 main 就
  `activateTab("main","replace")`。切换逻辑本身是现成的，缺的只是触发点。
- 契约：`/ai/new` 已收 `kind: main`，`/log/current/put` 已收 `mainSession`。ai 目前 consume 了
  `log-current-get`，**没有** consume `log-current-put`（`atoms/ai.yaml` / `edges/ai-to-log.yaml`）。

## 决策

1. **换指针，不多开**：`main-new` = `registry.new(undefined, "main")` + 读 `/log/current/get` 拿
   `openTabs` + `/log/current/put` 把 `mainSession` 换成新 id（`openTabs` 原样写回，不碰 tab）。
2. **老 main 不删、不停、不清理**：records 留在 log（用户选 replace）；界面上没有入口，要查用 log。
3. **不新增 HTTP 端点、不改契约**：`ai-new` 与 `log-current-put` 已经够用；工具不是接口，
   `contracts/` 里没有它的位置。schema 侧只是在 `atoms/ai.yaml` 加一条 consumed 接口、在
   `edges/ai-to-log.yaml` 加一条边。
4. **前端只加一处**：`makeMainTab` 的 `engineer-tool` 正则 `^(tab-|session-)` → `^(tab-|session-|main-)`，
   其余交给已有的「跟过去」分支。
5. **不给 `switch: false`**：工具只有「换」这一种语义；不想换就别调。

## 方案（改动清单）

| 位置 | 改动 |
|---|---|
| `workspace/ai/src/workspace.ts` | `WorkspaceDeps` 加 `newMainSession: () => Promise<string>`；新增 `main-new` 工具（无参数），加入返回数组 |
| `workspace/ai/src/registry.ts` | `WORKSPACE_TOOLS` 加 `"main-new"`；customTools 传 `newMainSession` |
| `workspace/web/app.js` | `makeMainTab` 的 `engineer-tool` 正则加 `main-` |
| `atoms/ai.yaml` | 描述里的 main 工具清单加 `main-new`；consumes 加 `log-current-put` |
| `edges/ai-to-log.yaml` | 新增 `ai-to-log-current-put` |
| `agents/main/AGENTS.md`、`agents/zh/main/AGENTS.md` | 工具清单 + 使用要点 |
| `docs/ai.md` | Tools 段加一条 |
| `development/testing/dev/case-core-ai-main-new/` | 新用例（`desp.yaml` + `TEST.md`） |

### 工具描述里必须写清楚的

换掉的是**屏幕上的** main，不是这段对话的记录；调用之后自己写的字用户再也看不到（所以要先说完），
老会话留在 log 但界面没有回去的路。否则模型会以为这是「开个副窗口」。

### 失败与清理

`/log/current/put` 失败 → 删掉刚建的会话（不留没人指向的 main）→ 返回错误。成功时返回新旧两个 id，
便于模型/用户查 log。

## 测试

新增 `case-core-ai-main-new`（端口 9020-9023）：

1. 建 `MAIN1` 并写进 current；让 main 调 `main-new`：`current.mainSession` 变成新 id、新 id 的
   `sessions` 行 `kind: main`、`MAIN1` 的记录还在。
2. 新的 main 是真的 main：能回答，`session/detail` 仍是 `kind: main`。
3. sub 没有这个工具（名字不在它的 allowlist 里）。
4. 浏览器：在 web 的 main 里让它调 `main-new`，断言 `#panes engineer-chat` 的 `session` 变成新 id、
   旧元素已从 DOM 摘掉、tab 还是 main、地址仍是 `/`。

⚠️ 需要真模型：工具只能由模型调用，没有 HTTP 入口（与 `case-core-session-delete` 同一约束）。

## 不做

- 多 main 会话 / 切回老 main 的入口（tab bar 下拉、launcher 的 main 区、session 列表）—— 用户选 replace。
- 调 `main-new` 时 `stop` 当前这一轮：换的只是指针，老会话这一轮的输出照常落到它的记录里。
- 清理老 main 的 records / 内存里的 agent / `.engineer/agents/<id>/` 早期副本。
- `main-new` 带参数（blueprint / 指定 id / 只建不切）。

## 验收

- 上面 1–4 全绿。
- 手点一次：在 main 里说「换一个新的 main 对话」，屏幕变成空的新 main，老记录仍能从 log 查到。

## 实施记录（Phase 3）

按上表改完；`workspace/ai` 的 `bunx tsc --noEmit` 通过。`serve-web` 直接读 `--assets` 目录，
`app.js` 改完 reload 即生效；ai 是 Bun 进程，**改 `src/*.ts` 要重启才生效**（运行中的 dev 栈
另外重启，本轮的验证用一套独立端口 / 独立 root 的栈，没动 7501 那个）。

### 测试范围与结果

判据：用例的断言读不读本次动的那一层（工具的指针写入 + `engineer-tool` 帧引起的 DOM 切换）。

| 用例 | 结果 |
|---|---|
| `case-core-ai-main-new`（新，真模型 deepseek-flash） | §1–§3 通过，§4 浏览器 4/4，`ok: true` |
| 同上，**未修前端**（只把 `app.js` 那一行正则还原） | `dom_after` 不变、`log_now` 已是新 id：指针走了、屏幕没动 —— 即本次要修的现象 |

§1 实测：`current.mainSession` `s_18e3dc30…` → `s_f7a0e5b7…`，`openTabs` 仍是 `[]`，
新会话 `kind: main`，老 main 的 `session/detail` 仍 200 且记录里有 1 次 `name: main-new`。
§2：新 main 回答正常（`alive`），指针没再动。§3：sub 的记录里 0 次 `main-new`，指针对。
§4：boot 落在指针上 → 工具帧后 `#panes engineer-chat` 的 `session` 变成新 id、旧元素从 DOM 摘掉、
tab bar 仍是 main、地址仍是 `/` → 新 main 还能再答一轮。

未跑的用例及原因：其它用例的断言不读本次改动的任何一层（ai 的工具清单 / `engineer-tool`
的前缀 / `current` 指针），给不出回归信号；`case-core-log-*` 侧的行为没改（只是多一个
`/log/current/put` 的调用方）。

### 顺手发现（未做）

- `case-core-session-delete` 里 `ask()` 把提示词直接拼进 YAML 映射值，提示词里带 `: ` 就会
  `YAMLParseError`（本用例第 2 节的提示词正好踩到，所以新用例的 `ask()` 改用 JSON 体）。
- `case-core-session-delete` 断言的 `session-delete` 工具在 2610-39 已经删掉了，那条用例现在是
  空转的；属于另一笔欠账。

> **后续**：2610-42 加了 `main-list` / `main-resume`，本文「老 main 没入口切回」的决定作废；
> 指针的写入方式（`/log/current/put`，open list 原样写回）沿用。
