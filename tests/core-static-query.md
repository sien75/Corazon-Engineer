# Test: core-static-query

Contract conformance for static-query / static-query-detail. Test data comes from the `tests/.playground/` mock project, fully decoupled from the real project.

## Setup

```bash
# Prepare the mock project: tests/.playground is a minimal mock unrelated to the real project; place it at .corazon/.playground/
rm -rf .corazon/.playground && mkdir -p .corazon && cp -R tests/.playground .corazon/.playground
# Start the server under test with .corazon/.playground as project root
cd workspace/static && go build -o corazon . && ./corazon serve-static --root ../../.corazon/.playground --addr :7502 &
```

## 1. static-query full query

```bash
curl -s -X POST http://localhost:7502/static/query -d '{}'
```

Expected: 200, body contains:

- `atoms`: all atoms in full (mock `demo-service` / `demo-worker`, with complete interfaces)
- `edges`: all edges in full (includes `demo-to-worker`)
- `runtime`: entry list, includes `runtime/dev.yaml`
- `contracts`: entry list, exactly `["contracts/demo-api.yaml"]` (dot-prefixed files are ignored)
- `devtime`: exactly `["devtime/note.md"]`; `docs` / `notes` are empty arrays

## 2. static-query filtered by env

```bash
curl -s -X POST http://localhost:7502/static/query -d '{"env": "dev"}'
```

Expected: 200, `runtime` is exactly `["runtime/dev.yaml"]`.

```bash
curl -s -X POST http://localhost:7502/static/query -d '{"env": "nope"}'
```

Expected: 404, `{ "error": { "code": "not_found", ... } }`.

## 3. static-query-detail runtime content

```bash
curl -s -X POST http://localhost:7502/static/query-detail \
  -d '{"type": "runtime", "id": "runtime/dev.yaml"}'
```

Expected: 200, `runtime.description` is `Playground dev environment`, `runtime.endpoints` is an array of 2 entries: the entry with `id: demo-service` has `channel: network`, `protocol: http`, `address: http://localhost:9000`; the entry with `id: demo-worker` has `channel: stdio`, `protocol: ndjson` and `in`/`out` pipes. `runtime.tests` has 1 entry.

## 4. static-query-detail contract content

```bash
curl -s -X POST http://localhost:7502/static/query-detail \
  -d '{"type": "contract", "id": "contracts/demo-api.yaml"}'
```

Expected: 200, `contract.id` is `demo-api`, `contract.response.body.ok` is `boolean`.

## 5. static-query-detail devtime raw text

```bash
curl -s -X POST http://localhost:7502/static/query-detail \
  -d '{"type": "devtime", "id": "devtime/note.md"}'
```

Expected: 200, `devtime` is the raw markdown starting with `# Playground Note`.

## 6. static-query-detail error branches

```bash
curl -s -X POST http://localhost:7502/static/query-detail \
  -d '{"type": "atom", "id": "atoms/demo-service.yaml"}'
```

Expected: 400, `error.code` is `bad_request` (atom is not a leaf file type).

```bash
curl -s -X POST http://localhost:7502/static/query-detail \
  -d '{"type": "contract", "id": "contracts/nope.yaml"}'
```

Expected: 404, `error.code` is `not_found`.
