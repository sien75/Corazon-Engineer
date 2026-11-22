# Test: core-blueprint-single-file

一个 blueprint 就是一个 HTML 文件：它自带表（`blueprint/sql`）、自带编排（`blueprint/flow`）、
自带后端脚本（`blueprint/sh|js`），正文就是页面。它住在一个**项目**（导入的蓝图目录）里，不是项目本身；
prod 的 `/bp/<project>/<slug>` 在项目导入时就加载（解析、跑建表、注册 flow），页面开不开都一样；没有热重载，改文件
不生效，只有页面上的刷新按钮才重载；库按 `<meta id>` 落地，不重建。

这一条用例验证的正是这条链：按钮 → `ui.demo` → sh 脚本 → js 脚本 → 写表 → 页面 watch 收到整张表。
外加三条边界：后端块不进浏览器、`<\/script>` 能还原、坏蓝图给错误页而不是半活的运行时。

Source of truth：`workspace/blueprint/`（`serve.go` 路由与伺服、`parse.go` 解析、`store.go` 库、
`runtime.go` 总线与 flow、`exec.go` 脚本、`client.js` 页面的 `bp`）。

## Setup

前置：Go、Bun、`ego-browser` 在 `PATH` 上。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.blueprint-test"
HOME_DIR="$ROOT/home"
PROJECT="$ROOT/project"
BPS="$ROOT/blueprints"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$PROJECT" "$BPS"

# 项目(蓝图目录)记在 data home 的 config.yaml 里 — 导入即运行, 服务启动时就加载 prod
printf 'projects:\n  - id: demo\n    path: %s\nforeground: demo\n' "$BPS" >"$HOME_DIR/config.yaml"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8950 8951 8952; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

# the fixture: one blueprint, three backend blocks, a page with a button
cat >"$BPS/demo.html" <<'HTML'
<!doctype html>
<title>Demo</title>
<meta id="test.demo">

<script type="blueprint/sql">
  CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL);
</script>

<script type="blueprint/flow">
  - on: ui.demo
    steps:
      - id: shout
        run: build
      - id: decorate
        run: decorate
        with: ${{ steps.shout.output }}
      - sql: INSERT INTO runs(label) VALUES(:label)
        with:
          label: ${{ steps.decorate.output.label }}
      - emit: ui.done
        with:
          label: ${{ steps.decorate.output.label }}
</script>

<script type="blueprint/sh" id="build">printf '{"msg":"from sh"}'</script>
<script type="blueprint/js" id="decorate">
export default async (input) => ({ label: `${input.msg} -> js` });
</script>

<body>
<button id="run">run</button>
<div id="state"></div>
<table><tbody id="rows"></tbody></table>
<script>
  const rowsEl = document.getElementById("rows");
  bp.watch("runs", (rows) => {
    rowsEl.innerHTML = "";
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + row.id + "</td><td>" + row.label + "</td>";
      rowsEl.appendChild(tr);
    }
  });
  bp.on("ui.done", (data) => { document.getElementById("state").textContent = "done: " + data.label; });
  document.getElementById("run").onclick = () => bp.emit("ui.demo", { from: "button" });
</script>
</body>
HTML

# a second one that is deliberately broken: no <meta id>, so it cannot be filed
cat >"$BPS/broken.html" <<'HTML'
<!doctype html>
<title>Broken</title>
<script type="blueprint/sql">CREATE TABLE IF NOT EXISTS nope (id INTEGER);</script>
<body><p>no identity</p></body>
HTML

# an escaped </script> inside a backend block must come out intact
cat >"$BPS/escape.html" <<'HTML'
<!doctype html>
<title>Escape</title>
<meta id="test.escape">
<script type="blueprint/flow">
  - on: ui.x
    steps:
      - run: emit
      - emit: ui.y
</script>
<script type="blueprint/sh" id="emit">printf '{"text":"a <\/script> b"}'</script>
<body><p>escape</p></body>
HTML

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8951 >/tmp/blueprint-storage.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8951/log/session/list -d 'pageNum: 1' && break
  sleep 1
done

