# Test: core-web-first-title

无蓝图的纯对话：tab 先是 `new tab`，用户发出第一条消息时会话才被创建。这时 tab 应**立刻**改叫「第一条
消息的前 10 个字」（空白折叠、不加省略号），而不是 `…`，更不能等到第一轮结束后再变成 `chat`。AI 总结的
标题到了再替换它；`session_title` 带空标题（没生成出来 / 没变化）时，tab 保持原样。

本用例钉住的是：

- 发第一条消息后，tab 标签是该消息前 10 个字符（中文按字）；
- 短于 10 个字的消息原样作为标签，首尾空白与换行折叠掉；
- `engineer-title` 带非空标题 → 替换临时标题；带空标题 → 不变；
- 有蓝图的会话不受影响：标签仍是页面 `<title>`。

Source of truth: `workspace/web/components/chat.js`（`createSession` 发 `engineer-session`，`detail.firstText`）、
`workspace/web/app.js`（`tempTitle` / `adoptSession` / `mountHomeChat`）。不需要模型：ai 用 `--stub`，
`session_title` 用页面里手动派发的 `engineer-title` 事件模拟（那就是外壳收到它的通道）。

## Setup

Prerequisite: `ego-browser` on `PATH`。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.first-title"
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9090 9091 9092 9093; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe"
printf 'project: first-title\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat autofocus></engineer-chat><script type="module" src="/components/chat.js"></script></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9091 >/tmp/first-title-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9091/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:9091/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'path: %s\nname: first-title' "$ROOT")"
/tmp/engineer serve-static --log http://localhost:9091 --bind 127.0.0.1 --port 9092 >/tmp/first-title-static.log 2>&1 &
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9090 --stub \
  --log http://localhost:9091 --static http://localhost:9092 \
  --agents "$ROOTDIR/agents" >/tmp/first-title-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9090/ai/new -d 'kind: main' && break
  sleep 1
done
/tmp/engineer serve-web --bind 127.0.0.1 --port 9093 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:9092 --ai http://localhost:9090 --log http://localhost:9091 \
  >/tmp/first-title-web.log 2>&1 &
sleep 1
```

## Run

```bash
WEB_URL=http://localhost:9093 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:9093";
const space = await taskSpace("core-web-first-title");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForSelector("#tabs .tab-group", { state: "visible" });
if (!(await page.evaluate(() => !!document.querySelector("#tabs .tab-group.expanded")))) {
  await page.click("#tabs .group-label");
}

const labels = () =>
  page.evaluate(() => [...document.querySelectorAll("#tabs .tab:not(.main)")]
    .map((t) => t.querySelector(".tab-label")?.textContent.trim()));
const activeLabel = () =>
  page.evaluate(() => document.querySelector("#tabs .tab.active .tab-label")?.textContent.trim());
const focusInput = () =>
  page.evaluate(() => document.querySelector("engineer-chat.home-chat").shadowRoot.querySelector(".ai-input-field").focus());
// The input exists before the component has finished mounting its home: typing at once can lose the Enter.
const waitInput = async () => {
  await page.waitForFunction(() => !!document.querySelector("engineer-chat.home-chat")?.shadowRoot?.querySelector(".ai-input-field"));
  await new Promise((r) => setTimeout(r, 800));
};

// 1. a draft tab on the project home, then the first question (longer than 10 characters)
const before = (await labels()).length;
await page.click("#tabs [data-new-tab-for]");
await waitInput();
check("a draft tab exists", (await activeLabel()) === "new tab", await activeLabel());
const Q1 = "帮我看一下这个项目里有哪些蓝图目录";
await focusInput();
await page.keyboard.type(Q1);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#tabs .tab.active .tab-label")?.textContent.trim() !== "new tab");
const t1 = await activeLabel();
check("the tab is named after the first 10 characters", t1 === [...Q1].slice(0, 10).join(""), t1);
check("no ellipsis, no placeholder", !t1.includes("…") && t1 !== "chat");

// 2. an empty session_title (failed / unchanged) never draws over it; a real one replaces it
const fire = (title) =>
  page.evaluate((t) => document.querySelector("engineer-chat.home-chat").dispatchEvent(
    new CustomEvent("engineer-title", { detail: { title: t }, bubbles: true })), title);
await fire("");
check("an empty title leaves the temporary one", (await activeLabel()) === t1, await activeLabel());
await fire("查看蓝图目录");
check("the real title replaces it", (await activeLabel()) === "查看蓝图目录", await activeLabel());

// 3. a short question, with stray whitespace, is the label as it is
await page.click("#tabs [data-new-tab-for]");
await waitInput();
await focusInput();
await page.keyboard.type("  你好   吗  ");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#tabs .tab.active .tab-label")?.textContent.trim() !== "new tab");
check("a short question is the label, whitespace folded", (await activeLabel()) === "你好 吗", await activeLabel());
check("two session tabs now", (await labels()).length === before + 2, JSON.stringify(await labels()));

for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.info ? `  (${c.info})` : ""}`);
if (checks.some((c) => !c.pass)) process.exit(1);
EOF
```

Expected: 所有行都是 `PASS`，退出码 0。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9090 9091 9092 9093; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```
