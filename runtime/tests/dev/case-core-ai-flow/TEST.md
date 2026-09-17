# Test: core-ai-flow

AI session flow: new → ask → stream → approval → delete.

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

Expected: one or more `kind=markdown` events carrying the assistant's streamed reply; the last has `done=true`, then the connection closes. Events are YAML docs, one `data:` line per YAML line (SSE multi-line data). (Without any authenticated LLM provider — e.g. no `DEEPSEEK_API_KEY` — falls back to the echo stub.)

## 4. approval flow

The `http` tool never requires approval. The `cli` tool is gated **per
program**: the first use of a program emits a `kind=approval` event; once
approved, that program runs freely (remembered in `.corazon/ai-approved-cli.json`).

```bash
curl -s -X POST http://localhost:7501/ai/ask -d "id: $SID
prompt: run the date program using your cli tool"
```

In another terminal:

```bash
curl -N -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: a `kind=approval` event with `approval.approvalId` and `approval.title` (e.g. `cli: date`); the connection stays open.

```bash
AID=<approvalId from the previous step>
curl -s -X POST http://localhost:7501/ai/approval -d "id: $SID
approvalId: $AID"
```

Expected: 200, `granted=true`; the stream then receives `kind=markdown` (the command output report) and `done=true`, and closes. A later ask that uses the same program produces no new approval event.

Error branches:

```bash
curl -s -X POST http://localhost:7501/ai/approval -d "id: $SID"
```

Expected: 400, `error.code` is `bad_request` (approvalId missing).

```bash
curl -s -X POST http://localhost:7501/ai/approval -d "id: $SID
approvalId: nope"
```

Expected: 404, `error.code` is `not_found`.

## 5. ai-delete removes the session

```bash
curl -s -X POST http://localhost:7501/ai/delete -d "id: $SID"
```

Expected: 200, `sessionId` equals `$SID`; afterwards:

```bash
curl -s -X POST http://localhost:7501/ai/stream -d "id: $SID"
```

Expected: 404, `error.code` is `not_found`.