# --stub: no model call, so nothing here depends on a provider key
(cd workspace/ai && exec nohup bun src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8950 --stub \
  --storage http://localhost:8951 >/tmp/blueprint-ai.log 2>&1 </dev/null) &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8950/ai/new -d "cwd: $PROJECT" && break
  sleep 1
done

/tmp/engineer serve-blueprint --bind 127.0.0.1 --port 8952 \
  --engineer-home "$ROOTDIR" \
  --home "$HOME_DIR" \
  --cwd "$PROJECT" \
  --storage http://localhost:8951 --ai http://localhost:8950 \
  >/tmp/blueprint-service.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://localhost:8952/bp && break
  sleep 1
done
```

Expected：ai 日志里有 `--stub: model calls disabled`；blueprint 日志里有
`engineer blueprint: http://localhost:8952`。

## Run

### 1. 文件与路由（curl）

```bash
BASE=http://localhost:8952

# 目录页列出文件夹里的蓝图
curl -s "$BASE/bp" | grep -c 'href="/bp/demo/demo"'

# 页面照常是蓝图自己的 HTML，但一个后端块都不能有
curl -s "$BASE/bp/demo/demo" | grep -c "blueprint/sql\|blueprint/flow\|blueprint/sh\|blueprint/js\|CREATE TABLE"
# → 0

# 身份和标题在
curl -s "$BASE/bp/demo/demo" | grep -o '<meta id="test.demo">'

# 坏蓝图给错误页，并且说清为什么
curl -s -o /tmp/broken.html -w "%{http_code}\n" "$BASE/bp/demo/broken"
# → 500
grep -o 'no &lt;meta id' /tmp/broken.html
```

### 2. 一条链：emit → sh → js → 写表 → 页面 watch（curl）

```bash
# 页面就是已加载的蓝图（prod 在服务启动时就加载好了）；打开页面不重载文件
curl -s -o /dev/null "$BASE/bp/demo/demo"

# 挂在总线上，然后发事件
curl -s -N --max-time 8 "$BASE/bp/demo/demo/events" >/tmp/demo-events.txt &
sleep 1
curl -s -X POST "$BASE/bp/demo/demo/op" -d '{"op":"emit","type":"ui.demo"}'
# → {"ok":true}
sleep 3

# 事件流里应该两件事：自己发的 ui.demo，和 flow 跑完的 ui.done
grep -o '"type":"ui.demo"' /tmp/demo-events.txt
grep -o '"label":"from sh -\\u003e js"' /tmp/demo-events.txt
grep -c '"type":"flow.error"' /tmp/demo-events.txt
# → 0

# 表里确实有一行，而且是通过 :label 命名参数绑进去的
curl -s -X POST "$BASE/bp/demo/demo/op" -d '{"op":"watch","table":"runs"}'
# → {"rows":[{... "label":"from sh -> js"}]}
```

### 3. 转义还原（curl）

```bash
curl -s -o /dev/null "$BASE/bp/demo/escape"
curl -s -N --max-time 8 "$BASE/bp/demo/escape/events" >/tmp/escape-events.txt &
sleep 1
curl -s -X POST "$BASE/bp/demo/escape/op" -d '{"op":"emit","type":"ui.x"}' >/dev/null
sleep 2
# JSON 里 < > 被转成 \u003c / \u003e，所以按转义后的形状匹配
grep -o 'a \\u003c/script\\u003e b' /tmp/escape-events.txt
# → a \u003c/script\u003e b —— 也就是脚本里写的 a <\/script> b 原样还原成了 a </script> b
```

### 4. 浏览器里那条链（ego-browser）

```bash
BASE_URL=http://localhost:8952 ego-browser nodejs <<'EOF'
const BASE = process.env.BASE_URL || "http://localhost:8952";
const space = await taskSpace("core-blueprint-single-file");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${BASE}/bp/demo/demo`);
await page.waitForSelector("#run", { state: "visible" });

const shape = await page.evaluate(() => ({
  bp: typeof window.bp,
  mode: window.bp && window.bp.mode,
  backendBlocks: [...document.querySelectorAll("script[type^='blueprint/']")].length,
  metaId: document.querySelector("meta[id]")?.id || "",
  button: [...document.querySelectorAll("button")].map((b) => b.textContent).filter((t) => /reload|restart/.test(t)),
}));
check("the page has the channel", shape.bp === "object", { bp: shape.bp });
check("the page knows it is prod", shape.mode === "prod", { mode: shape.mode });
check("the reload button is in the corner", JSON.stringify(shape.button) === '["reload"]', { button: shape.button });
check("no backend block reached the browser", shape.backendBlocks === 0, { blocks: shape.backendBlocks });
check("the identity is on the page", shape.metaId === "test.demo", { metaId: shape.metaId });

const rowsBefore = await page.evaluate(() => document.querySelectorAll("#rows tr").length);
await page.click("#run", { label: "run the blueprint" });
await page.waitForFunction(() => (document.getElementById("state")?.textContent || "").includes("done"), undefined, { timeout: 20_000 });
const after = await page.evaluate(() => ({
  rows: document.querySelectorAll("#rows tr").length,
  first: document.querySelector("#rows tr")?.textContent || "",
  state: document.getElementById("state").textContent,
}));
check("the flow wrote a row and the page was pushed it", after.rows === rowsBefore + 1, { before: rowsBefore, after: after.rows });
check("the row came from the sh → js chain", after.first.includes("from sh -> js"), { first: after.first });
check("the emit step reached the page", after.state === "done: from sh -> js", { state: after.state });

// reopening the page keeps the data: the sqlite is filed under the identity
await page.goto(`${BASE}/bp/demo/demo`);
await page.waitForFunction(() => document.querySelectorAll("#rows tr").length > 0, undefined, { timeout: 20_000 });
const reopened = await page.evaluate(() => document.querySelectorAll("#rows tr").length);
check("reopening keeps the rows", reopened === after.rows, { before: after.rows, after: reopened });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected：`{"ok": true, ...}`，每一项 `pass` 都是 `true`。

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8950 8952; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```