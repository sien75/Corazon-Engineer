# Test: core-ai-flow

AI session flow: new → ask → stream → delete.

## Setup

```bash
# ai service is stateless; start it directly (no project root needed)
cd workspace/ai && bun install && bun run src/main.ts --addr :7501 &
```

## 1. ai-new creates a session

```bash
SID=$(curl -s -X POST http://localhost:7501/ai/new | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
echo $SID
```

Expected: 200, returns a non-empty `sessionId`.

## 2. ai-ask

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
blocks:
  - type: text
    text: show me the architecture"
```

Expected: 200, `sessionId` equals `$SID`.

Error branches:

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
blocks: []"
```

Expected: 400, `error.code` is `bad_request`.

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: nope
blocks:
  - type: text
    text: hi"
```

Expected: 404, `error.code` is `not_found`.

## 3. ai-stream receives output

```bash
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: native pi events. `agent_start`; one or more `type=message_update`
events whose `assistantMessageEvent.type` is `text_delta` (carrying the
streamed reply); then `type=agent_settled`, after which the connection closes.
Events are YAML docs, one `data:` line per YAML line (SSE multi-line data).
Each event carries a per-session `seq`, and each SSE frame carries the same
value as its `id:`. (Without any authenticated LLM provider
— e.g. no `DEEPSEEK_API_KEY` — falls back to the echo stub, which emits the
same event shapes.)

## 3b. incremental replay and reconnect

A reconnecting client passes `since` (the last `seq` it rendered) and receives
only the events after it. If the session is idle and the client is caught up,
the server closes the stream immediately.

```bash
# replay only seq 5..end
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID
since: 4"
```

Expected: the first frame is `id: 5`, no earlier events, and the stream still
ends with `agent_settled`.

```bash
# caught up + idle: returns at once with no events
time curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID
since: 9999"
```

Expected: exits immediately with an empty body.

While a run is in flight, `/ai/resume` reports `active: true` so a client whose
stream was cut can reattach (it calls `/ai/stream` with `since = lastSeq` and
the missed events are replayed):

```bash
# in one shell: start a slow run
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
blocks:
  - type: text
    text: 'Run the shell command \"sleep 5\" with the bash tool, then reply done'"
# in another, while it runs:
curl -s -X POST http://localhost:7501/ai/resume -d "id: $SID"
```

Expected: `active: true` while the run is in flight (`false` once it settles);
`lastSeq` is the latest emitted seq.

## 4. shell commands run without approval

All tool calls run without approval; the agent runs shell commands and
external CLIs through the built-in `bash` tool.

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
blocks:
  - type: text
    text: run the date command in your shell"
```

In another terminal:

```bash
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: no approval event at all; tool calls surface as native pi
`tool_execution_start` / `tool_execution_end` events (with `toolName`, `args`,
`result`, `isError`), and the stream ends with `agent_settled`.

## 4c. records persist raw pi messages (tools included)

Conversation records store the pi message verbatim in `raw`, so a resumed
session replays tool calls and thinking, not just text. Images are stored as
sha256 refs, never base64.

```bash
curl -s -X POST http://localhost:7503/log/session-detail -d "sessionId: $SID"
```

Expected: each message carries `seq`, `role` (`user` | `assistant` | `toolResult`
| `compaction`), `content` (plain-text projection), and `raw` (the pi message).
The tool run above leaves an assistant message whose `raw.content` holds a
`toolCall` block, followed by a `toolResult` message with the tool output.
Any image content appears as `{ type: image, sha256, mimeType, size }`.

On resume, context is rebuilt from the latest `compaction` record onward, so
messages already summarized away are not sent to the provider again.

## 4b. ask_user and ai-answer

Force the agent to use the custom `ask_user` tool:

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
blocks:
  - type: text
    text: use the ask_user tool to ask me to choose between A and B"
```

Then stream: expected `tool_execution_start` with `toolName: ask_user` (its
`args.options` carry the choices) and `tool_execution_end` with
`result.terminate: true`, followed by `agent_settled` (the run ends and waits).

Answer via the dedicated endpoint, then stream again:

```bash
curl -s -X POST http://localhost:7501/ai/answer -d "id: $SID
answer: A"
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: a new run whose user message text is `A`, then `agent_settled`.
An empty `answer` returns 400 `bad_request`.

## 5. ai-delete removes the session

```bash
curl -s -X POST http://localhost:7501/ai/delete -d "id: $SID"
```

Expected: 200, `sessionId` equals `$SID`; afterwards:

```bash
curl -s -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: 404, `error.code` is `not_found`.

`ai-delete` only drops the live in-memory session; the conversation history
stays in log. Purge it too with `log/delete`:

```bash
curl -s -X POST http://localhost:7503/log/delete -d "sessionId: $SID"
```

Expected: 200, `sessionId` equals `$SID` and `deleted` counts the removed
conversation rows; afterwards `/log/list` no longer includes `$SID`. A missing
`sessionId` returns 400 `bad_request`.
