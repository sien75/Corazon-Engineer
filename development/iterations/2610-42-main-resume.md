# main-list / main-resume：把早先的 main 对话放回屏幕

## 需求

1. main 增加 `main-resume`：按 id 把一段**早先的 main 对话**放回屏幕 —— 指针换回去、前端切过去、
   历史跟着回来。
2. 加 `main-list`：列出 main 自己的对话（id / 最后活动 / 消息数 / 首句），标出当前那段。
   没有它，`main-new` 换走之后 id 无处可查。
3. 上一轮 `2610-41` 里「老 main 留档但界面上没有入口」的决定作废。

## 现状（事实）

- `main-new` 只写 `current.main_session`，不动 records，所以老 main 一直都在、也一直可恢复。
- `/log/list` 已经返回 `sessionId / kind / createdAt / lastAt / count / preview`，按 `last_at` 倒序；
  ai 早就 consume 了它（`atoms/ai.yaml` 的 `log-list`）。**不需要新端点、不改契约。**
- `/log/session/detail` 只读 `sessions` 表（`workspace/log/internal/store/workspace.go:129`），而 ai 建
  会话时就写了这一行（`registry.writeSession`），所以「判 kind / 判存在」用它就够。
- `registry.resume(id)`：内存里有就直接返回，没有就按 `sessions` 行 + records 重建（`main` 角色读
  `agents/main` spec，无 blueprint 尾巴）。它就是"恢复"的真实实现。
- 前端不用改：`makeMainTab` 的 `engineer-tool` 正则已经是 `^(tab-|session-|main-)`，
  `doRefreshWorkspace()` 的「main 换了 session 就跟过去」分支对来回切换同样成立。

## 决策

1. `main-resume { sessionId }` 必填；id 从 `main-list` 拿（用户直接给也行）。
2. **先证明能恢复，再指屏幕**：校验 `kind: main` → `deps.resumeSession(id)`（live 是 no-op，只有记录
   就从记录重建）→ `/log/current/put` 换指针。前两步任一失败就报错，指针不动。
3. 幂等：目标就是当前 main → 直接回 `main is already …`，不写指针。
4. `main-list` 只列 `kind: main`，当前那段标 `*`，支持 `pageNum`（100 一段）。
5. 不做「不带参回上一段」：语义含糊（连续回退会来回跳），id 明确更可靠。
6. `main-new` 的文案改成「`main-resume` 能把它放回来」，别再说「没有回去的路」。

## 方案（改动清单）

| 位置 | 改动 |
|---|---|
| `workspace/ai/src/workspace.ts` | `WorkspaceDeps` 加 `resumeSession`；新增 `main-list` / `main-resume`；`main-new` 的文案与返回 |
| `workspace/ai/src/registry.ts` | `WORKSPACE_TOOLS` 加 `main-list` / `main-resume`；传 `resumeSession`（`resume` + 空则抛错） |
| `agents/main/AGENTS.md`、`agents/zh/main/AGENTS.md` | 工具清单 + 用法要点（回退方式、蓝图 agent 不是 main 对话） |
| `docs/ai.md`、`atoms/ai.yaml` | 同上（描述里的工具清单与 main 段落） |
| `development/testing/dev/case-core-ai-main-resume/` | 新用例 |

不新增 consumed 接口：`log-list` / `log-session-detail` / `log-current-put` 都已在 `atoms/ai.yaml` 里
（`log-current-put` 是 2610-41 加的），所以 `edges/` 也不用动。

## 工具的边界

- **只接 main 对话**：sub 的 id 被拒，并告诉模型「它的 tab 才是上屏幕的方式」（`tab-new` /
  `current-tab-mutation`）。`main-list` 也不列 sub。
- **不动 tab**：`openTabs` 原样写回；resume 只换 main 指针。
- **不 stop 当前这一轮**：换的是指针，老会话这一轮的输出照常落在它自己的记录里。
- **不清理**：没人指向的 main 仍然留在 log（`main-list` 以后还能看到它）。

## 测试

