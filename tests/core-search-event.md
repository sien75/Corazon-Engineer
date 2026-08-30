# Test: core-search-event

Global search + event SSE subscription. Test data comes from the `tests/.playground/` mock project.

## Setup

```bash
# Prepare the mock project: tests/.playground is a minimal mock unrelated to the real project; place it at .corazon/.playground/
rm -rf .corazon/.playground && mkdir -p .corazon && cp -R tests/.playground .corazon/.playground
# Start the server under test with .corazon/.playground as project root
cd workspace/static && go build -o corazon . && ./corazon serve-static --root ../../.corazon/.playground --addr :7502 &
```

## 1. search hits an atom

```bash
curl -s -X POST http://localhost:7502/static/search -d '{"q": "demo-service"}'
```

Expected: 200, `results` is non-empty and contains an entry with `type=atom`, `file=atoms/demo-service.yaml`; `lines` is a 1-based line range and `snippet` holds the matched line.

## 2. search hits a contract

```bash
curl -s -X POST http://localhost:7502/static/search -d '{"q": "demo-api"}'
```

Expected: 200, `results` contains an entry with `type=contract`, `file=contracts/demo-api.yaml`.

## 3. search with empty query

```bash
curl -s -X POST http://localhost:7502/static/search -d '{"q": ""}'
```

Expected: 400, `error.code` is `bad_request`.

## 4. event subscription receives schema events

Terminal A (subscribe):

```bash
curl -N -X POST http://localhost:7502/static/stream -d '{"env": "dev"}'
```

Terminal B (trigger a mutation):

```bash
curl -s -X POST http://localhost:7502/static/mutation -d '{
  "op": "add", "type": "notes", "id": "notes/static/stream-test.md",
  "notes": "# event test\n"
}'
```

Expected: terminal A receives an SSE `data:` event whose JSON contains `seq`, `env=dev`, `ts`, `kind=schema`, `payload.op=add`, `payload.type=notes`, `payload.id=notes/static/stream-test.md`, and `payload.notes` holding the raw content.

Cleanup:

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -d '{"op": "remove", "type": "notes", "id": "notes/static/stream-test.md"}'
```

Expected: terminal A receives another event with `payload.op=remove`.

## 5. event kinds filter

```bash
curl -N -X POST http://localhost:7502/static/stream -d '{"env": "dev", "kinds": "runtime"}'
```

Expected: connection established (with `: heartbeat` comments), but the schema mutation events above are not pushed (kind=schema filtered out).

## 6. event with unknown env

```bash
curl -s -X POST http://localhost:7502/static/stream -d '{"env": "nope"}'
```

Expected: 404, `error.code` is `not_found`.
