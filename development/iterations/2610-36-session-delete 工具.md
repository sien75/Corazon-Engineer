# 给 main 加 session-delete：删一段对话，但不许删自己

## 需求

1. main 增加第 8 个工作区工具 `session-delete`：按 `sessionId` **硬删**一段对话。
2. **拒绝删除 main 自己**（正在对话的这个会话），其余一律硬删。
3. 被 tab 显示的会话照样能删 —— 那个 tab 之后留成死格子（用户选 A）。
4. sub（蓝图实例）仍然没有这个工具。

## 现状（事实）

- 硬删已经存在，不需要新写：`registry.deleteSession(id)` = 摘下内存 agent（`delete()`）+ 删 `.engineer/agents/<id>/` 副本（`removeAgent()`）+ `POST /log/delete` 清记录、清 `sessions` 行、若它是 `current.main_session` 则清指针（`registry.ts:273-284`）。目前只有 `tab-delete` 在用它。
- `/log/delete` 对不存在的 id 也回 200（`deleted: 0`，`contracts/log-delete.yaml` 没有 404 分支），所以**工具必须先做存在性检查**，否则打错 id 会"成功"。
- `sessionExists` 的注释写的是「live 会话、`sessions` 行（实例化出来的 agent）、或已记录的历史」，实现只查了 live + 历史（`registry.ts:289-293`）—— 注释与代码不符，后果是「实例化出来但还没问过」的 agent（有 `sessions` 行和副本、没有记录）会被判成不存在，既进不了 `tab-on`，也删不掉。
- `WORKSPACE_TOOLS`（`registry.ts:32`）是 pi 的 allowlist，按**名字**放行；工具写了但名字没进这个数组 = 工具被禁用。

## 决策

1. **语义复用**：`session-delete` = 包一层 `deps.deleteSession`，不新增删除路径、不改 log。
2. **守卫只有一条**：`sessionId === 自己` → 拒绝并说明原因。删 main 的**旧**会话（clear 之前的）允许 —— 它不是自己。
3. **不清理 tab 布局**：删掉的会话在 tab 里留下死 pane，前端已有提示（打开时会 toast「this conversation has no page any more」）。要连 tab 一起删就用 `tab-delete`。
4. **存在性检查用 `deps.hasSession`**，同时把 `sessionExists` 的实现补上 `sessions` 行，让代码追上注释（否则「实例化但没问过」的 agent 删不掉）。
5. **契约不动**：工具不是 HTTP 接口，`contracts/` 里没有它的位置；schema 只改 `atoms/ai.yaml` 里 main 工具清单那段描述。

## 方案（改动清单）

| 位置 | 改动 |
|---|---|
| `workspace/ai/src/workspace.ts` | `WorkspaceDeps` 加 `selfId: string`；新增 `sessionDelete` 工具，加入返回数组 |
| `workspace/ai/src/registry.ts` | 传 `selfId: sess.id`；`sessionExists` 补 `sessions` 行；`WORKSPACE_TOOLS` 加 `"session-delete"` |
| `atoms/ai.yaml` | 描述里 main 的工具清单加 `session-delete` |
| `agents/main/AGENTS.md`、`agents/zh/main/AGENTS.md` | 工具清单与用法要点各加一条（自删被拒、死 pane 用 `tab-delete`） |
| `development/testing/dev/case-core-session-delete/` | 新用例：`desp.yaml` + `TEST.md` |

工具描述里要写清楚三件事，模型才不会误用：删的是整段对话（agent + 记录 + 副本）、不可逆、不许删自己；以及「只想让它离开屏幕」应该用 `tab-off`。

## 验证

- 起 ai（真模型），main 里让它删一个新开的 sub：`log/session/detail` 变 404、`log/list` 里没有它、`.engineer/agents/<id>/` 消失。
- 让它删自己：工具回错，会话仍能被 ask（记录条数不减）。
- 让它删一个编造的 id：回错，不是「已删除」。
- 跑 `case-core-session-delete` 1–4；顺带回归 `case-core-log-workspace`（log 侧删除行为没变）。

## 遗留

- 死 pane 不清理（选 A 的代价）。将来若要，得在删除后遍历所有 tab 把该 `contentId` 摘掉。
- 用例靠模型驱动，需要一个已认证的 provider；没有 provider 时只能验证到「工具存在、不会被调用」。
- 与 `tab-delete` 的重叠是刻意的：`tab-delete` 按 tab 删（含 tab 记录），`session-delete` 按会话删（不动 tab）。
