# Test: core-main-workspace

main 没有工作区工具了：它读 spec 里指出的 docs 目录（`structure/docs`）下的 `README.md`，
按"Common tasks"找到该用哪些接口，再读各接口的文件，用 `curl` 调 log / ai。本用例让真模型做一遍，断言看 **log 里的状态**，并且看记录里它确实用了
`bash`（没有任何名为 `session-*` / `main-*` / `project-list` 的工具调用）。

覆盖这几类事：

- 开 agent 并上屏（`/ai/new` → `/log/session/on`）；
- 关、再开（`/log/session/off` / `on`），对话保留；
- 把 main 换成新对话（`/ai/new kind=main` → `/log/session/current/put`，开着的列表原样写回），
  再找回早先的那段；
- 删 agent（`/ai/delete`）；被要求删 main 自己时拒绝。

## ⚠️ 这个用例需要真模型

调接口是模型决定的。pi 自己的认证（环境变量或 `~/.pi/agent/auth.json`）没配好时第 1 节就是红的。
ai 用真模型启动（**不加** `--stub`）。每一节的指令都只说**要什么结果**，不教它怎么调——怎么调是
docs 的事；如果某一节红了，先看 README 的 Common tasks 和相关 contract 的 description 写得清不清楚，再怀疑模型。

## Setup

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.main-workspace"
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9060 9061 9062; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: main-workspace\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9061 >/tmp/main-ws-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9061/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9061/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9061 --bind 127.0.0.1 --port 9062 >/tmp/main-ws-static.log 2>&1 &
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9060 \
  --log http://localhost:9061 --static http://localhost:9062 \
  --agents "$ROOTDIR/agents" --docs "$ROOTDIR/structure/docs" >/tmp/main-ws-ai.log 2>&1 &)

LOG=http://localhost:9061
AI=http://localhost:9060
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

# one turn, then wait for the run to settle (stream it and drop the events).
ask() {
  python3 - "$1" "$2" > /tmp/main-ws-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/main-ws-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/dev/null
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
open_ids() { curl -s -X POST $LOG/log/session/current/get -d '{}' | sed -n 's/^  - //p'; }
main_id() { curl -s -X POST $LOG/log/session/current/get -d '{}' | awk '$1=="mainSession:" {print $2}'; }

MAIN1=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
curl -s -o /dev/null -X POST $LOG/log/session/current/put -d "openSessions: []
mainSession: $MAIN1"
echo "main=$MAIN1"
```

Expected: ai 在 `:9060` 起来，并且**没有** `--stub: model calls disabled`。

## 1. 开 agent 并上屏

```bash
ask $MAIN1 "In project $PROJECT, start an agent from the blueprint probe and put it on screen. Do it now, do not ask me anything, and tell me its session id."
SUB=$(open_ids | head -1)
echo "sub=$SUB"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $SUB"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN1" | grep -c 'name: bash' || true
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN1" | grep -cE 'name: (session-|main-|project-list)' || true
```

Expected: `sub` 是非空 `s_…`，且只有这一个开着；它的 `session/detail` 是 `kind: sub`、
`projectId: $PROJECT`、`blueprint: probe`、`title: Probe Page`；`name: bash` 至少 1 次，
`session-*` / `main-*` / `project-list` 为 **0** 次。

## 2. 关、再开：对话保留

```bash
ask $MAIN1 "Close session $SUB (take it off screen) but keep it. Do it now, do not ask me anything."
open_ids | wc -l
curl -s -o /dev/null -w 'row: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $SUB"
ask $MAIN1 "Put session $SUB back on screen. Do it now, do not ask me anything."
open_ids
```

Expected: 关了之后开着的为 0，行仍答 `200`（关不是删）；再开之后同一个 id 回来，没有新建 session。

## 3. 把 main 换成新对话，再找回早先那段

```bash
ask $MAIN1 "Replace main with a fresh conversation, and leave every open tab as it is. Do it now, do not ask me anything."
MAIN2=$(main_id)
echo "main now: $MAIN2"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $MAIN2"
open_ids
curl -s -o /dev/null -w 'old main: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $MAIN1"

ask $MAIN2 "Bring the earlier main conversation $MAIN1 back as main. Do it now, do not ask me anything."
main_id
```

Expected: `MAIN2` 与 `MAIN1` 不同、`kind: main`；`SUB` 仍是开着的（开着的列表原样写回，没有被清空）；
`old main: 200`；最后 `main_id` 是 `MAIN1`。

## 4. 删 agent；不删 main 自己

```bash
ask $MAIN1 "Delete session $SUB for good — the agent, its records and its row. Do it now, do not ask me anything."
curl -s -o /dev/null -w 'sub row: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $SUB"
open_ids | wc -l

ask $MAIN1 "Delete session $MAIN1 for good."
curl -s -o /dev/null -w 'main row: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $MAIN1"
```

Expected: `sub row: 404`、开着的为 0；`main row: 200`（main 没有被删，它拒绝并解释）。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log http://localhost:9061" 2>/dev/null || true
rm -rf "$ROOT"
```
