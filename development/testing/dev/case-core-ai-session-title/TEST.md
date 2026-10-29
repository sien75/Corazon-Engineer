# Test: core-ai-session-title

标题自动总结端到端。起点是 blueprint 页面的 `<title>`（`Probe Page`），第 1 轮对话结算后
ai 用本会话的模型生成一个新标题写回 `/log/session/upsert`，于是 `/log/session/detail` 的
`title` 变了——tab 名下一次刷新就跟着变（`app.js` 的 `doRefreshWorkspace` 读的就是这个字段，
浏览器侧不新增断言）。

这一条依赖真模型（标题是模型生成的），所以断言用「不等于初始标题、非空、不像一整段话」，
不断言具体文案。标题只在第 1 轮总结一次（`registry.ts` 的 `titleDue` 只在 `turns === 1` 为真），
之后的轮次不再改名；本用例只跑第 1 轮，再多跑轮次既慢又贵，也验证不出什么新东西。

## Setup

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.session-title"
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9080 9081 9082; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: session-title\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9081 >/tmp/session-title-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9081/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9081/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:9081 --bind 127.0.0.1 --port 9082 >/tmp/session-title-static.log 2>&1 &
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9080 \
  --log http://localhost:9081 --static http://localhost:9082 \
  --agents "$ROOTDIR/agents" >/tmp/session-title-ai.log 2>&1 &)

LOG=http://localhost:9081
AI=http://localhost:9080
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
title_of() { curl -s -X POST $LOG/log/session/detail -d "sessionId: $1" | sed -n 's/^title: //p'; }
# ask <session> <prompt> [stream-file] — 发一轮，然后读这一轮的流（默认为 /dev/null）。
# 顺序和页面一致：先 ask（服务端这时就把 active 立起来），再开流；空闲时开的流会立刻关掉。
ask() {
  python3 - "$1" "$2" > /tmp/session-title-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1], "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/session-title-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" > "${3:-/dev/null}"
}

# ai speaks YAML, so two fields are one document — not curl's `-d` (it joins them
# with `&`, which YAML rejects).
SUB=$(curl -s -X POST $AI/ai/new --data-binary \
  "{\"blueprint\":\"probe\",\"projectId\":\"$PROJECT\"}" | sid)
echo "sub=$SUB"
echo "title0=$(title_of $SUB)"
```

Expected: `sub` 是 `s_…`，`title0=Probe Page`——起点是页面的 `<title>`，还没有任何对话。

## 0. 窗口与清洗（纯函数，不需要模型）

「用哪些消息」是 `title.ts` 里的纯函数，而这里能钉住同一件事：第 1 轮的窗口只含第 1 轮
（之后的提问不进名字），thinking / 工具调用 / 工具结果 / `model` 记录都不进
材料；模型写的「带引号且带句号」的标题会被清干净。

```bash
cat > /tmp/session-title-unit.ts <<'TS'
import { titleMaterial, cleanTitle } from "WORKSPACE_AI/src/title.ts";

