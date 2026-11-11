# Test: core-ai-image-vertex

`image` 工具现在有四种请求形状（`2611-63`）。前两种（OpenAI `/images/generations`、
chat-completions 的 image 模态）已经被别的用例压过；本用例钉后两种，它们同属一个
Vertex 形状的 base：**Gemini `:generateContent`** 与 **ImageN `:predict`**，
以及「先试哪个」由声明定，不靠盲试。

钉两半：

1. **声明决定形状**：provider 写 `api: google-vertex` 时，一次调用只发一个请求，
   落在 `…/publishers/google/models/<id>:generateContent`，`details.shape` 是 `gemini`。
   这条同时排除了「先试 images、再试 chat」的老链——那条链在 Vertex 形状的 base 上会先撞
   404、再撞 **500**（`/chat/completions` 在 `/api/vertex-ai` 根下不存在），
   这正是不能靠失败试出来的理由。
2. **图真的落下来了**：`/blobs/<sha>` 回 200，下载字节的 sha256 就是那个地址。
3. **`:predict` 是同一个 provider 的第二条路**：同一个 `zenmux-vertex` provider 换成
   `qwen/qwen-image-3.0`，工具落在 `…/publishers/qwen/models/qwen-image-3.0:predict`，
   `details.shape` 是 `predict`（vendor 前缀去掉、publisher 按映射给）。

范围外：`openai/gpt-image-2.6-flare` 走 `/images/generations` 的回归（`case-core-ai-image-reference`
与 `2610-27` 覆盖）；参考图在这两种形状里的编辑语义（`inlineData` 收图）只做到形状实现，
没有专门用例——它走的是同一段参考图代码。

## ⚠️ 这个用例需要真模型和一条真凭据

工具没有 HTTP 入口，只能由模型调用。本用例用 `deepseek/deepseek-flash` 对话、
`zenmux-vertex/google/gemini-3.1-flash-image` 生图，两个都写在用例自己的 home 里，不碰真实 home。

前提是 `~/.pi/agent/auth.json` 里有 `zenmux-vertex` 这条 key（`api_key`），且
`~/.pi/agent/models.json` 里有 `zenmux-vertex` provider（`baseUrl: https://zenmux.ai/api/vertex-ai`、
`api: google-vertex`）。缺任何一条，工具会在开口之前就报 `pi holds no credential for …` /
`pi knows no baseUrl …` —— 那不是本用例的断言，是跑不起来。

一次运行 = 1 次对话 + 1 次生图，按网关计费。

## Setup

Run from the project root (the directory holding `engineer.yaml`).

端口块 **9133-9135**，本用例独占。`ROOT` 不设就等于把机器上所有服务一起 pkill —— 所以先断言它。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.image-gemini"
HOME_DIR="$ROOT/home"
: "${ROOT:?this case must set ROOT before reclaiming}"

pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9133 9134 9135; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: image-gemini\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

# 用例自己定模型：Gemini 生图挂在 vertex 协议的 provider 上。
cat > "$HOME_DIR/models.yaml" <<'YAML'
main:
  chat: deepseek/deepseek-flash
  image: zenmux-vertex/google/gemini-3.1-flash-image

sub:
  chat: deepseek/deepseek-flash
  image: zenmux-vertex/google/gemini-3.1-flash-image
YAML

# 凭据与 provider 在真实 pi 配置里，先确认它们在，缺了就早失败而不是等模型说话。
python3 - <<'PY'
import json, os, sys
agent = os.path.expanduser("~/.pi/agent")
auth = json.load(open(os.path.join(agent, "auth.json")))
models = json.load(open(os.path.join(agent, "models.json")))
ok_auth = auth.get("zenmux-vertex", {}).get("type") == "api_key"
provider = models.get("providers", {}).get("zenmux-vertex", {})
ok_provider = provider.get("api") == "google-vertex" and "vertex-ai" in (provider.get("baseUrl") or "")
print("auth:", ok_auth, "provider:", ok_provider)
if not (ok_auth and ok_provider):
    sys.exit("zenmux-vertex 的凭据或 provider 不在 ~/.pi/agent 里，用例跑不了")
PY

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9134 >/tmp/image-gemini-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9134/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9134/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9134 --bind 127.0.0.1 --port 9135 >/tmp/image-gemini-static.log 2>&1 &

LOG=http://localhost:9134
AI=http://localhost:9133

