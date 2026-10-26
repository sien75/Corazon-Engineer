# Test: core-log-workspace

The shell has no workspace state of its own. log owns two things and keeps them in
step:

- `sessions` — one row per conversation: `kind` is `main` (the shell's own chat) or
  `sub` (a blueprint agent), plus the blueprint its page comes from and the name its
  tab shows. A session with no row reads as `sub`.
- `current` — one row: which session ids are open (in display order, main never
  among them) and which session is main.

**There is no tab row.** A tab is one open session: an id in `current.openSessions`
is the whole of a tab, so `session/open` puts a session (and therefore its tab) on
screen, `session/off` takes it off without deleting anything, and `log/delete`
removes the conversation, its row and its place in the open list.

This case is HTTP-level: no browser and no model.

## Setup

```bash
ROOT="$PWD/.engineer/.workspace-test"
# log stores in the engineer home now; the home is not a project.
HOME_DIR="$ROOT/home"

# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-log --home " and kills every service on the machine — including the one
# running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case: a leftover service keeps serving its old
# database, and the failure it causes looks like a wrong answer, not a dead
# service.
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: workspace-test\n' > "$ROOT/engineer.yaml"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8830 \
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

Expected: `openSessions: []` and `mainSession: ""` — the row exists from the first
start, so the shell can read it unconditionally.

## 2. a session carries kind, blueprint and title; blanks keep the stored value

```bash
curl -s -X POST $LOG/log/session/upsert --data-binary $'sessionId: s_main01
kind: main
title: main'
curl -s -X POST $LOG/log/session/upsert --data-binary $'sessionId: s_sub01
blueprint: pure-chat
title: Pure Chat'
curl -s -X POST $LOG/log/session/upsert --data-binary $'sessionId: s_sub02'
curl -s -X POST $LOG/log/session/upsert --data-binary $'sessionId: s_sub01
kind: sub
blueprint: ""
title: ""'
for s in s_main01 s_sub01 s_sub02 s_nope; do
  curl -s -o /dev/null -w "$s: %{http_code} " -X POST $LOG/log/session/detail -d "sessionId: $s"
  curl -s -X POST $LOG/log/session/detail -d "sessionId: $s" 2>/dev/null | tr '\n' ' ' | cut -c1-120
  echo
done
```

Expected: `s_main01` is `kind: main` / `title: main`; `s_sub01` is `kind: sub` /
`blueprint: pure-chat` / `title: Pure Chat` **even after an upsert that sends empty
strings** (an empty value means "the caller did not say", and a resume must not wipe
the page); `s_sub02` is `kind: sub` with empty blueprint and title; `s_nope` is 404.

## 3. the main session is part of current

```bash
curl -s -X POST $LOG/log/current/put -d 'mainSession: s_main01'
curl -s -X POST $LOG/log/current/get -d '{}' | grep mainSession
```

Expected: `mainSession: s_main01`, and `openSessions` still empty — main is never
in the open list.

## 4. session/on opens it; the list is idempotent and ordered

```bash
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_sub01]'
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_sub02]'
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_sub01]'
curl -s -X POST $LOG/log/session/on --data-binary $'sessionIds: [s_sub02]
index: 0'
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A4 openSessions
```

Expected: after the first two writes `openSessions` is `[s_sub01, s_sub02]`; opening
`s_sub01` again leaves it where it is (no duplicate); `index: 0` on an already-open
id is also a no-op — index only places *newly* opened ids.

```bash
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_nope]'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/on -d '{}'
```

Expected: 400 naming `no session s_nope`, then 400 `bad_request` for a missing
`sessionIds` — opening is not a create.

## 5. session/off closes it, the session row stays

```bash
curl -s -X POST $LOG/log/session/off --data-binary 'sessionIds: [s_sub01]'
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A4 openSessions
curl -s -o /dev/null -w 'row: %{http_code}\n' -X POST $LOG/log/session/detail -d 'sessionId: s_sub01'
curl -s -X POST $LOG/log/session/off --data-binary 'sessionIds: [s_sub01]' >/dev/null
```

Expected: `openSessions` no longer holds `s_sub01` while its row still answers 200 —
closing is not deleting — and closing it again is not an error.

## 6. the list shows a session with no messages, and is ordered by activity

```bash
curl -s -X POST $LOG/log/list -d '{"pageNum": 1}'
curl -s -X POST $LOG/log/mutation --data-binary $'op: add
kind: conversation
sessionId: s_sub02
payload:
  seq: 1
  role: user
  content: hello'
sleep 1
curl -s -X POST $LOG/log/list -d '{"pageNum": 1}' \
  | python3 -c 'import sys,yaml;d=yaml.safe_load(sys.stdin);print([ (s["sessionId"], s["count"], s["title"], s["blueprint"]) for s in d["sessions"]])'
```

Expected: the first list already contains `s_main01` / `s_sub01` / `s_sub02` with
`count: 0` (a session that has said nothing is still a session — that is what makes
a fresh agent appear in the launcher), each carrying `kind`, `blueprint`, `title`,
`createdAt`, `lastAt`; after the message, `s_sub02` is first and has `count: 1`.

## 7. deleting a session removes the records, the row and the list entry

```bash
curl -s -X POST $LOG/log/delete -d 'sessionId: s_sub02'
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A4 openSessions
curl -s -o /dev/null -w 'row: %{http_code}\n' -X POST $LOG/log/session/detail -d 'sessionId: s_sub02'
curl -s -X POST $LOG/log/list -d '{"pageNum": 1}' | grep -c s_sub02 || true
```

Expected: `openSessions` is empty (the deleted session's tab went with it), the row
is 404, and the list no longer names it — one delete, one consistent workspace.

## 8. deleting the main session clears the pointer

```bash
curl -s -X POST $LOG/log/delete -d 'sessionId: s_main01'
curl -s -X POST $LOG/log/current/get -d '{}' | grep mainSession
```

Expected: `mainSession: ""` — deleting a conversation cannot leave the shell
pointing at it.

## 9. both rows survive a restart

```bash
curl -s -X POST $LOG/log/session/upsert --data-binary $'sessionId: s_sub01
blueprint: pure-chat
title: Pure Chat'
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_sub01]'
pkill -f "serve-log --home $HOME_DIR" ; sleep 1
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8830 \
  >/tmp/ego-simple/ws-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' && break
  sleep 1
done
curl -s -X POST $LOG/log/current/get -d '{}'
curl -s -X POST $LOG/log/session/detail -d 'sessionId: s_sub01'
```

Expected: `openSessions: [s_sub01]` and the same title / blueprint — this is sqlite
state, not memory.

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
rm -rf "$ROOT"
```