新增 `case-core-ai-main-resume`（端口 9030-9033，真模型）。要点：

| 节 | 钉住什么 |
|---|---|
| 1 | 两段 main（alpha / beta）+ 一段 sub，指针在 MAIN2 |
| 2 | `main-list` 从 MAIN2 调：记录里有 `name: main-list`，结果里两段 main 的 id 都在，sub 不出现 |
| 3 | `main-resume $MAIN1`：指针换回 MAIN1，结果文本是 `main is now …` |
| 4 | **重启 ai 之后**再 resume：MAIN2 只剩记录，`deps.resumeSession` 从记录重建它，指针换过去，问它还记得什么 → 答 beta |
| 5 | 拒绝：sub 的 id（"is a blueprint agent"）、编造的 id（"No conversation"）、自己（"already"）；指针不动 |
| 6 | sub 没有这两个工具（记录里 0 次 `name: main-list` / `name: main-resume`） |
| 7 | 浏览器：boot 在 MAIN2 上能看到 beta；让它 resume MAIN1 → DOM 换成 MAIN1，并且屏幕上出现 alpha |

## 不做

- 不带参的「回上一段」。
- 删掉没人指向的 main，或在 tab bar / launcher 里给 main 做历史入口（界面仍是模型驱动）。
- 给 `main-resume` 加「顺带 stop 当前这轮」。
- 跨项目的会话迁移 / 导入导出。

## 验收

- 上面 1–7 全绿。
- 手点一次：`main-new` 换走 → `main-list` 看到旧的那段 → `main-resume <id>` 回到它，历史在屏幕上。

## 实施记录（Phase 3）

按上表改完；`workspace/ai` 的 `bunx tsc --noEmit` 通过，`makeWorkspaceTools()` 列出
`current-tab-list, current-tab-mutation, main-list, main-new, main-resume, tab-new, tab-delete,
tab-layout-mutation`。前端一行没改。

### 测试范围与结果

判据：用例的断言读不读本次动的那一层（两个新工具 + 指针 + `engineer-tool` 帧引起的 DOM 切换）。

| 用例 | 结果 |
|---|---|
| `case-core-ai-main-resume`（新，真模型 deepseek-flash） | §1–§6 通过，§7 浏览器 4/4，`ok: true` |

实测要点：

- §2（**ai 重启后**）：`main-resume` 把只剩记录的 MAIN2 重建出来并换指针，问它开头的暗号答 `beta` ——
  恢复的是记录，不是内存。
- §3：`main-list` 输出两段 main、当前那段带 `*`、sub 不在（0 次），并且给出的 id 随后真的能用。
- §5：三种拒绝各一句话（`is a blueprint agent` / `No conversation s_deadbeef00` /
  `main is already …`），指针三次都没动。
- §7：boot 在 MAIN1（屏幕上是 alpha）→ 工具帧后 `<engineer-chat>` 换成 MAIN2，屏幕上出现 beta，
  `#panes` 里只剩一个元素，tab bar 与地址不变。

未跑的用例及原因：`case-core-ai-main-new` 的断言只读 `main-new` 与指针，本次没改它的行为
（只改了文案与返回的一句话）；其余用例不读本次改动的层。

### 顺手发现（写用例时撞到的两件事）

- **`main-resume` 的「already」分支不 resume**：目标就是当前 main 时直接返回，不进
  `deps.resumeSession`。这是对的（不需要动），但用例因此必须先把指针放到别处、让目标是真的
  「另一段」；第一版用例把指针留在 MAIN2 上，结果 §2 打的是 no-op，后面 `ask MAIN2` 直接 404
  （ai 里没有这个会话）。已按「先摆好指针」重写。
- **`main-list` 的预览会污染下一段会话的上下文**：`main-list` 的输出带着另一段 main 的首句，
  谁调过它，它的上下文里就有另一段的字眼。实测问「开头的暗号是什么」时模型被预览带偏，
  答了另一段的那句。用例因此把「历史回来了」的断言放在**调 `main-list` 之前**，并改问
  「最初给你的暗号」，只看最后一条 assistant 文本。
