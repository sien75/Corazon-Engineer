# Test: core-static-stream

`static-stream` pushes schema changes to subscribers. The service watches the schema file tree and emits an SSE event whenever a content file is added, updated or removed. Test data comes from the `development/testing/.playground/` mock project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML. SSE events are YAML docs sent as one `data:` line per YAML line. The watcher polls about once per second, so allow a short wait before asserting an event.

## Setup

```bash
# Prepare the mock project: development/testing/.playground is a minimal mock unrelated to the real project; place it at .engineer/.playground/
rm -rf .engineer/.playground && mkdir -p .engineer && cp -R development/testing/.playground .engineer/.playground
# The watcher polls every project on the board, so the case starts log as well,
# registers the mock project and starts static against log. static has no root any
# more: a request names a projectId and the folder comes from log.
#
# Reclaim a previous run of this case. A leftover service keeps serving its old
# database (or silently stops this run's from binding) — and the failure that
# causes looks like a wrong answer, not a dead service. This happens before, not
# after.
HOME_DIR="$PWD/.engineer/.playground-home"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
for p in 8880 8881; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1
rm -rf "$HOME_DIR" && mkdir -p "$HOME_DIR"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8881 >/tmp/static-stream-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8881/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8881/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $PWD/.engineer/.playground" \
  | awk '$1=="projectId:" {print $2}' > .engineer/.playground-project
PROJECT=$(cat .engineer/.playground-project)

/tmp/engineer serve-static --log http://localhost:8881 --bind 127.0.0.1 --port 8880 >/tmp/static-stream-static.log 2>&1 &

# wait for it before streaming: the blocks below run back to back
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8880/static/query \
    -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" && break
  sleep 1
done
```

## 1. add / update / remove events from file changes

Terminal A (subscribe):

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -N -X POST http://localhost:8880/static/stream \
  -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT"
```

Terminal B (change files directly — writes go through the shell, not an API):

```bash
mkdir -p .engineer/.playground/notes
printf '# event test\n' > .engineer/.playground/notes/stream-test.md
sleep 2
printf '# event test updated\n' > .engineer/.playground/notes/stream-test.md
sleep 2
rm .engineer/.playground/notes/stream-test.md
```

Expected: terminal A receives, in order, an `add` then an `update` then a `remove` event — consecutive `data:` lines forming one YAML doc each, containing `seq`, `ts`, `kind: schema`, `payload.projectId` (the mock project's id), `payload.type: notes`, `payload.id: notes/stream-test.md`, and (on add/update) `payload.notes` holding the raw file content.

## 2. atom changes are emitted as parsed objects

Terminal B:

```bash
printf '\n# touched\n' >> .engineer/.playground/atoms/demo-worker.yaml
sleep 2
```

Expected: terminal A receives an `update` event with `payload.type: atom` and `payload.id: atoms/demo-worker.yaml`; `payload.atom` is the parsed atom object (`name: demo-worker`), not a raw string.

## 3. event kinds filter

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -N -X POST http://localhost:8880/static/stream \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\nkinds: how-to' "$PROJECT")"
```

Terminal B: touch a notes file again.

Expected: connection established (with `: heartbeat` comments), but the `kind=schema` events are not pushed (filtered out).

## 4. another project's events do not leak in

```bash
PROJECT=$(cat .engineer/.playground-project)
curl -N -X POST http://localhost:8880/static/stream \
  -H 'Content-Type: application/yaml' --data-binary 'projectId: p_ffffffffffff'
```

Terminal B: touch a notes file again.

Expected: the subscription is accepted, but no event for the mock project arrives —
events are published per project and filtered by the `projectId` the subscriber
asked for.
