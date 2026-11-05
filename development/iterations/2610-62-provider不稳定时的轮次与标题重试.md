# provider 不稳定时的轮次与标题重试

## 需求

provider 抖动时有两个症状要收掉：

1. **对话中途「断了」**：一轮里 provider 报错，页面停在半截并且看不到错误，用户只能再问一遍。
2. **标题没生成**：第 1 轮后标题不变（这次会话就是如此）。

要求：标题最多试 3 次；轮次失败要按退避重试 —— 10s、20s、30s、…、90s，全部用尽才算失败。

## 现状（实测）

- `workspace/ai/src/registry.ts` 的 `runTurn()`：`agent.prompt()` 抛错 → 立刻 `appendError("ai_error")`。
- pi 的 `AgentSession._runAgentPrompt()` 在 `finally` 里发 `agent_settled`（成功失败都发）。
  registry 把这个事件原样转发 → 页面的 `chat.js` 收到 `agent_settled` 就 `finish()` 收工，
  而随后到达的 `error` 事件开在已关闭的流上。**用户看到的就是「断了」：没有错误，没有回答。**
- `generateTitle()`：`completeSimple()` 单次调用，`maxRetries: 1`，失败即无声放弃（只留 dbg）。

## 方案

**A. 扣住 agent_settled（`registry.ts`）**

- 新增 `Sess.settledEvent`：pi 发来的 `agent_settled` 只记下、不转发。
- `runTurn()` 的 `finally` 才把这一轮最后一次 attempt 的 settled 转发出去；pi 从未 settle 过
  （preflight 就抛）时仍照旧合成一个。这样「流在什么时候关」由 ai 而非 pi 决定。
- `server.ts` 关流逻辑不变：仍然看 `agent_settled` / `session_title` / `compaction_end`。

**B. 轮次退避重试（`registry.ts` 的 `promptWithRetry()`）**

- 阶梯 `TURN_RETRY_DELAYS_MS = [10,20,…,90]s`，共 9 次重试；用尽才 `appendError("ai_error")`。
- 重试期间维持 `sess.active = true`、清掉本轮的 `settledEvent` / `sawSettled` / `titling`，
  流保持打开，标题也仍然等到这一轮真正结束。
- 用户点了停止（`stop()` 置 `Sess.aborting`）不重试；等待中被停止则直接收工。
- 半截回答不回收：失败 attempt 已经吐出的正文留在原处，重试的回答接在下面。

**C. 标题 3 次（`title.ts` + `registry.ts`）**

- 新增 `TITLE_ATTEMPTS = 3`、`TITLE_RETRY_DELAY_MS = 1000`；单次 `TITLE_TIMEOUT_MS = 15000` 是唯一的时间限制
  （不再设总预算：三次满打满算 47s，占住的只是一条连接和晚到的 tab 名，这一轮早已 `agent_settled`）。
- `generateTitle()` 循环三趟：报错或清洗后为空都算失败，隔 1s 再试。用尽仍无名 → 保持原名（无声，不报错）。

不改：`titleMaterial` / `cleanTitle` 的规则、标题只总结第 1 轮、`dist/`。

## 验收

1. `cd workspace/ai && npx tsc --noEmit` 通过。
2. `case-core-ai-session-title` 第 0 段（纯函数）PASS，第 1 段真模型用例仍能拿到新标题。
3. 手工：断网/掐 provider 后再发一轮，页面不出现「半截 + 无错误」，日志里能看到
   `runTurn retry` 与最终 `title`。
