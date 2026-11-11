# Test: core-log-workspace-stream

`POST /log/workspace/stream`（SSE）：页面连上后，log 在工作区发生变化时推一个事件，事件只带
`seq` 和 `updatedAt`，不带内容；订阅者收到后自己去读。

用例钉住：

- 连上就先收到一个事件（`seq: 1`），页面据此做第一次对账；
- 写操作各推一个事件：`session/upsert`、`session/on`、`session/off`、`session/current/put`、
  `session/delete`、`project/visible`、`project/remove`；
- 读操作（`session/current/get`、`session/list`、`project/list`）不推；
- `seq` 逐个 +1，`updatedAt` 是 RFC3339。

只需要 log，不需要模型。

## Setup

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.ws-stream"
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: ws-stream\n' > "$ROOT/engineer.yaml"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9140 >/tmp/ws-stream-log.log 2>&1 &
LOG=http://localhost:9140
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/project/list -d '{}' && break
  sleep 1
done
PROJECT=$(curl -s -X POST $LOG/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}')
echo "project=$PROJECT"

# subscribe; everything the stream says lands in a file
: > /tmp/ws-stream-events
curl -s -N -X POST $LOG/log/workspace/stream -d '{}' > /tmp/ws-stream-events &
echo $! > /tmp/ws-stream-pid
sleep 1
events() { grep -c '^data: seq:' /tmp/ws-stream-events || true; }
```

## 1. 连上就有一个事件

```bash
events
cat /tmp/ws-stream-events
```

Expected: `1`；内容里 `seq: 1` 和一个 RFC3339 的 `updatedAt`；没有别的字段。

## 2. 写操作各推一个事件

```bash
n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/upsert -d "sessionId: s_aaaa0001
kind: sub
projectId: $PROJECT
blueprint: probe
title: Probe"
sleep 0.5; echo "upsert +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/on -d 'sessionIds: [s_aaaa0001]'
sleep 0.5; echo "on +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/off -d 'sessionIds: [s_aaaa0001]'
sleep 0.5; echo "off +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/current/put -d 'openSessions: []
mainSession: s_aaaa0001'
sleep 0.5; echo "put +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/project/visible -d "projectId: $PROJECT
visible: false"
sleep 0.5; echo "visible +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/delete -d 'sessionId: s_aaaa0001'
sleep 0.5; echo "delete +$(( $(events) - n0 ))"; n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/project/remove -d "projectId: $PROJECT"
sleep 0.5; echo "remove +$(( $(events) - n0 ))"
```

Expected: 每一行都是 `+1`。

## 3. 读操作不推

```bash
n0=$(events)
curl -s -o /dev/null -X POST $LOG/log/session/current/get -d '{}'
curl -s -o /dev/null -X POST $LOG/log/session/list -d 'pageNum: 1'
curl -s -o /dev/null -X POST $LOG/log/project/list -d '{}'
sleep 0.5; echo "reads +$(( $(events) - n0 ))"
grep '^data: seq:' /tmp/ws-stream-events | tr '\n' ' '
```

Expected: `reads +0`；`seq` 依次是 1, 2, …, 8，没有跳号、没有重复。

## Teardown

```bash
kill "$(cat /tmp/ws-stream-pid)" 2>/dev/null || true
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
rm -rf "$ROOT" /tmp/ws-stream-events /tmp/ws-stream-pid
```