(cd workspace/ai && NO_PROXY='localhost,127.0.0.1' no_proxy='localhost,127.0.0.1' bun run src/main.ts \
  --home "$HOME_DIR" --bind 127.0.0.1 --port 9133 \
  --log "$LOG" --static http://localhost:9135 \
  --agents "$ROOTDIR/agents" --docs "$ROOTDIR/.engineer/docs" >/tmp/image-gemini-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
msgs() { curl -s -X POST $LOG/log/session/messages -d "sessionId: $1"; }
ask() {
  python3 - "$1" "$2" > /tmp/image-gemini-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/image-gemini-ask.json
  curl -s -N -m 300 -X POST $AI/ai/stream -d "id: $1" >/tmp/image-gemini-stream-$1.txt
}
```

Expected: `PROJECT` 是 `p_…`；两条前置检查都是 `True`；`$(cd workspace/ai && bunx tsc --noEmit)` 干净；
ai 日志里没有 `zenmux-vertex` 的解析告警（provider 与凭据都被 pi 认了）。

## 1. 一次调用，落在 `:generateContent`

```bash
SUB=$(curl -s -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\"}" | sid)
echo "sub=$SUB"

ask $SUB "Call the image tool exactly once with prompt \"a red apple on a wooden table\" and size 1024x1024. \
Do not use bash, ls or read. Then report the one line the tool returned."

# 工具真的打了 Gemini：正文里那行是工具自己写的
msgs $SUB | grep -o 'generated 1 image (1024x1024, image/png) with zenmux-vertex/google/gemini-3.1-flash-image'
```

Expected: 那一行出现一次（工具正文）。没有 `HTTP 404` / `HTTP 500` / `returned no image` 这些字样：

```bash
msgs $SUB | grep -E 'HTTP (404|500)|returned no image' | head -3
```

Expected: 空。

## 2. 形状是 `gemini`，不是 images / chat

```bash
msgs $SUB | grep -o 'shape: gemini' | head -1
msgs $SUB | grep -o 'shape: "gemini"'
```

Expected: 至少一条命中——`shape` 落在工具结果的 details 里（记录里以 `shape: gemini` 或
JSON 的 `"shape": "gemini"` 出现，两者都算）。形状选错时这里会是 `images` 或 `chat`，
而正文那句也不会出现。

## 3. 图落到 blob 店，`/blobs/<sha>` 回的就是它

```bash
NEW=$(msgs $SUB | grep -o 'served at /blobs/[0-9a-f]\{64\}' | head -1 | awk -F/ '{print $NF}')
echo "new=$NEW"
curl -s -o /tmp/image-gemini-out.png -w '%{http_code} %{content_type} %{size_download}\n' "http://localhost:9133/blobs/$NEW"
shasum -a 256 /tmp/image-gemini-out.png | awk '{print $1}'
```

Expected: `NEW` 是 64 位十六进制；`/blobs/$NEW` 回 `200 image/png` 且非零字节；下载字节的
sha256 等于 `$NEW`。

## 4. 同一个 provider 的第二条路：`:predict`

`ai/new` 可以给会话指定 image 模型，所以这一半不碰 `models.yaml`，直接开一个新会话把 image 槽
换成 qwen。工具会先打 `:generateContent`（404），再落 `:predict`。

```bash
SUB2=$(curl -s -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\",\"image\":\"zenmux-vertex/qwen/qwen-image-3.0\"}" | sid)
echo "sub2=$SUB2"

ask $SUB2 "Call the image tool exactly once with prompt \"a red apple on a wooden table\" and size 1024x1024. \
Do not use bash, ls or read. Then report the one line the tool returned."

msgs $SUB2 | grep -o 'generated 1 image (1024x1024, image/jpeg) with zenmux-vertex/qwen/qwen-image-3.0'
msgs $SUB2 | grep -o '"shape": "predict"'
```

Expected: 正文那行命中（qwen 回 jpeg，所以 mime 是 `image/jpeg`），且 `"shape": "predict"`
至少一条。形状选错时这里会是 `gemini` 或整条失败 —— `:predict` 是 Gemini 模型不认的形状，
反过来也一样，所以这一条同时证明「404 才换形状」。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log http://localhost:9134" 2>/dev/null || true
rm -rf "$ROOT"
```

## 手工检查（不写进自动断言）

不花模型钱就能看的一条：形状选择是声明驱动的，连网关都不用碰。

```bash
cd workspace/ai && bun -e '
import { makeImageTool } from "./src/images.ts";
const calls = [];
const f = async (u) => {
  calls.push(String(u));
  if (String(u).endsWith("/images/generations")) return new Response("{}", { status: 404 });
  if (String(u).endsWith("/chat/completions")) return new Response("{}", { status: 500 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: "iVBORw0KGgo=" } }] } }] }));
};
const runtime = {
  getProvider: () => ({ baseUrl: "https://zenmux.ai/api/vertex-ai" }),
  getRegisteredProviderConfig: () => undefined,
  getModel: () => ({ api: "google-vertex" }),
  getAuth: async () => ({ auth: { apiKey: "k" } }),
};
const t = makeImageTool({ runtime, home: "/tmp/gemini-smoke", getImageModel: () => "zenmux-vertex/google/gemini-3.1-flash-image", fetch: f });
await t.execute("x", { prompt: "p" });
console.log(calls);   // 只有一个 :generateContent — images/chat 一次都没打
'
```

- `calls` 只有一条 `…/publishers/google/models/gemini-3.1-flash-image:generateContent`
  （注意 `google/` 前缀被去掉、`/v1` 只补一次）。
- 把 `getModel` 换成 `() => ({ api: "openai-completions" })`，同一条脚本会先打
  `/images/generations`：这就是「没声明时的兜底链」，两条都 404 才会轮到 gemini。
