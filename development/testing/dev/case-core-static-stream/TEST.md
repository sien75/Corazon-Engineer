# Test: core-static-stream

`static-stream` pushes schema changes to subscribers. The service watches the schema file tree and emits an SSE event whenever a content file is added, updated or removed. Test data comes from the `development/testing/.playground/` mock project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML. SSE events are YAML docs sent as one `data:` line per YAML line. The watcher polls about once per second, so allow a short wait before asserting an event.

## Setup

```bash
# Prepare the mock project: development/testing/.playground is a minimal mock unrelated to the real project; place it at .engineer/.playground/
rm -rf .engineer/.playground && mkdir -p .engineer && cp -R development/testing/.playground .engineer/.playground
# Start the server under test with .engineer/.playground as project root — with the
# same binary the launcher runs. `workspace/static` has no main package, so building
# inside it yields an archive, not a runnable ./engineer.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-static --root "$PWD/.engineer/.playground" --bind 127.0.0.1 --port 8514 &

# wait for it before streaming: the blocks below run back to back
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8514/static/query -d '{}' && break
  sleep 1
done
```

## 1. add / update / remove events from file changes

Terminal A (subscribe):

```bash
curl -N -X POST http://localhost:8514/static/stream \
  -H 'Content-Type: application/yaml' --data-binary ''
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

Expected: terminal A receives, in order, an `add` then an `update` then a `remove` event — consecutive `data:` lines forming one YAML doc each, containing `seq`, `ts`, `kind: schema`, `payload.type: notes`, `payload.id: notes/stream-test.md`, and (on add/update) `payload.notes` holding the raw file content.

## 2. atom changes are emitted as parsed objects

Terminal B:

```bash
printf '\n# touched\n' >> .engineer/.playground/atoms/demo-worker.yaml
sleep 2
```

Expected: terminal A receives an `update` event with `payload.type: atom` and `payload.id: atoms/demo-worker.yaml`; `payload.atom` is the parsed atom object (`name: demo-worker`), not a raw string.

## 3. event kinds filter

```bash
curl -N -X POST http://localhost:8514/static/stream \
  -H 'Content-Type: application/yaml' --data-binary 'kinds: how-to'
```

Terminal B: touch a notes file again.

Expected: connection established (with `: heartbeat` comments), but the `kind=schema` events are not pushed (filtered out).
