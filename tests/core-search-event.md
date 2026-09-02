# Test: core-search-event

Global search + event SSE subscription. Test data comes from the `tests/.playground/` mock project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML. SSE events are YAML docs sent as one `data:` line per YAML line.

## Setup

```bash
# Prepare the mock project: tests/.playground is a minimal mock unrelated to the real project; place it at .corazon/.playground/
rm -rf .corazon/.playground && mkdir -p .corazon && cp -R tests/.playground .corazon/.playground
# Start the server under test with .corazon/.playground as project root
cd workspace/static && go build -o corazon . && ./corazon serve-static --root ../../.corazon/.playground --addr :7502 &
```

## 1. search hits an atom

```bash
curl -s -X POST http://localhost:7502/static/search \
  -H 'Content-Type: application/yaml' --data-binary 'q: demo-service'
```

Expected: 200, `results` is non-empty and contains an entry with `type=atom`, `file=atoms/demo-service.yaml`; `lines` is a 1-based line range and `snippet` holds the matched line.

## 2. search hits a contract

```bash
curl -s -X POST http://localhost:7502/static/search \
  -H 'Content-Type: application/yaml' --data-binary 'q: demo-api'
```

Expected: 200, `results` contains an entry with `type=contract`, `file=contracts/demo-api.yaml`.

## 3. search with empty query

```bash
curl -s -X POST http://localhost:7502/static/search \
  -H 'Content-Type: application/yaml' --data-binary 'q: ""'
```

Expected: 400, `error.code` is `bad_request`.

## 4. event subscription receives schema events

Terminal A (subscribe):

```bash
curl -N -X POST http://localhost:7502/static/stream \
  -H 'Content-Type: application/yaml' --data-binary 'env: dev'
```

Terminal B (trigger a mutation):

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: add
type: notes
id: notes/static/stream-test.md
notes: "# event test"
YAML
```

Expected: terminal A receives an SSE event — consecutive `data:` lines forming one YAML doc containing `seq`, `env: dev`, `ts`, `kind: schema`, `payload.op: add`, `payload.type: notes`, `payload.id: notes/static/stream-test.md`, and `payload.notes` holding the raw content.

Cleanup:

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary $'op: remove\ntype: notes\nid: notes/static/stream-test.md'
```

Expected: terminal A receives another event with `payload.op: remove`.

## 5. event kinds filter

```bash
curl -N -X POST http://localhost:7502/static/stream \
  -H 'Content-Type: application/yaml' --data-binary $'env: dev\nkinds: runtime'
```

Expected: connection established (with `: heartbeat` comments), but the schema mutation events above are not pushed (kind=schema filtered out).

## 6. event with unknown env

```bash
curl -s -X POST http://localhost:7502/static/stream \
  -H 'Content-Type: application/yaml' --data-binary 'env: nope'
```

Expected: 404, `error.code` is `not_found`.
