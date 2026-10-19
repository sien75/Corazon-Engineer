# Test: core-log-workspace

The shell has no workspace state of its own any more. log owns three things and
keeps them in step:

- `sessions` — one row per conversation: `kind` is `main` (the shell's own chat)
  or `sub` (a blueprint agent). A session with no row reads as `sub`.
- `tabs` — one row per tab: its pane tree and its name. A tab always has a tree:
  there is no empty tab.
- `current` — one row: which tab ids are open (in display order) and which
  session is main.

`tab/new` adds the tab to the open list, `tab/off` takes it out but keeps the
record, `tab/on` puts it back, `tab/delete` removes the record and the list entry.
This case is HTTP-level: no browser and no model.

## Setup

```bash
# Reclaim a previous run of this case.
pkill -f "serve-log --root $PWD/.engineer/.workspace-test" 2>/dev/null || true
sleep 1

ROOT="$PWD/.engineer/.workspace-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: workspace-test\n' > "$ROOT/engineer.yaml"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8830 \
  >/tmp/ego-simple/ws-log.log 2>&1 &
LOG=http://localhost:8830
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' && break
  sleep 1
done
```

## 1. the workspace starts empty, with one current row

```bash
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: `openTabs: []` and `mainSession: ""` — the row exists from the first
start, so the shell can read it unconditionally.

## 2. a session's kind is stored, and defaults to sub

```bash
curl -s -X POST $LOG/log/session/upsert -d 'sessionId: s_main01
kind: main'
curl -s -X POST $LOG/log/session/upsert -d 'sessionId: s_sub01'
curl -s -X POST $LOG/log/session/detail -d 'sessionId: s_main01'
curl -s -X POST $LOG/log/session/detail -d 'sessionId: s_sub01'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/detail -d 'sessionId: s_nope'
```

Expected: `kind: main`, then `kind: sub` (a blank kind means sub), then `404`.

## 3. the main session is part of current

```bash
curl -s -X POST $LOG/log/current/put -d 'mainSession: s_main01'
curl -s -X POST $LOG/log/current/get -d '{}' | grep mainSession
```

Expected: `mainSession: s_main01`.

## 4. tab/new opens a tab

A tab arrives with a layout and a name — there is no empty tab to fill later.

```bash
NEW='
title: Probe
layout:
  pane:
    paneId: p_one
    contentId: s_sub01'
TAB=$(printf '%s\n' "$NEW" | curl -s -X POST $LOG/log/tab/new \
  -H 'Content-Type: application/yaml' --data-binary @- | sed -n 's/^tabId: //p')
echo "tab=$TAB"
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A3 openTabs
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/tab/new -d 'title: bare'
```

Expected: `openTabs` now holds `$TAB`, and a `tab/new` without a layout is `400`.

## 5. tab/off closes it, tab/on brings it back, the record stays

```bash
curl -s -X POST $LOG/log/tab/off -H 'Content-Type: application/yaml' --data-binary "tabIds: [$TAB]"
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A3 openTabs
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/tab/detail -d "tabId: $TAB"
curl -s -X POST $LOG/log/tab/on -H 'Content-Type: application/yaml' --data-binary "tabIds: [$TAB]"
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A3 openTabs
```

Expected: the open list is empty after `off` while the tab record is still there
(`200`) — closing is not deleting — and `on` puts the same id back.

## 6. tab/delete removes the record and the list entry

```bash
TAB2=$(printf 'title: Probe 2\nlayout:\n  pane:\n    paneId: p_two\n    contentId: s_sub02\n' \
  | curl -s -X POST $LOG/log/tab/new -H 'Content-Type: application/yaml' --data-binary @- \
  | sed -n 's/^tabId: //p')
curl -s -X POST $LOG/log/tab/delete -d "tabId: $TAB2"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/tab/detail -d "tabId: $TAB2"
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A3 openTabs
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/tab/delete -d "tabId: $TAB2"
```

Expected: the record is gone (`404`), the open list is empty, and deleting it
again is `404` (not a silent success).

## 7. deleting a session clears it as main

```bash
curl -s -X POST $LOG/log/delete -d 'sessionId: s_main01'
curl -s -X POST $LOG/log/current/get -d '{}' | grep mainSession
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/detail -d 'sessionId: s_main01'
```

Expected: `mainSession` is empty and the session row is gone (`404`) — deleting a
conversation cannot leave the shell pointing at it.

## 8. teardown

```bash
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
rm -rf "$ROOT"
```
