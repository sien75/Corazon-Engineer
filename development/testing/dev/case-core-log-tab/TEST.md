# Test: core-log-tab

Contract conformance for `log-tab-mutation` / `log-tab-detail` / `log-tab-list`.

A tab record is **state**, not a record stream: one row per `tabId`, and a mutation
with an existing `tabId` overwrites it in place (no second row). Log does not
interpret the pane tree — it stores it as text and hands it back.

`log` owns the sqlite database, so this case runs its own instance against a
throwaway root and never touches the real project's `.engineer/engineer.db`.

Note: the log API speaks YAML (`application/yaml`) — request and response bodies
below are YAML.

## Setup

```bash
ROOT="$PWD/.engineer/.log-tab"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: log-tab\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-log --root " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${ROOT:?this case must set ROOT before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 8830; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8830 >/tmp/log-tab.log 2>&1 &

# wait for it before querying: the blocks below run back to back
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8830/log/tab/list -d '{}' && break
  sleep 1
done
```

## 1. mutation without tabId creates a tab

```bash
TAB=$(curl -s -X POST http://localhost:8830/log/tab/mutation \
  -H 'Content-Type: application/yaml' \
  --data-binary $'layout:\n  pane:\n    content: chat\n    id: s_abc123' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["tabId"])')
echo "tab=$TAB"
```

Expected: `tabId` matching `t_[0-9a-f]+`, `layout.pane.content` is `chat`,
`layout.pane.id` is `s_abc123`, and both `createdAt` / `updatedAt` are RFC3339.

```bash
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB"
```

Expected: 200, same tree, same `createdAt` / `updatedAt`.

## 2. a second mutation with the same tabId overwrites in place

```bash
FIRST=$(curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB" \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["createdAt"])')
sleep 1
curl -s -X POST http://localhost:8830/log/tab/mutation \
  -H 'Content-Type: application/yaml' \
  --data-binary $'tabId: '"$TAB"$'\nlayout:\n  split: col\n  children:\n    - pane:\n        content: chat\n        id: s_abc123\n    - pane:\n        content: page\n        id: my-blueprint\n        size: brief'
```

Expected: 200, `tabId` equals `$TAB`; `layout.split` is `col`;
`layout.children[1].pane.size` is `brief`; `createdAt` equals `$FIRST` (the first
write) while `updatedAt` is later.

The overwrite did not add a row — the same tabId appears exactly once:

```bash
curl -s -X POST http://localhost:8830/log/tab/list -H 'Content-Type: application/yaml' -d '{}' \
  | python3 -c 'import sys,yaml;t=yaml.safe_load(sys.stdin)["tabs"];print(sum(1 for x in t if x["tabId"]=="'"$TAB"'"))'
```

Expected: `1`.

## 3. detail round-trips the stored tree

```bash
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB"
```

Expected: 200, body identical to what step 2 wrote: `split: col`, two children,
the second one a `page` / `my-blueprint` / `size: brief` leaf.

Deeply nested trees survive too — `layout.children[0]` and the leaf's `size` are
the interesting fields; a naive shallow store would drop them.

## 4. detail on an unknown tabId

```bash
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary 'tabId: t_nope'
```

Expected: 404, `error.code` is `not_found`.

## 5. mutation without layout

```bash
curl -s -X POST http://localhost:8830/log/tab/mutation \
  -H 'Content-Type: application/yaml' --data-binary 'tabId: t_nope'
```

Expected: 400, `error.code` is `bad_request`.

## 6. detail without tabId

```bash
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' -d '{}'
```

Expected: 400, `error.code` is `bad_request`.

## 7. list shape

```bash
curl -s -X POST http://localhost:8830/log/tab/list -H 'Content-Type: application/yaml' -d '{}'
```

Expected: 200, `pageSize` is `100`, `pageNum` is `1`, `hasMore` is `false`,
`tabs` has one entry with `tabId` / `layout` / `createdAt` / `updatedAt`.

## 8. the tab survives a restart

```bash
pkill -f 'serve-log --root .*/.log-tab' ; sleep 1
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8830 >/tmp/log-tab.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8830/log/tab/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB"
```

Expected: 200, same tree as step 3 — it is state in sqlite, not in memory.

## Teardown

```bash
pkill -f 'serve-log --root .*/.log-tab'
```