const recs: any[] = [];
let seq = 1;
for (let i = 1; i <= 25; i++) {
  recs.push({ seq: seq++, role: "user", content: `Q${i}`, raw: { role: "user", content: [{ type: "text", text: `Q${i}` }] } });
  recs.push({
    seq: seq++,
    role: "assistant",
    content: "",
    raw: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: `THINK${i}` },
        { type: "toolCall", id: `c${i}`, name: "bash", arguments: {} },
        { type: "text", text: `A${i}` },
      ],
    },
  });
  recs.push({ seq: seq++, role: "toolResult", content: "", raw: { role: "toolResult", toolCallId: `c${i}`, content: [] } });
  if (i === 1) recs.push({ seq: seq++, role: "model", content: "", raw: { role: "model", model: "x/y" } });
}
const checks: [string, boolean][] = [];
const m1 = titleMaterial(recs, 1);
checks.push(["turn 1 holds only turn 1", m1.includes("Q1") && !m1.includes("Q2")]);
checks.push(["turn 1 ends before Q2 (later prompts stay out)", !m1.includes("Q3") && !m1.includes("Q25")]);
checks.push(["assistant prose included", m1.includes("A1")]);
checks.push(["thinking excluded", !m1.includes("THINK")]);
checks.push(["tool results excluded", !m1.includes("toolResult")]);
checks.push(["model rows excluded", !m1.includes("x/y")]);
checks.push(["cleanTitle strips quotes and full stop", cleanTitle('  "看蓝图目录"。\n解释：这是标题') === "看蓝图目录"]);
checks.push(["cleanTitle takes the first line", cleanTitle("标题一行\n第二行") === "标题一行"]);
// 标题要短：中文 10 个字以内、英文 2-4 个单词。兜底按语言选一档数，切点不落在英文单词中间。
checks.push(["cleanTitle keeps a 10-character Chinese title", cleanTitle("排查登录失败的问题") === "排查登录失败的问题"]);
checks.push(["cleanTitle caps a Chinese title at 10 characters", cleanTitle("修复登录失败的问题并重试") === "修复登录失败的问题并"]);
checks.push(["cleanTitle drops what the cut left trailing", cleanTitle("一二三四五六七八九十，十一十二") === "一二三四五六七八九十"]);
checks.push(["cleanTitle never cuts a Latin word in half", cleanTitle("一二三四五六七八九并login按钮") === "一二三四五六七八九并"]);
checks.push(["cleanTitle caps an English title at 4 words", cleanTitle("add a reload button to the tab bar") === "add a reload button"]);
checks.push(["cleanTitle keeps a short English title", cleanTitle("fix login flow") === "fix login flow"]);
// 标题站在用户这边：主语要是漏进来（"助手总结工具"），剥掉它——错的视角比钝的动词更糟。
checks.push(["cleanTitle drops 助手 as subject", cleanTitle("助手总结工具") === "总结工具"]);
checks.push(["cleanTitle drops 用户 as subject", cleanTitle("用户询问工具") === "询问工具"]);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
TS
# 把占位符换成这台机器上的路径（不写死 checkout，也不用平台相关的 sed -i）。
python3 - "$ROOTDIR/workspace/ai" <<'PY'
import pathlib, sys
p = pathlib.Path("/tmp/session-title-unit.ts")
p.write_text(p.read_text().replace("WORKSPACE_AI", sys.argv[1]))
PY
(cd workspace/ai && bun run /tmp/session-title-unit.ts)
```

Expected: 所有行都是 `PASS`，退出码 0。

## 1. 第一轮之后标题被总结替换，而且**随流推下来**

名字不是靠页面上轮询发现的：这一轮的流会**越过 `agent_settled`**，一直开到名字生成完，
再把 `session_title` 送下来——外壳（tab 条）就是收到它就改名。所以这一段一边发问一边盯流。

```bash
# 这一轮的流整段留在一个文件里：名字应该出现在 agent_settled 之后，随后服务端关流。
ask $SUB "帮我看一下这个项目里 .agents/blueprints 下有哪些蓝图目录，用一句话告诉我结论。" \
  /tmp/session-title-stream.txt
echo "--- 事件顺序："
grep -n '^data: type: \(agent_settled\|session_title\)' /tmp/session-title-stream.txt
echo "--- 推下来的名字："
grep -A2 'data: type: session_title' /tmp/session-title-stream.txt | sed -n 's/^data: title: //p'
# 标题是 detach 的后台任务：轮询到它不是 Probe Page 为止（最多 90 秒）。
for i in $(seq 1 90); do
  T=$(title_of $SUB)
  [ -n "$T" ] && [ "$T" != "Probe Page" ] && break
  sleep 1
done
echo "title1=$T"
python3 - "$T" <<'PY'
import re, sys
t = sys.argv[1]
print("len:", len(t))
assert t and t != "Probe Page", "title was never summarized"
assert "\n" not in t, "title is multi-line"
# 标题要短：中文 10 个字以内，英文 2-4 个单词（cleanTitle 兜底保证，提示词也要它短）。
cjk = len(re.findall(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", t))
if cjk:
    assert cjk <= 10, f"too many Chinese characters ({cjk}): {t}"
else:
    assert len(t.split()) <= 4, f"too many English words ({len(t.split())}): {t}"
# 用户视角：标题写「用户做了什么」，所以不能带主语。
bad = ("助手", "AI", "ai", "模型", "用户", "我")
assert not t.startswith(bad), f"title starts with a subject: {t}"
PY
echo "ok"
```

Expected: `agent_settled` 的行号小于 `session_title` 的行号（流没在收工时关掉；一个**空闲**时
打开的流会立刻关掉，所以这里必须像页面一样「先 ask 再开流」），
推下来的 `title` 与随后 `title_of` 读到的一致；`title1=` 是一个概括这轮对话的短标题
（不是 `Probe Page`，不含换行，**中文不超过 10 个字 / 英文不超过 4 个单词**，
**不以「助手 / AI / 模型 / 用户 / 我」开头**），脚本打印 `ok`。

## 2. 标题生成不往会话记录里加东西

```bash
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB" | python3 -c '
import sys, yaml
msgs = yaml.safe_load(sys.stdin)["messages"]
print("records:", len(msgs))
print("user:", sum(1 for m in msgs if m.get("role") == "user"))
print("model:", sum(1 for m in msgs if m.get("role") == "model"))
'
```

Expected: `user: 1`、`model: 0`，`records` 是「提问 + 回答（+ 工具调用与结果）」的条数（≥ 2）——
标题生成是带外的模型调用，不是对话内容，既不进上下文也不占 seq，所以记录里看不出它发生过。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log $LOG" 2>/dev/null || true
rm -rf "$ROOT"
```
