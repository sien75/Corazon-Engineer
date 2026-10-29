# Test: core-ai-session-model

模型选择的优先级端到端：`models.yaml` 的角色默认 < 创建时传入 < 会话内切换；chat 和 image 两个 slot 各自独立。

1. **不传 chat** → 跑在 `models.yaml` 的 `sub.chat` 上，会话行 `model` 仍是空串
   （空 = 没有显式选择，所以改 `models.yaml` 对下一次恢复生效）；
2. `ai/new` 带 `chat`（旧名 `model` 仍是别名）→ 落到会话行；
3. 会话内让 agent 调 `model` 工具切换 chat → 记录里出现 `slot: chat`，会话行改写；
4. 创建时带 `image` → 落到会话行 `imageModel`；会话内 `model` 工具 `slot=image`
   切换 → 记录里出现 `slot: image`，`imageModel` 改写；
5. **杀掉 ai 重启** → chat 仍是最后切换的那个（记录压过 `models.yaml`），image 也是
   切换后的那个（记录压过创建时的 image 和配置）。

`MODEL_A` / `MODEL_B` 从 pi 自己的 chat 可用目录里取（`~/.pi/agent/models.json`），
然后写进 `$HOME_DIR/models.yaml`；pi 的 settings（`defaultProvider` / `defaultModel`）
不再参与模型选择。pi 只配了一个模型时，切换目标退回同一个 ref——第 3、5 段的持久化断言
仍然成立，只有「换了型号」这一层变弱。

`IMAGE_A` / `IMAGE_B` 是形状合法的生图 ref（`openrouter/...`）；生图还没有消费者，
所以这里只断言记录与持久化，不调用任何生图接口。

需要真模型（`model` 工具由模型决定调用），所以不传 `--stub`。

## Setup

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.session-model"
# log's database and the project board live in the engineer home.
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9070 9071 9072; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: session-model\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

# Two chat refs pi can use right now, from its own catalog. MODEL_B is written
# into models.yaml as the role default; MODEL_A is the switch target.
python3 > "$ROOT/.models" <<'PY'
import json, os
home = os.path.expanduser("~/.pi/agent")
models = json.load(open(os.path.join(home, "models.json")))
refs = []
for pid, prov in (models.get("providers") or {}).items():
    for m in (prov.get("models") or []):
        refs.append(f"{pid}/{m.get('id')}")
print(refs[0])
print(refs[1] if len(refs) > 1 else refs[0])
PY
MODEL_A=$(sed -n 1p "$ROOT/.models")
MODEL_B=$(sed -n 2p "$ROOT/.models")
echo "A=$MODEL_A B=$MODEL_B"

# Two image refs: shape-valid, not validated against a catalog (there is no image
# runtime yet). The ids themselves contain a slash, hence the two-slash refs.
IMAGE_A="openrouter/black-forest-labs/flux.2-flex"
IMAGE_B="openrouter/black-forest-labs/flux.2-klein-4b"
echo "IMAGE_A=$IMAGE_A IMAGE_B=$IMAGE_B"

# The engineer's own model config, not pi's settings. ai writes this file with
# defaults when it is missing; here it is written with MODEL_B so the default is
# distinguishable from the switch target.
cat > "$HOME_DIR/models.yaml" <<EOF
main:
  chat: $MODEL_B
  image: ""
sub:
  chat: $MODEL_B
  image: ""
EOF

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9071 >/tmp/session-model-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9071/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9071/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9071 --bind 127.0.0.1 --port 9072 >/tmp/session-model-static.log 2>&1 &

LOG=http://localhost:9071
AI=http://localhost:9070

# start_ai: (re)starts the ai service against the same home, and waits for it.
start_ai() {
  pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
  sleep 1
  (cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9070 \
    --log "$LOG" --static http://localhost:9072 \
    --agents "$ROOTDIR/agents" >>/tmp/session-model-ai.log 2>&1 &)
  for i in $(seq 1 60); do
    curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
    sleep 1
  done
}
start_ai

