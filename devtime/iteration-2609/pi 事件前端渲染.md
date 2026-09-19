# pi 事件前端渲染

## 目标

- ai 服务以 **pi 原生事件格式** 向 web 转发，不再用 Corazon 自定义的 `kind`。
- 事件类型收敛为 **2 种**：`pi event`、`error event`。
- ai 服务 **转发全部** pi 事件类型；web 当前只消费其中一部分（回答 / thinking / 工具调用 / 边界），其余忽略、留待将来。

## 一、事件类型

线格式仍是 YAML（每个 YAML doc 拆成多行 `data:`），SSE 承载。

### 1. `pi event`

信封 = `{ seq }` + pi 原事件，`type` 直接沿用 pi 的名字。

```yaml
seq: 3
type: message_update
message: { role: assistant, ... }        # pi 原字段，透传
assistantMessageEvent:
  type: text_delta
  contentIndex: 0
  delta: "你好，"
  partial: { role: assistant, ... }      # pi 原字段，透传
```

（上例示意；实际原样透传 pi 事件，含 `message` / `partial` 等大快照，不做裁剪。）

- 外层事件来自 `AgentSessionEvent`（`AgentEvent` ∪ session 扩展）。
- `message_update` 内层 `assistantMessageEvent`（`AssistantMessageEvent`）随之外露。
- 转发 **全部** `type`，包括暂不渲染的（`compaction_*` / `auto_retry_*` / `queue_update` …）。

### 2. `error event`

pi 本身有 error 类型，但只在 **内层 assistant 消息流**：

```ts
// pi-ai: AssistantMessageEvent
{ type: "error"; reason: "error" | "aborted"; error: AssistantMessage }
```

它随 `message_update` 以 `pi event` 形式透传，不需要单独处理。

但 HTTP 层 / session 层的错误（`bad_request` / `not_found` / 内部异常）不属于任何 pi 事件，无法用 pi 事件表达。为此定义第 2 种事件，**形状复用 pi 的 error**：

```ts
// Corazon: 非 pi 来源的错误，复用 pi 的 { type, reason, error } 形状
{
  seq: number;
  type: "error";
  reason: "error" | "aborted";
  error: { code: string; message: string };
}
```

```yaml
seq: 5
type: error
reason: error
error:
  code: not_found
  message: "session not found"
```

- `type: "error"` / `reason` 沿用 pi 语义；`error` 因不是模型消息，轻量化为 `{ code, message }`（pi 里是完整 `AssistantMessage`）。
- 外层 pi 事件的 `type` 集合里没有 `"error"`（`error` 只出现在内层 `assistantMessageEvent`），因此不冲突。

## 二、ai 服务转发策略

- 转发全部 pi 事件（外层 + 内层），**原样透传**，不区分 delta / 全量，先不做 payload 裁剪。
- **终态**：用 `agent_settled` 作为一轮 run 的真正结束并关流，替换当前自造的 `done`（现在靠 `server.ts` 的 done 关流）；`agent_end` 会因重试 / 压缩出现多次，不能用。
- 保留 `seq` 单调递增，前端按序追加。

> 体积优化（逐 token 携带 `message` / `partial` 快照的放大问题）留待后续，透传稳定后再谈。

## 三、web 消费范围

| pi 事件 | 用途 | 消费 |
| --- | --- | --- |
| `message_update` → `text_delta` | 回答正文 | ✅ |
| `message_update` → `thinking_delta` | thinking | ✅ |
| `tool_execution_start` / `_update` / `_end` | 工具调用卡片 | ✅ |
| `agent_start` / `agent_settled` | 本轮 loading 起止 | ✅ |
| `turn_start` / `turn_end` | 分段（可选） | ○ |
| `message_start` / `message_end` | 消息边界（可选） | ○ |
| 其余（`compaction_*` / `auto_retry_*` / `queue_update` / …） | — | ❌ 忽略 |

## 四、web 渲染

- **回答**：`text_delta.delta` 追加到当前 assistant 气泡；`message_start`(role=assistant) 开新气泡。
- **thinking**：`thinking_delta.delta` 追加到可折叠的 thinking 块；`thinking_start/end` 控制显隐。
- **工具调用**：`tool_execution_start` 建卡片（toolName + args）；`tool_execution_update` 更新进度；`tool_execution_end` 填结果 / `isError`。`ask_user` 走特殊渲染（见 `tool 设计.md`）。
- **状态**：`agent_start` 显示进行中，`agent_settled` 收起。
- **error**：外层 `type: "error"` 或内层 `assistantMessageEvent.type === "error"` 都渲染为错误提示。

## 五、契约调整

`contracts/ai-stream.yaml`：

- 删除 `kind: markdown | question | error`。
- 改为 `type: <pi 事件名> | "error"`；`error` 分支复用 pi 形状。
- 其余字段随对应 `type` 出现。

## 六、不做

- 不再为回答 / thinking / 工具调用自定义 `kind`——一律 pi 原生。
- `question` 不设独立事件类型：走 `ask_user` 内置工具（见 `tool 设计.md`）。
- compaction / retry 等暂不渲染，但转发，前端可后续启用。
