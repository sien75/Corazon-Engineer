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
prompt: show me the architecture"
```

Expected: 200, `sessionId` equals `$SID`.

Error branches:

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
prompt: ''"
```

Expected: 400, `error.code` is `bad_request`.

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: nope
prompt: hi"
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
Each event carries a per-session `seq`. (Without any authenticated LLM provider
— e.g. no `DEEPSEEK_API_KEY` — falls back to the echo stub, which emits the
same event shapes.)

## 4. shell commands run without approval

All tool calls run without approval; the agent runs shell commands and
external CLIs through the built-in `bash` tool.

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
prompt: run the date command in your shell"
```

In another terminal:

```bash
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: no approval event at all; tool calls surface as native pi
`tool_execution_start` / `tool_execution_end` events (with `toolName`, `args`,
`result`, `isError`), and the stream ends with `agent_settled`.

## 4b. ask_user and ai-answer

Force the agent to use the custom `ask_user` tool:

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
prompt: use the ask_user tool to ask me to choose between A and B"
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
