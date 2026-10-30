# Test: core-ai-image-reference

生图工具收参考图这件事有两半，用例把两半各钉一次：

1. **粘贴的图有名字了**：`registry.ask()` 在图片块后追加 `[image: <home>/.engineer/uploads/<sha>.png — /blobs/<sha>]`，
   这句话进 pi 的会话历史。模型随后把**那个路径**当 `reference` 传给 `image` 工具 —— 路径除了
   标记里，没有别的来源，所以工具参数里出现它，就等于标记真的到了模型眼里。
2. **参考图走了编辑这条路**：工具正文写出 `from 1 reference image(s)`（只有带参考图的分支
   会写这几个字），`details.references[0].sha256` 就是粘贴那张图的内容地址，新图另落一个 blob。

范围外：无参考图的 `/images/generations` 回归（`2610-27` 已验，本次只在冒烟脚本里看过一次）；
参考图给不存在的路径 / 超限的失败文案（不跑真模型也能看，属手工检查）。

## ⚠️ 这个用例需要真模型：一个 chat 模型 + 一个收参考图的生图模型

工具没有 HTTP 入口，只能由模型调用。本节用 `deepseek/deepseek-flash` 对话、
`zenmux-openai/openai/gpt-image-2` 生图（gpt-image 系列收参考图；dall-e 3 之类会 4xx）。
用例在这一轮的 home 里写 `models.yaml` 定这两个模型，不碰真实 home。

一次运行 = 1 次对话 + 1 次生图，按网关计费。

## Setup

Run from the project root (the directory holding `engineer.yaml`).

端口块 **9130-9132**，本用例独占。`ROOT` 不设就等于把机器上所有服务一起 pkill —— 所以先断言它。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.image-reference"
HOME_DIR="$ROOT/home"
: "${ROOT:?this case must set ROOT before reclaiming}"

pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9130 9131 9132; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: image-reference\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

# 用例自己定模型：chat 用 deepseek，image 用收参考图的 gpt-image-2。
cat > "$HOME_DIR/models.yaml" <<'YAML'
main:
  chat: deepseek/deepseek-flash
  image: zenmux-openai/openai/gpt-image-2

sub:
  chat: deepseek/deepseek-flash
  image: zenmux-openai/openai/gpt-image-2
YAML

# 一张 32x32 的纯红 PNG 当"用户粘贴的图"。
python3 - "$ROOT/paste.png" <<'PY'
import binascii, struct, sys, zlib
w = h = 32
raw = b"".join(b"\x00" + bytes([220, 40, 40, 255]) * w for _ in range(h))
def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", binascii.crc32(tag + data) & 0xFFFFFFFF)
png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw))
       + chunk(b"IEND", b""))
open(sys.argv[1], "wb").write(png)
PY
SHA=$(shasum -a 256 "$ROOT/paste.png" | awk '{print $1}')
echo "paste sha=$SHA"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9131 >/tmp/image-reference-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9131/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9131/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9131 --bind 127.0.0.1 --port 9132 >/tmp/image-reference-static.log 2>&1 &

LOG=http://localhost:9131
AI=http://localhost:9130

(cd workspace/ai && NO_PROXY='localhost,127.0.0.1' no_proxy='localhost,127.0.0.1' bun run src/main.ts \
  --home "$HOME_DIR" --bind 127.0.0.1 --port 9130 \
  --log "$LOG" --static http://localhost:9132 \
  --agents "$ROOTDIR/agents" >/tmp/image-reference-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
msgs() { curl -s -X POST $LOG/log/session/messages -d "sessionId: $1"; }
# askWithImage <sessionId> <text> <imageFile>
askWithImage() {
  python3 - "$1" "$2" "$3" > /tmp/image-reference-ask.json <<'PY'
import base64, json, sys
sid, text, path = sys.argv[1], sys.argv[2], sys.argv[3]
data = base64.b64encode(open(path, "rb").read()).decode()
print(json.dumps({"id": sid, "blocks": [
    {"type": "text", "text": text},
    {"type": "image", "mimeType": "image/png", "data": data},
]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/image-reference-ask.json
  curl -s -N -m 300 -X POST $AI/ai/stream -d "id: $1" >/tmp/image-reference-stream-$1.txt
}
```

Expected: `PROJECT` 是 `p_…`；`$(cd workspace/ai && bunx tsc --noEmit)` 干净；
`python3 -c "import json;print(json.load(open('$HOME/.pi/agent/auth.json')).get('zenmux-openai',{}).get('type'))"`
是 `api_key` —— 这是能生图的前提，不是断言本身。

## 1. 粘贴图带标记，模型把那个路径传回 `image`

```bash
SUB=$(curl -s -X POST $AI/ai/new \
  --data-binary "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\"}" | sid)
echo "sub=$SUB"

askWithImage $SUB "The image in this message carries a marker line in the prompt that names its file path \
and its /blobs address. Call the image tool right now with reference set to that exact file path and \
prompt \"the same picture, but blue instead of red\". Do not use bash, ls or read — use only the image tool." \
  "$ROOT/paste.png"

# 标记真的到了模型眼里：工具参数里有那条路径。
msgs $SUB | grep -c "$HOME_DIR/.engineer/uploads/$SHA.png"
# 记录里那条 user 消息：像素只存 sha，文本仍是用户写的那句。
msgs $SUB | grep -o 'sha256: [0-9a-f]\{64\}' | head -1
```

Expected: 第一条 `1`（或更多，工具 start/update/end 各出现一次）。路径只可能来自
`[image: <path> — /blobs/<sha>]` 那一行 —— 模型没有别的办法知道它。users 消息里的 sha256 等于
`$SHA`。

## 2. 走了编辑这条路，新图落了一个新 blob

```bash
msgs $SUB | grep -o 'from 1 reference image(s)'
msgs $SUB | grep -A3 '^references:' | head -4
NEW=$(msgs $SUB | grep -o 'served at /blobs/[0-9a-f]\{64\}' | head -1 | awk -F/ '{print $NF}')
echo "new=$NEW"
curl -s -o /tmp/image-reference-out.png -w '%{http_code} %{content_type} %{size_download}\n' "http://localhost:9130/blobs/$NEW"
shasum -a 256 /tmp/image-reference-out.png | awk '{print $1}'
ls "$HOME_DIR/.engineer/uploads" | wc -l
```

Expected: 正文出现 `from 1 reference image(s)`；`details.references` 里一条 `sha256: $SHA`；
`NEW` 是 64 位十六进制且不等于 `$SHA`；`/blobs/$NEW` 回 `200 image/png` 且下载字节的 sha256
就是 `$NEW`；uploads 目录里至少 2 个文件（粘贴的那张 + 新生成的那张）。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log http://localhost:9131" 2>/dev/null || true
rm -rf "$ROOT"
```

## 手工检查（不写进自动断言）

不花模型钱就能看的两条分支：

```bash
cd workspace/ai && bun -e '
import { makeImageTool } from "./src/images.ts";
const t = makeImageTool({ home: "/tmp/nothing", getImageModel: () => "zenmux-openai/openai/gpt-image-2" });
const r = await t.execute("x", { prompt: "p", reference: ["/tmp/definitely-not-here.png"] });
console.log(r.isError, r.content[0].text);   // true  no such file: /tmp/definitely-not-here.png
'
```

- 参考图路径不存在 → `no such file: <path>`，不发请求。
- 参考图是 `/blobs/<任意 64 位>` 但不在这个 home 的库里 → `no blob <sha> in this conversation's store …`。
