# Test: core-static-query

Contract conformance for static-query / static-query-detail. Test data comes from the `development/testing/.playground/` mock project, fully decoupled from the real project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML.

## Setup

```bash
# Prepare the mock project: development/testing/.playground is a minimal mock unrelated to the real project; place it at .engineer/.playground/
rm -rf .engineer/.playground && mkdir -p .engineer && cp -R development/testing/.playground .engineer/.playground
# Start the server under test with .engineer/.playground as project root — with the
# same binary the launcher runs. `workspace/static` has no main package, so building
# inside it yields an archive, not a runnable ./engineer.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-static --root "$PWD/.engineer/.playground" --bind 127.0.0.1 --port 8512 &

# wait for it before querying: the blocks below run back to back
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8512/static/query -d '{}' && break
  sleep 1
done
```

## 1. static-query full query

```bash
curl -s -X POST http://localhost:8512/static/query \
  -H 'Content-Type: application/yaml' --data-binary ''
```

Expected: 200, body contains:

- `atoms`: all atoms in full (mock `demo-service` / `demo-worker`, with complete interfaces)
- `edges`: all edges in full (includes `demo-to-worker`)
- `how-to`: recursive file list of the how-to tree: `how-to/README.md` and `how-to/deploy/dev/BOOK.md` / `launch.sh`
- `contracts`: entry list, exactly `[contracts/demo-api.yaml]` (dot-prefixed files are ignored)
- `development`: recursive file list: `development/note.md` and `development/testing/dev/case-playground-api/desp.yaml` / `TEST.md`; `docs` / `notes` are empty arrays

## 2. static-query-detail how-to content

```bash
curl -s -X POST http://localhost:8512/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary $'type: how-to\nid: how-to/README.md'
```

Expected: 200, `how-to` is the raw file text starting with `# how-to`.

## 3. static-query-detail contract content

```bash
curl -s -X POST http://localhost:8512/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary $'type: contract\nid: contracts/demo-api.yaml'
```

Expected: 200, `contract.id` is `demo-api`, `contract.response.body.ok` is `boolean`.

## 4. static-query-detail development raw text

```bash
curl -s -X POST http://localhost:8512/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary $'type: development\nid: development/note.md'
```

Expected: 200, `development` is the raw markdown starting with `# Playground Note`.

## 5. static-query-detail error branches

```bash
curl -s -X POST http://localhost:8512/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary $'type: atom\nid: atoms/demo-service.yaml'
```

Expected: 400, `error.code` is `bad_request` (atom is not a leaf file type).

```bash
curl -s -X POST http://localhost:8512/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary $'type: contract\nid: contracts/nope.yaml'
```

Expected: 404, `error.code` is `not_found`.
