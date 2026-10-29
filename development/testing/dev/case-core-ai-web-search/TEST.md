# Test: core-ai-web-search

`web_search` 是第一个「真的出网」的工具：一个工具面，底下一张 provider 表，第一家是
DeepSeek 的 `POST https://api.deepseek.com/v1/tools/search`。用例要钉住三件事：

1. **sub（蓝图 agent）能搜**：一次 ask 之后，会话记录里有一条 `role: toolResult`，
   正文带工具自己渲染的前缀 `web_search · deepseek` 和一个 `https://` 链接 ——
   这个前缀只有工具会写，所以它同时证明「工具真的跑了」和「结果真的回来了」；
2. **main 也能搜**：同一个工具在 main 的会话里同样可用（`registry.ts` 的共享
   `customTools`，不是 `WORKSPACE_TOOLS`）；
3. **key 来自 pi 的配置**：ai 启动时不带任何 `--key`/环境变量，`~/.pi/agent/auth.json`
   里 `deepseek` 那一条既是对话用的 key、也是搜索用的 key，所以能通就说明复用成立。

范围外：没配 key 时的失败文案（真模型跑不起来那个分支，见文末"手工检查"）。

## ⚠️ 这个用例需要真模型和真的 DeepSeek key

工具只能由模型调用，没有 HTTP 入口。pi 自己的认证没配好时第 1、2 节就是红的。
ai 用真模型启动（**不加** `--stub`）。每一节都明确写「call the web_search tool right now …
do not use bash or curl」——否则模型很可能自己 `curl` 一遍 DeepSeek，被测的代码一行都没跑。

每次搜索按次计费（每 1000 次 5 元），本用例跑完是 2 次。

## Setup

Run from the project root (the directory holding `engineer.yaml`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.web-search"
# log's database and the project board live in the engineer home, not in a project.
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9090 9091 9092; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: web-search\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9091 >/tmp/web-search-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9091/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9091/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9091 --bind 127.0.0.1 --port 9092 >/tmp/web-search-static.log 2>&1 &

LOG=http://localhost:9091
AI=http://localhost:9090

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9090 \
  --log "$LOG" --static http://localhost:9092 \
  --agents "$ROOTDIR/agents" >/tmp/web-search-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

ask() {
  python3 - "$1" "$2" > /tmp/web-search-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/web-search-ask.json
  curl -s -N -m 180 -X POST $AI/ai/stream -d "id: $1" >/tmp/web-search-stream-$1.txt
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
msgs() { curl -s -X POST $LOG/log/session/messages -d "sessionId: $1"; }
```

Expected: `PROJECT` 是 `p_…`；`/tmp/web-search-ai.log` 里没有 `--stub: model calls disabled`；
`python3 -c "import json;print(json.load(open('$HOME/.pi/agent/auth.json')).get('deepseek',{}).get('type'))"`
是 `api_key`（这是第 3 条断言的前提，不是它本身）。

## 1. sub（蓝图 agent）能搜，结果进了记录

```bash
SUB=$(curl -s -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\"}" | sid)
echo "sub=$SUB"
ask $SUB "call the web_search tool right now with query \"DeepSeek API search\", count 3, then report the titles and urls it returned. Use the tool itself: do not use bash or curl, and do not answer from memory."
grep -o 'toolName: web_search' /tmp/web-search-stream-$SUB.txt | wc -l
msgs $SUB | grep -c 'role: toolResult'
msgs $SUB | grep -o 'web_search · deepseek' | head -1
msgs $SUB | grep -o 'https://[^ "]*' | head -3
```

Expected: `/ai/stream` 是 YAML 帧，`toolName: web_search` 出现至少 3 次（start / update / end 这一组），说明工具真的被调用了；记录里 `role: toolResult` 至少 1 条，
其中出现 `web_search · deepseek`（工具自己写的前缀）和至少一个 `https://` 链接。
工具报错时记录里会是 `isError: true` 且正文是失败原因——那就是这条断言红的样子。

## 2. main 也有这个工具

```bash
MAIN=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
echo "main=$MAIN"
ask $MAIN "call the web_search tool right now with query \"Corazon Engineer\", count 2, then report the titles and urls it returned. Use the tool itself: do not use bash or curl, and do not answer from memory."
grep -o 'toolName: web_search' /tmp/web-search-stream-$MAIN.txt | wc -l
msgs $MAIN | grep -o 'web_search · deepseek' | head -1
```

Expected: main 的会话同样出现 `web_search` 的调用，且记录里同样有 `web_search · deepseek`。
main 与 sub 的差别只在 `WORKSPACE_TOOLS`，`web_search` 在共享列表里，所以两边都该有。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log $LOG" 2>/dev/null || true
rm -rf "$ROOT"
```

## 手工检查（不写进自动断言）

没配 key 的分支跑不了真模型：pi 拿不到 deepseek 的 credential 时整轮根本起不来，工具也就
没有被调用的机会。所以这一条在服务外验证一次即可：

```bash
cd workspace/ai && DEEPSEEK_API_KEY= bun -e '
import { makeWebSearchTool } from "./src/search.ts";
const t = makeWebSearchTool({ keyFor: () => undefined });
const r = await t.execute("x", { query: "ping" });
console.log(r.isError, r.content[0].text);
'
```

Expected: `true` 与一句说明——no deepseek key、pi 的 credential 和 `DEEPSEEK_API_KEY` 都没给到。
