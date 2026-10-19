# Test: core-log-tab

Contract conformance for `log-tab-new` / `log-tab-mutation` / `log-tab-detail` /
`log-tab-list` / `log-tab-on` / `log-tab-off`.

A tab record is **state**, not a record stream: one row per `tabId`. A tab always
has a pane tree (there is no empty tab) and a name — the caller resolves the name
from the pages' titles and log only stores it. A tab also **owns** the
conversations it shows: a session is bound to one tab, once, and a second tab
claiming the same session is refused. `lastAt` moves when the layout is written or
when a message lands in one of the tab's conversations; `updatedAt` only moves on
a layout write.

Log does not interpret the pane tree — it stores it as text and hands it back.

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

## 1. tab/new creates a named tab and binds its conversations

```bash
curl -s -X POST http://localhost:8830/log/tab/new \
  -H 'Content-Type: application/yaml' \
  --data-binary $'title: Pure Chat
layout:
  pane:
    paneId: p_abc123
    contentId: s_abc123
sessionIds: [s_abc123]
open: true'
```

Expected: `tabId` matching `t_[0-9a-f]+`, `title: Pure Chat`, the tree echoed,
and `createdAt` / `updatedAt` / `lastAt` all RFC3339.

```bash
curl -s -X POST http://localhost:8830/log/tab/new \
  -H 'Content-Type: application/yaml' --data-binary $'title: x'
```

Expected: 400, `error.code` is `bad_request` — a tab always arrives with a layout.

## 2. the tab owns its session

```bash
TAB=$(curl -s -X POST http://localhost:8830/log/tab/list -H 'Content-Type: application/yaml' -d '{}' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["tabs"][0]["tabId"])')
curl -s -X POST http://localhost:8830/log/session/detail -d 'sessionId: s_abc123'
```

Expected: `tabId` equals `$TAB` — the binding is visible on the session row.

## 3. a second tab cannot claim the same session

```bash
curl -s -X POST http://localhost:8830/log/tab/new \
  -H 'Content-Type: application/yaml' \
  --data-binary $'title: Second
layout:
  pane:
    paneId: p_dup
    contentId: s_abc123
sessionIds: [s_abc123]'
```

Expected: 400, `error.message` names `session s_abc123 already belongs to tab <$TAB>`,
and no new tab was created (step 6's list still has one entry).

## 4. mutation overwrites in place, keeping createdAt

```bash
FIRST=$(curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB" \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["createdAt"])')
sleep 1
curl -s -X POST http://localhost:8830/log/tab/mutation \
  -H 'Content-Type: application/yaml' \
  --data-binary $'tabId: '"$TAB"$'
title: Pure Chat · Project
layout:
  split:
    flexDirection: row
    children:
      - pane:
          paneId: p_a1
          contentId: s_abc123
      - pane:
          paneId: p_a2
          contentId: s_def456
          flex: "2 1 0"
sessionIds: [s_abc123, s_def456]'
```

Expected: 200, `tabId` equals `$TAB`; `title` is `Pure Chat · Project`;
`layout.split.flexDirection` is `row`; `layout.children[1].pane.flex` is `2 1 0`;
`createdAt` equals `$FIRST` (the first write) while `updatedAt` and `lastAt` are
later.

The overwrite did not add a row — the same tabId appears exactly once:

```bash
curl -s -X POST http://localhost:8830/log/tab/list -H 'Content-Type: application/yaml' -d '{}' \
  | python3 -c 'import sys,yaml;t=yaml.safe_load(sys.stdin)["tabs"];print(len(t), sum(1 for x in t if x["tabId"]=="'"$TAB"'"))'
```

Expected: `1 1`.

## 5. a message in one of its conversations moves lastAt, not updatedAt

```bash
curl -s -X POST http://localhost:8830/log/mutation \
  -H 'Content-Type: application/yaml' \
  --data-binary $'op: add
kind: conversation
sessionId: s_def456
payload:
  seq: 1
  role: user
  content: hello'
sleep 1
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary "tabId: $TAB" \
  | python3 -c 'import sys,yaml;d=yaml.safe_load(sys.stdin);print("lastAt>updatedAt", d["lastAt"] > d["updatedAt"])'
```

Expected: `lastAt>updatedAt True` — the message is activity, the layout is not.

## 6. list shape and ordering

```bash
curl -s -X POST http://localhost:8830/log/tab/list -H 'Content-Type: application/yaml' -d '{}'
```

Expected: 200, `pageSize` is `100`, `pageNum` is `1`, `hasMore` is `false`,
`tabs` has one entry carrying `tabId` / `title` / `layout` / `createdAt` /
`updatedAt` / `lastAt`.

## 7. on / off take several ids and are idempotent

```bash
curl -s -X POST http://localhost:8830/log/tab/off -H 'Content-Type: application/yaml' \
  --data-binary "tabIds: [$TAB]"
curl -s -X POST http://localhost:8830/log/tab/off -H 'Content-Type: application/yaml' \
  --data-binary "tabIds: [$TAB]" >/dev/null   # closing a closed tab is a no-op
curl -s -X POST http://localhost:8830/log/tab/on -H 'Content-Type: application/yaml' \
  --data-binary "tabIds: [$TAB]"
```

Expected: the first `off` answers `openTabs: []`, the second is not an error, and
`on` answers `openTabs` holding `$TAB`.

```bash
curl -s -X POST http://localhost:8830/log/tab/on -H 'Content-Type: application/yaml' \
  --data-binary 'tabIds: [t_nope]'
```

Expected: 400 — opening a tab that does not exist is not a silent success.

## 8. detail on an unknown tabId / detail without tabId

```bash
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary 'tabId: t_nope'
curl -s -X POST http://localhost:8830/log/tab/detail \
  -H 'Content-Type: application/yaml' -d '{}'
```

Expected: 404 `not_found`, then 400 `bad_request`.

## 9. mutation for a tab that does not exist

```bash
curl -s -X POST http://localhost:8830/log/tab/mutation \
  -H 'Content-Type: application/yaml' \
  --data-binary $'tabId: t_nope
title: x
layout:
  pane:
    paneId: p_x
    contentId: s_x'
```

Expected: 404 `not_found` — mutation overwrites, it does not create.

## 10. the tab survives a restart

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

Expected: 200, same tree and same title as step 4 — it is state in sqlite, not in
memory.

## Teardown

```bash
pkill -f 'serve-log --root .*/.log-tab'
```
