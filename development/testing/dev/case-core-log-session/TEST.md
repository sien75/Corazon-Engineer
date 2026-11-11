# Test: core-log-session

A database written before the workspace became part of the session row is migrated,
once, on start:

- `current.open_sessions` / `current.main_session` move onto the sessions they name
  (`open_index`, `is_main`) — the table no longer exists afterwards;
- every other session column is untouched;
- a database that has no `current` table is already in the new shape and starts
  without doing anything.

The point of the case is that an existing installation does not have to be thrown
away: it starts, its open tabs and its main are still there, and nothing is lost.

## Setup

```bash
ROOT="$PWD/.engineer/.log-session"
# The database lives in the engineer home, not in a project's .engineer/.
HOME_DIR="$ROOT/home"

: "${ROOT:?this case must set ROOT before reclaiming}"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: log-session\n' > "$ROOT/engineer.yaml"

# A pre-change database, built by hand: sessions without the workspace columns, and
# a current row holding the open list and the main pointer.
DB="$HOME_DIR/engineer.db"
sqlite3 "$DB" <<'SQL'
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'sub',
  project_id TEXT NOT NULL DEFAULT '',
  blueprint TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE current (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  open_sessions TEXT NOT NULL,
  main_session TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
INSERT INTO current VALUES (1, '["s_b","s_a","s_gone"]', 's_main', '2024-01-01T00:00:00Z');
INSERT INTO sessions VALUES ('s_a',    'sub',  'project', 'project', '', '2024-01-01T00:00:00Z');
INSERT INTO sessions VALUES ('s_b',    'sub',  'project', 'project', '', '2024-01-02T00:00:00Z');
INSERT INTO sessions VALUES ('s_main', 'main', '',        '',        '', '2024-01-01T00:00:00Z');
SQL

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9050 \
  >/tmp/ego-simple/log-session.log 2>&1 &
LOG=http://localhost:9050
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/session/current/get -d '{}' && break
  sleep 1
done
```

## 1. the open list and the main moved onto the sessions

```bash
curl -s -X POST $LOG/log/session/current/get -d '{}'
```

Expected: `openSessions: [s_b, s_a]` — the stored order is kept — and
`mainSession: s_main`; `s_gone` (an id with no row) is dropped, because there is
nothing to draw behind it.

## 2. the current table is gone, and the columns are there

```bash
sqlite3 "$HOME_DIR/engineer.db" ".tables"
sqlite3 "$HOME_DIR/engineer.db" "PRAGMA table_info(sessions);" | cut -d'|' -f2 | tr '\n' ' '; echo
sqlite3 "$HOME_DIR/engineer.db" "SELECT session_id, open_index, is_main FROM sessions ORDER BY session_id;"
```

Expected: `.tables` lists `records`, `tests`, `telemetries`, `sessions` and
`projects` — no `current`; `sessions` has `open_index`, `is_main` and `touched_at`;
`s_b` has `open_index: 0`, `s_a` `1`, `s_main` `is_main: 1`.

## 3. the sessions themselves survived

```bash
for s in s_a s_b s_main; do
  curl -s -X POST $LOG/log/session/detail -d "sessionId: $s" | tr '\n' ' '; echo
done
```

Expected: `s_a` and `s_b` are `kind: sub` with `blueprint: project`; `s_main` is
`kind: main`. Nothing else changed.

## 4. the migrated list is usable

```bash
curl -s -X POST $LOG/log/session/on --data-binary 'sessionIds: [s_b]'
curl -s -X POST $LOG/log/session/current/get -d '{}' | grep -A4 openSessions
curl -s -X POST $LOG/log/session/off --data-binary 'sessionIds: [s_a]'
curl -s -X POST $LOG/log/session/current/get -d '{}' | grep -A4 openSessions
```

Expected: `on` with an already-open `s_b` changes nothing (idempotent); `off` leaves
`[s_b]` — the migrated rows are ordinary sessions, writable like any other.

## 5. a second start migrates nothing

```bash
pkill -f "serve-log --home $HOME_DIR" ; sleep 1
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9050 \
  >/tmp/ego-simple/log-session.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/session/current/get -d '{}' && break
  sleep 1
done
curl -s -X POST $LOG/log/session/current/get -d '{}'
```

Expected: `openSessions: [s_b]` and `mainSession: s_main` — the migration is
idempotent, and a normal restart does not reset the workspace.

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
rm -rf "$ROOT"
```