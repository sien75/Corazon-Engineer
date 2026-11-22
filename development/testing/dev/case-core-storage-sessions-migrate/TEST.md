# Test: core-storage-sessions-migrate

数据目录比代码活得久：`sessions` 表由旧版本建过，字段比现在少（没有 `cwd` / `system`）。

- 旧库用 `CREATE TABLE IF NOT EXISTS sessions (session_id, kind, created_at, blueprint, title, ...)` 建出来；
  现在的代码要读写 `cwd` / `system` / `title` / `model` / `image_model`。
- 不做迁移时，`CREATE TABLE IF NOT EXISTS` 什么也不改，于是每次写都失败：
  `log/session/upsert` 回 500（`table sessions has no column named cwd`）——Pure Chat 打开就报这个。
- 期望：storage 启动时把缺的列补上（`ALTER TABLE … ADD COLUMN`，默认 `''`），缺的列补上后
  `upsert` 回 200，旧行照旧读得回来（补出来的列是空串）。

Source of truth: `workspace/storage/internal/store/workspace.go`（`createWorkspaceTables` / `sessionColumns`）、
`workspace/storage/internal/server/server.go`（`/log/session/upsert`、`/log/session/detail`）。

## Setup

```bash
ROOT="$PWD/.engineer/.migrate-test"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"

# 一个旧版本的库：sessions 表比现在少列，里面还有一行旧数据
sqlite3 "$HOME_DIR/engineer.db" <<'SQL'
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'sub',
  blueprint TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT INTO sessions (session_id, kind, blueprint, title, created_at)
VALUES ('s_legacy00000000', 'sub', 'purechat', 'an old conversation', '2026-01-01T00:00:00Z');
SQL

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8994 >/tmp/migrate-storage.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 -X POST http://localhost:8994/log/session/list -d 'pageNum: 1'; then break; fi
  sleep 1
done
```

Expected: `engineer log: storing in …/.migrate-test/home/engineer.db, serving on 127.0.0.1:8994`.

## Run

```bash
# 1. 缺的列补上了
sqlite3 "$HOME_DIR/engineer.db" "PRAGMA table_info(sessions)" | cut -d'|' -f2 | tr '\n' ' '
# → session_id kind blueprint title created_at cwd system model image_model（顺序随建表历史，重点是五个都在）

# 2. 写一个会话：旧库上会回 500，补列后是 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8994/log/session/upsert \
  -H 'Content-Type: application/yaml' \
  -d 'sessionId: s_new000000000000
cwd: /tmp/blueprints
system: you are a test
title: probe
model: deepseek/deepseek-flash'
# → 200

# 3. 两个字段都落了库
curl -s -X POST http://localhost:8994/log/session/detail -H 'Content-Type: application/yaml' \
  -d 'sessionId: s_new000000000000' | grep -E 'cwd|title|model'
# → cwd: /tmp/blueprints  title: probe  model: deepseek/deepseek-flash

# 4. 旧行还在，补出来的列是空串（不因为读不出来而消失）
curl -s -X POST http://localhost:8994/log/session/detail -H 'Content-Type: application/yaml' \
  -d 'sessionId: s_legacy00000000' | grep -E 'title|cwd'
# → title: an old conversation  cwd: ''
```

Expected: 第 2 步是 `200`，第 3、4 步的字段在上面写的值上。

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-storage.*--port 8994" 2>/dev/null || true
rm -rf "$ROOT"
```