ask() {
  python3 - "$1" "$2" > /tmp/session-model-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/session-model-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/tmp/session-model-stream.txt
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
detail() { curl -s -X POST $LOG/log/session/detail -d "sessionId: $1"; }
# new_with writes a JSON body: ai speaks YAML, so several fields need one document,
# not curl's `-d` (which joins them with `&`, and YAML rejects that).
new_with() {
  python3 - "$1" "$2" "${3:-}" "${4:-}" > /tmp/session-model-new.json <<'JSON'
import json, sys
body = {"blueprint": sys.argv[1], "projectId": sys.argv[2]}
if sys.argv[3]:
    body["chat"] = sys.argv[3]
if sys.argv[4]:
    body["image"] = sys.argv[4]
print(json.dumps(body))
JSON
  curl -s -X POST $AI/ai/new --data-binary @/tmp/session-model-new.json
}
```

Expected: `A=…` / `B=…` 是 `provider/model-id`；`IMAGE_A` / `IMAGE_B` 各是
`openrouter/<org>/<id>`；`$HOME_DIR/models.yaml` 存在且 `sub.chat` 是 `$MODEL_B`；
ai 服务不打印 `--stub: model calls disabled`。

## 1. 不传 chat：落到 models.yaml 的 sub.chat

```bash
SUB0=$(new_with probe "$PROJECT" "" "" | sid)
echo "sub0=$SUB0"
detail $SUB0
ask $SUB0 "用 model 工具 list 一下，把标着 current 的那一行原样念出来。不要用 bash 或 curl，不要问我任何问题。"
grep -o "${MODEL_B}[^\"]*current" /tmp/session-model-stream.txt | head -1
```

Expected: `sub0` 是 `s_…`；`detail` 里 `kind: sub`、`blueprint: probe`、
**`model: ""`**（没有显式选择，默认值不写进会话行）；agent 自己报的 current 是
`$MODEL_B`——这是「配置里的默认真的被 build 用上了」的独立证据。

## 2. ai/new 的 chat 落到会话行（旧名 model 仍是别名）

```bash
curl -s -o /dev/null -w 'unknown chat: %{http_code}\n' -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\",\"chat\":\"no-such-provider/no-such-model\"}"
SUB=$(new_with probe "$PROJECT" "$MODEL_A" "" | sid)
echo "sub=$SUB"
detail $SUB
ALIAS=$(curl -s -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\",\"model\":\"$MODEL_A\"}" | sid)
echo "alias=$ALIAS"
detail $ALIAS
```

Expected: 未知 chat 是 `400`（pi 用不了的名字在这里就被挡下，不会写一个假的会话行）；
`SUB` 与 `ALIAS` 都是 `s_…`，`detail` 里 `kind: sub`、`blueprint: probe`、
`title: Probe Page`、`model: $MODEL_A`——旧字段 `model` 与 `chat` 等价。

## 3. 会话内 model 工具切换 chat：写 slot: chat 记录，也写会话行

```bash
ask $SUB "用 model 工具把本会话切到 ${MODEL_B}，然后把工具回复原样念一遍。不要用 bash 或 curl，不要问我任何问题。"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB" | grep -E 'slot: chat|role: model|model: ' | head -8
detail $SUB
```

Expected: 记录里出现一条 `role: model` 且带 `slot: chat`，其 `model` 是 `$MODEL_B`；
`detail` 的 `model` 从 `$MODEL_A` 变成 `$MODEL_B`。

## 4. image：创建时传入，会话内按 slot=image 切换

```bash
curl -s -o /dev/null -w 'bad image: %{http_code}\n' -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\",\"image\":\"no-slash\"}"
SUB_IMG=$(new_with probe "$PROJECT" "" "$IMAGE_A" | sid)
echo "sub_img=$SUB_IMG"
detail $SUB_IMG
ask $SUB_IMG "用 model 工具，slot 用 image，把本会话的 image 模型设为 ${IMAGE_B}。不要用 bash 或 curl，不要问我任何问题。"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB_IMG" | grep -E 'slot: image|role: model|model: ' | head -8
detail $SUB_IMG
```

Expected: 形状不对的 image 是 `400`；`SUB_IMG` 的 `detail` 里 `model: ""`（没传 chat）、
`imageModel: $IMAGE_A`（创建时传入）；切换后记录里出现 `role: model` 且带
`slot: image`、`model: $IMAGE_B`，`detail` 的 `imageModel` 变成 `$IMAGE_B`。

## 5. 杀掉 ai 重启：记录压过 models.yaml

重启前把配置里的 `sub.chat` 也写成 `$MODEL_A`（和记录里的 `$MODEL_B` 相反），
`image` 保持空：

```bash
cat > "$HOME_DIR/models.yaml" <<EOF
main:
  chat: $MODEL_A
  image: ""
sub:
  chat: $MODEL_A
  image: ""
EOF
start_ai
for s in "$SUB" "$SUB_IMG"; do
  curl -s -o /dev/null -w "resume $s: %{http_code}\n" -X POST $AI/ai/resume -d "id: $s"
done
detail $SUB
detail $SUB_IMG
ask $SUB "用 model 工具 list 一下，把标着 current 的那一行原样念出来。不要用 bash 或 curl，不要问我任何问题。"
grep -c 'current' /tmp/session-model-stream.txt
grep -o "${MODEL_B}[^\"]*current" /tmp/session-model-stream.txt | head -1
ask $SUB_IMG "用 model 工具 list 一下，slot 用 image，把 current 那一行原样念出来。不要用 bash 或 curl，不要问我任何问题。"
grep -o "${IMAGE_B}" /tmp/session-model-stream.txt | head -1
# 一条 model 记录写在工具调用的中间（assistant 的 toolCall 之后、toolResult 之前），
# 重放若把它当成消息，就会拆散那一对、丢一个真的工具结果。所以回放里不许有 repair。
grep -c 'history repair' /tmp/session-model-ai.log || true
```

Expected: 两条 `resume` 都是 `200`；`SUB` 的 `model` 仍是 `$MODEL_B`（记录里的 chat
压过刚改的配置）；`SUB_IMG` 的 `imageModel` 仍是 `$IMAGE_B`（记录里的 image 压过空配置）；
agent 自己列出的 chat current 是 `$MODEL_B`，image current 是 `$IMAGE_B`；
`history repair` 为 0。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log $LOG" 2>/dev/null || true
rm -rf "$ROOT"
```
