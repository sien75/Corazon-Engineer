# Test: core-log-session

A database written before tabs stopped existing is migrated, once, on start:

- `current.open_tabs` (tab ids) becomes `current.open_sessions` (session ids);
- each open tab keeps exactly one of the sessions it held — the earliest — because a
  tab is one session now, and a multi-pane tab cannot be one tab any more;
- `tabs` and `sessions.tab_id` are dropped;
- everything else (records, session kinds, the main pointer) is untouched.

The point of the case is that an existing project does not have to be thrown away:
it starts, it shows one tab per old tab, and nothing else is lost.

## Setup

```bash
ROOT="$PWD/.engineer/.log-session"
# The database lives in the engineer home now, not in a project's .engineer/.
HOME_DIR="$ROOT/home"

: "${ROOT:?this case must set ROOT before reclaiming}"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: log-session\n' > "$ROOT/engineer.yaml"

# A pre-change database, built by hand: the tab table, the tab binding on
# sessions, and an open list made of tab ids.
DB="$HOME_DIR/engineer.db"
sqlite3 "$DB" <<'SQL'
CREATE TABLE tabs (
  tab_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'sub',
  blueprint TEXT NOT NULL DEFAULT '',
  tab_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE current (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  open_tabs TEXT NOT NULL,
  main_session TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
INSERT INTO current VALUES (1, '["t_multi","t_gone"]', 's_main', '2024-01-01T00:00:00Z');
INSERT INTO tabs VALUES ('t_multi', 'A · B', '{}', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z');
INSERT INTO sessions VALUES ('s_a',    'sub',  'project', 't_multi', '2024-01-01T00:00:00Z');
INSERT INTO sessions VALUES ('s_b',    'sub',  'project', 't_multi', '2024-01-02T00:00:00Z');
INSERT INTO sessions VALUES ('s_main', 'main', '',        '',        '2024-01-01T00:00:00Z');
SQL

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9050 \
  >/tmp/ego-simple/log-session.log 2>&1 &
LOG=http://localhost:9050
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' && break
  sleep 1
done
```

## 1. the open list now holds session ids

```bash
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: `openSessions: [s_a]` — `t_multi` kept its earliest session, `t_gone` (a
tab with no session) contributed nothing, and `mainSession: s_main` is unchanged.

## 2. the old tables and columns are gone

```bash
sqlite3 "$HOME_DIR/engineer.db" ".tables"
sqlite3 "$HOME_DIR/engineer.db" "PRAGMA table_info(current);" | cut -d'|' -f2 | tr '\n' ' '; echo
sqlite3 "$HOME_DIR/engineer.db" "PRAGMA table_info(sessions);" | cut -d'|' -f2 | tr '\n' ' '; echo
```

Expected: `.tables` lists no `tabs` and a `projects` table; `current` has
`open_sessions` (not `open_tabs`); `sessions` has `title`, `project_id`, `model` and
`image_model`, and no `tab_id`.

## 3. the sessions themselves survived

```bash
for s in s_a s_b s_main; do
  curl -s -X POST $LOG/log/session/detail -d "sessionId: $s" | tr '\n' ' '; echo
done
```

Expected: `s_a` and `s_b` are `kind: sub` with `blueprint: project`; `s_main` is
`kind: main`. `title` is empty on the old rows — the shell falls back to reading the
page — and nothing else changed.

## 4. the migrated list is usable

```bash
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_b]'
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A4 openSessions
curl -s -X POST $LOG/log/session/off --data-binary 'sessionIds: [s_a]'
curl -s -X POST $LOG/log/current/get -d '{}' | grep -A4 openSessions
```

Expected: `on` appends `s_b` (`[s_a, s_b]`) — the migrated rows are ordinary
sessions, not read-only leftovers — and `off` leaves `[s_b]`.

## 5. a second start migrates nothing

```bash
pkill -f "serve-log --home $HOME_DIR" ; sleep 1
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9050 \
  >/tmp/ego-simple/log-session.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' && break
  sleep 1
done
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: `openSessions: [s_b]` — the migration is idempotent, and a normal restart
does not reset the list.

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
rm -rf "$ROOT"
```
