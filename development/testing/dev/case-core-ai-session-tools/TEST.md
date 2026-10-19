# Test: core-ai-session-tools

main 的会话工具端到端：`session-new` / `session-close` / `session-open` /
`session-delete`。它们**只写 log**（`sessions` + `current`），不碰前端；外壳靠工具
帧去重读工作区。所以本用例在 HTTP 层断言：这些调用真的发生了（记录里出现工具名），
并且 log 的状态真的跟着变了。

删除（`session-delete`）以及与 main / sub 相关的边界，由 `case-core-session-delete`
覆盖。

需要真模型（工具调用是模型决定的），所以用 pi 自己配好的 provider，不传 `--stub`。

## Setup

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.session-tools"

: "${ROOT:?this case must set ROOT before reclaiming}"
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$ROOT/.agents/blueprints/probe"
printf 'project: session-tools\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 9061 >/tmp/session-tools-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 9062 >/tmp/session-tools-static.log 2>&1 &
(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 9060 \
  --log http://localhost:9061 --static http://localhost:9062 \
  --agents "$ROOTDIR/agents" >/tmp/session-tools-ai.log 2>&1 &)

LOG=http://localhost:9061
AI=http://localhost:9060
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

# one turn, then wait for the run to settle (stream it and drop the events).
ask() {
  python3 - "$1" "$2" > /tmp/session-tools-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/session-tools-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/dev/null
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
open_ids() { curl -s -X POST $LOG/log/current/get -d '{}' | sed -n 's/^  - //p'; }

MAIN=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
echo "main=$MAIN"
```

Expected: the ai service logs its address on `:9060` and does **not** print
`--stub: model calls disabled` (a stub would make every section below vacuous).

## 1. session-new makes an agent and opens its tab

```bash
ask $MAIN 'Call the session-new tool with blueprint "probe" right now. Do not use bash or curl, do not ask me anything — just call the tool and report its exact reply.'
SUB=$(open_ids | head -1)
echo "sub=$SUB"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $SUB"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | grep -c 'name: session-new' || true
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | grep -c 'name: bash' || true
```

Expected: `sub` is a non-empty `s_…`; its `session/detail` says `kind: sub`,
`blueprint: probe`, `title: Probe Page` (the page's `<title>`); `name: session-new`
appears **once** and `name: bash` **zero** times — the tab came from the tool, not
from a `curl` in the shell.

## 2. session-close keeps the conversation, session-open brings it back

```bash
ask $MAIN "Call the session-close tool on session $SUB right now. Do not use bash or curl, do not ask anything — just call the tool and report its reply."
curl -s -X POST $LOG/log/current/get -d '{}'
curl -s -o /dev/null -w 'row: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $SUB"
ask $MAIN "Call the session-open tool on session $SUB right now. Do not use bash or curl, do not ask anything — just call the tool and report its reply."
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: after the close `openSessions` is empty while the row still answers 200
(closing is not deleting); after the open the same id is back — no new session was
made.

## Teardown

```bash
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
rm -rf "$ROOT"
```
