# Test: core-ai-flow

AI session flow: new → ask → stream → approval → delete.

## Setup

```bash
# Prepare the mock project: tests/.playground is a minimal mock unrelated to the real project; place it at .playground/
rm -rf .playground && cp -R tests/.playground .playground
# Start the server under test with .playground as project root
cd workspace/core && go build -o corazon . && ./corazon serve --root ../../.playground --addr :8080 &
```

## 1. ai-new creates a session

```bash
SID=$(curl -s -X POST http://localhost:8080/ai/new | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionId"])')
echo $SID
```

Expected: 200, returns a non-empty `sessionId`.

## 2. ai-ask

```bash
curl -s -X POST http://localhost:8080/ai/ask -d "{\"id\": \"$SID\", \"prompt\": \"show me the architecture\"}"
```

Expected: 200, `sessionId` equals `$SID`.

Error branches:

```bash
curl -s -X POST http://localhost:8080/ai/ask -d "{\"id\": \"$SID\", \"prompt\": \"\"}"
```

Expected: 400, `error.code` is `bad_request`.

```bash
curl -s -X POST http://localhost:8080/ai/ask -d '{"id": "nope", "prompt": "hi"}'
```

Expected: 404, `error.code` is `not_found`.

## 3. ai-stream receives output

```bash
curl -N -X POST http://localhost:8080/ai/stream -d "{\"id\": \"$SID\"}"
```

Expected: 2 SSE events in order:

1. `kind=markdown`, `seq=1`, `markdown` echoes the prompt
2. `kind=markdown`, `seq=2`, `done=true`, then the connection closes

## 4. approval flow

```bash
curl -s -X POST http://localhost:8080/ai/ask -d "{\"id\": \"$SID\", \"prompt\": \"add an atom, needs approval\"}"
```

In another terminal:

```bash
curl -N -X POST http://localhost:8080/ai/stream -d "{\"id\": \"$SID\"}"
```

Expected: a `kind=approval` event with `approval.approvalId` and `approval.title`; the connection stays open.

```bash
AID=<approvalId from the previous step>
curl -s -X POST http://localhost:8080/ai/approval -d "{\"id\": \"$SID\", \"approvalId\": \"$AID\"}"
```

Expected: 200, `granted=true`; the stream then receives `kind=markdown` (approval confirmation) and `done=true`, and closes.

Error branches:

```bash
curl -s -X POST http://localhost:8080/ai/approval -d "{\"id\": \"$SID\"}"
```

Expected: 400, `error.code` is `bad_request` (approvalId missing).

```bash
curl -s -X POST http://localhost:8080/ai/approval -d "{\"id\": \"$SID\", \"approvalId\": \"nope\"}"
```

Expected: 404, `error.code` is `not_found`.

## 5. ai-delete removes the session

```bash
curl -s -X POST http://localhost:8080/ai/delete -d "{\"id\": \"$SID\"}"
```

Expected: 200, `sessionId` equals `$SID`; afterwards:

```bash
curl -s -X POST http://localhost:8080/ai/stream -d "{\"id\": \"$SID\"}"
```

Expected: 404, `error.code` is `not_found`.
