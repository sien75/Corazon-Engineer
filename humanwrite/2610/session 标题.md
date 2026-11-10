# session 标题：按对话自动总结

## 需求

- 时机：第 1 / 11 / 21 … 次用户提问时，各触发一次（间隔 10 轮）。
- 输入：只总结**用户提问**，不含 AI 回复。
- 输出：简短、清晰、表明意图的标题；用户用什么语言就用什么语言。
- 动作：总结完直接 set 到 `sessions.title`（log 的 `/log/session/upsert`，非空覆盖）。
- 并行：总结与对话本身并行，不阻塞回答。

## 现状

- `sessions.title` 只在 `ai/new` 时从 blueprint 页面的 `<title>` 快照一次，之后不再更新。
- 前端 tab 名来自打开工作区时的一次 `/log/list`，之后不刷新；launcher 的 Recent 每次打开重拉，能看到新值。

## 阻塞点：没有 agent 通信机制

- 后端 set 完，tab bar 要等下一次刷新工作区才变。
- `/ai/stream` 是**按会话**的 SSE，订阅方是 iframe 里的 `chat.js`；tab bar 在父窗口 `app.js`，收不到。
- 所以需要一条跨窗口的通知通道（child `postMessage` → 父窗口监听，或父窗口轮询 `/log/list`），现在没有。
- 补：将来真做时，事件格式沿用现有 SSE 信封即可：
  `{ seq, type: "session_title", sessionId, title }`。

结论：需求记下，等通信机制有了再落地。
