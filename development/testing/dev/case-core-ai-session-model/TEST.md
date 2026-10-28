# Test: core-ai-session-model

按会话的模型端到端。三个断言点，一个比一个硬：

1. `ai/new` 带 `model` 时，`/log/session/detail` 的 `model` 就是它（会话行）；
2. 会话内让 agent 调 `model` 工具切换后，会话记录里出现一条 `role: model`，
   且会话行的 `model` 变成切换后的那个；
3. **杀掉 ai 服务再 resume**，活的 agent 报告的当前模型仍是最后切换的那个——
   这一条才是「持久化」的意思（模型来自记录，不是来自 pi 的 settings）。

`model` 是 `provider/model-id`，本机有哪些可用的由 pi 自己的配置决定（`~/.pi/agent/models.json`
+ `auth.json`），所以下面的 `Setup` 从那里取两个 ref，而不是写死厂商名。pi 只配了一个模型时，
切换目标退回同一个 ref——第 2、3 段的持久化断言仍然成立，只有「换了型号」这一层变弱。

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

# Two refs pi can use right now, from pi's own config: the settings default first,
# then any other model the same provider lists. MODEL_B falls back to MODEL_A.
python3 > "$ROOT/.models" <<'PY'
import json, os
home = os.path.expanduser("~/.pi/agent")
settings = json.load(open(os.path.join(home, "settings.json")))
models = json.load(open(os.path.join(home, "models.json")))
providers = models.get("providers") or {}
first = None
pref = settings.get("defaultProvider")
refs = []
for pid, prov in providers.items():
    for m in (prov.get("models") or []):
        refs.append(f"{pid}/{m.get('id')}")
if pref and settings.get("defaultModel"):
    want = f"{pref}/{settings['defaultModel']}"
    if want in refs:
        refs.remove(want)
        refs.insert(0, want)
print(refs[0])
print(refs[1] if len(refs) > 1 else refs[0])
PY
MODEL_A=$(sed -n 1p "$ROOT/.models")
MODEL_B=$(sed -n 2p "$ROOT/.models")
echo "A=$MODEL_A B=$MODEL_B"

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
  python3 - "$1" "$2" "${3:-}" > /tmp/session-model-new.json <<'JSON'
import json, sys
body = {"blueprint": sys.argv[1], "projectId": sys.argv[2]}
if sys.argv[3]:
    body["model"] = sys.argv[3]
print(json.dumps(body))
JSON
  curl -s -X POST $AI/ai/new --data-binary @/tmp/session-model-new.json
}
```

Expected: `A=…` 与 `B=…` 各是一个 `provider/model-id`；ai 服务不打印
`--stub: model calls disabled`。

## 1. ai/new 的 model 落到会话行

```bash
curl -s -o /dev/null -w 'unknown model: %{http_code}\n' -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\",\"model\":\"no-such-provider/no-such-model\"}"
SUB=$(new_with probe "$PROJECT" "$MODEL_B" | sid)
echo "sub=$SUB"
detail $SUB
```

Expected: 未知模型是 `400`（pi 用不了的名字在这里就被挡下，不会写一个假的会话行）；
`sub` 是 `s_…`，`detail` 里 `kind: sub`、`blueprint: probe`、`title: Probe Page`、
`model: $MODEL_B`。

## 2. 会话内 model 工具切换：写记录，也写会话行

```bash
ask $SUB "用 model 工具把本会话切到 ${MODEL_A}，然后把工具回复原样念一遍。不要用 bash 或 curl，不要问我任何问题。"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB" | grep -E 'role: model|model: ' | head -5
detail $SUB
```

Expected: 记录里出现一条 `role: model`，其 `raw` 里 `model: $MODEL_A`；`detail` 的
`model` 从 `$MODEL_B` 变成 `$MODEL_A`。

## 3. 杀掉 ai 重启：模型仍是最后切换的那个

```bash
start_ai
curl -s -o /dev/null -w 'resume: %{http_code}\n' -X POST $AI/ai/resume -d "id: $SUB"
detail $SUB
ask $SUB "用 model 工具 list 一下，把标着 current 的那一行原样念出来。不要用 bash 或 curl，不要问我任何问题。"
grep -c 'current' /tmp/session-model-stream.txt
grep -o "${MODEL_A}[^\"]*current" /tmp/session-model-stream.txt | head -1
# 一条 model 记录写在工具调用的中间（assistant 的 toolCall 之后、toolResult 之前），
# 重放若把它当成消息，就会拆散那一对、丢一个真的工具结果。所以回放里不许有 repair。
grep -c 'history repair' /tmp/session-model-ai.log || true
```

Expected: `resume: 200`；`detail` 的 `model` 仍是 `$MODEL_A`（会话行没变）；
agent 自己列出来的 current 是 `$MODEL_A`——这是「记录里的选择真的被 build 用上了」的独立证据，
不是我们对会话行的自述；`history repair` 为 0——`model` 记录在回放里是透明的：它不是消息，
不许插在工具调用和它的结果之间。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log $LOG" 2>/dev/null || true
rm -rf "$ROOT"
```
