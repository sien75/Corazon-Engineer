# Test: core-static-query

Contract conformance for static-query / static-query-detail. Test data comes from the `development/testing/.playground/` mock project, fully decoupled from the real project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML.

## Setup

```bash
# Prepare the mock project: development/testing/.playground is a minimal mock unrelated to the real project; place it at .engineer/.playground/
rm -rf .engineer/.playground && mkdir -p .engineer && cp -R development/testing/.playground .engineer/.playground
# Start the services under test with the binary the launcher runs. `workspace/static`
# has no main package, so building inside it yields an archive, not a runnable
# ./engineer.
#
# static has no root any more: a request names a projectId and static resolves it
# to a folder through log. The case therefore starts log too, registers the mock
# project, and keeps its id in a file the request blocks below read.
#
# Reclaim a previous run of this case. A leftover service keeps serving its old
# database (or silently stops this run's from binding) — and the failure that
# causes looks like a wrong answer, not a dead service. This happens before, not
# after.
HOME_DIR="$PWD/.engineer/.playground-home"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
for p in 8870 8871; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1
rm -rf "$HOME_DIR" && mkdir -p "$HOME_DIR"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8871 >/tmp/static-query-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8871/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8871/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $PWD/.engineer/.playground" \
  | awk '$1=="projectId:" {print $2}' > .engineer/.playground-project
PROJECT=$(cat .engineer/.playground-project)

/tmp/engineer serve-static --log http://localhost:8871 --bind 127.0.0.1 --port 8870 >/tmp/static-query-static.log 2>&1 &

# wait for it before querying: the blocks below run back to back
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8870/static/query \
    -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" && break
  sleep 1
done
```

## 1. static-query full query

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query \
  -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT"
```

Expected: 200, body contains:

- `atoms`: all atoms in full (mock `demo-service` / `demo-worker`, with complete interfaces)
- `edges`: all edges in full (includes `demo-to-worker`)
- `how-to`: recursive file list of the how-to tree: `how-to/README.md` and `how-to/deploy/dev/BOOK.md` / `launch.sh`
- `contracts`: entry list, exactly `[contracts/demo-api.yaml]` (dot-prefixed files are ignored)
- `development`: recursive file list: `development/note.md` and `development/testing/dev/case-playground-api/desp.yaml` / `TEST.md`; `docs` / `notes` are empty arrays

## 2. static-query-detail how-to content

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query-detail \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\ntype: how-to\nid: how-to/README.md' "$PROJECT")"
```

Expected: 200, `how-to` is the raw file text starting with `# how-to`.

## 3. static-query-detail contract content

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query-detail \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\ntype: contract\nid: contracts/demo-api.yaml' "$PROJECT")"
```

Expected: 200, `contract.id` is `demo-api`, `contract.response.body.ok` is `boolean`.

## 4. static-query-detail development raw text

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query-detail \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\ntype: development\nid: development/note.md' "$PROJECT")"
```

Expected: 200, `development` is the raw markdown starting with `# Playground Note`.

## 5. static-query-detail error branches

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query-detail \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\ntype: atom\nid: atoms/demo-service.yaml' "$PROJECT")"
```

Expected: 400, `error.code` is `bad_request` (atom is not a leaf file type).

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -s -X POST http://localhost:8870/static/query-detail \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\ntype: contract\nid: contracts/nope.yaml' "$PROJECT")"
```

Expected: 404, `error.code` is `not_found`.

## 6. a project the board does not know

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8870/static/query \
  -H 'Content-Type: application/yaml' --data-binary 'projectId: p_ffffffffffff'
```

Expected: 404 — static resolves the id through log, and log has no such project. A
request with no `projectId` is a 400 for the same reason: static no longer has a
root to fall back to.
