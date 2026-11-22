# Test: core-web-frame-purechat

外壳只剩两件事：**选一个蓝图目录**（右上角），和**打开其中一个蓝图**（顶部条的 tab）。外壳自己不再画对话。

- 顶部条是**打开的页面**：最左边是 `Overview`，永远在、没有 ×；后面每个打开过的蓝图一个 tab，带 ×。
- `Overview` 是外壳自己画的一页：前台项目里的蓝图列表（`GET /config/blueprints`），从这里点开一个蓝图。
  一个蓝图都没有时它就写"this folder has no blueprints yet"，页面不是空白也不再是一句错误。
- 点一个蓝图，多一个 tab，主体是一个 iframe，`src="/bp/<project>/<slug>"`，同源。
- **单例**：同一个蓝图再点一次不会再开一个 tab，回到已有的那个。`×` 关掉 tab 和它的 frame，回到前一个 tab
  （最左那个没了就回 Overview）。
- tab 和"哪个在前"都记在浏览器里（按目录分开），刷新后回来还是那几个 tab。
- Pure Chat 是一个普通蓝图（在用户的蓝图目录里）：页面里写一个 `<script type="blueprint/ai">` 节点（内容是提示词），会话由运行时代管：
  会话记在蓝图自己的 sqlite（`bp_ai` 表，一次会话一行），页面只有两个事件：`ai.info`（问现状/切会话）和
  `ai.request`（按 ai 自己的路径调一次，答复是 `ai.response`）。
- 打开页面**不建**会话：第一次发消息时页面才 `POST /ai/new`，那一段才进 `sessions`。
- 带 ai 节点的蓝图第一次打开要先填工作目录（壳弹框，填完存进 `config.yaml` 的 `folders`），不填不打开。
- 页面拿不到任何地址和路径：`window.bp` 里没有 `addr`；`bp.mode` 是 `prod`。
- 主题由**外壳**交给 frame：同一 origin，外壳在 frame 载入后往它自己的 document 上写 `data-theme`，
  并插入一个 `/theme.css` 的 `link`（带 `data-engineer-theme` 标记）；切换主题时对所有已开的 frame 再写一遍。
  蓝图页因此不需要知道主题的存在。

Source of truth: `workspace/web/shell/app.js`（外壳：条 + frame）、`workspace/web/shell/index.html`（结构）、
`workspace/web/serve.go`（文件服务、`/config.js`、转发）、`workspace/blueprint/serve.go`（`/config/blueprints`、
`/config/blueprints/folder`、`/blobs`）、`workspace/blueprint/ai.go`（ai 节点）、`<蓝图目录>/purechat.html`（Pure Chat 本身）。

## Setup

前置：`ego-browser` 在 `PATH` 上（`ego-browser --version`）。

蓝图目录用仓库外的一个临时目录，里面放这份 Pure Chat（用例自带一份，不依赖用户的目录）：

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.frame-test"
HOME_DIR="$ROOT/home"
BPS="$ROOT/blueprints"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$BPS"

cat >"$BPS/purechat.html" <<'HTML'
<!doctype html>
<title>Pure Chat</title>
<meta id="test.purechat">
<script type="blueprint/ai">You are a test agent.</script>
<body>
<textarea id="in"></textarea><pre id="log"></pre>
<script>
// Just enough of a page: ai.info for the state, ai.request for the calls, the run's
// events drawn as plain text.
const log = document.getElementById("log");
const textOf = (m) => (m.raw?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
let corr = 0, sid = "";
const pending = new Map();

bp.on("ai.info", (d) => {
  if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (!d.sessionId) return;
  sid = d.sessionId;
  document.body.dataset.session = sid;
  log.textContent = (d.messages || []).filter((m) => m.raw?.role === "assistant").map(textOf).join("\n");
});

bp.on("ai.response", (r) => {
  const box = pending.get(r.id);
  if (r.event) {
    const e = r.event.assistantMessageEvent;
    if (r.event.type === "message_update" && e?.type === "text_delta") log.textContent += e.delta;
    return;
  }
  if (r.done) return;
  if (box) { box(r); pending.delete(r.id); }
});

function ask(path, body) {
  const id = `c${++corr}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    bp.emit(path === "ai.info" ? "ai.info" : "ai.request", path === "ai.info" ? { id } : { id, path, body });
  });
}

document.getElementById("in").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const text = e.target.value;
  e.target.value = "";
  if (!sid) {
    const made = await ask("/ai/new", {});
    sid = made.body?.sessionId || "";
    document.body.dataset.session = sid;
  }
  await ask("/ai/ask", { id: sid, blocks: [{ type: "text", text }] });
  await ask("/ai/stream", { id: sid, since: 0 });
});

// Nothing is raised by opening the page: the check below proves it.
ask("ai.info");
</script>
</body>
HTML

printf 'projects:\n  - id: demo\n    path: %s\nforeground: demo\n' "$BPS" >"$HOME_DIR/config.yaml"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-web.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8990 8991 8992 8993; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8991 >/tmp/frame-storage.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 -X POST http://localhost:8991/log/session/list -d 'pageNum: 1'; then break; fi
  sleep 1
done

# --stub: the reply is the echo stub, so the run is deterministic and offline.
# The readiness probe must not create a conversation: a blob read for an address
# nobody stored answers 404 as soon as the service is listening.
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8990 --stub \
  --storage http://localhost:8991 >/tmp/frame-ai.log 2>&1 &)
for i in $(seq 1 60); do
  if curl -s -o /dev/null -m 2 "http://localhost:8990/blobs/0000000000000000000000000000000000000000000000000000000000000000"; then break; fi
  sleep 1
done

/tmp/engineer serve-blueprint --bind 127.0.0.1 --port 8992 \
  --home "$HOME_DIR" \
  --engineer-home "$ROOT" \
  --cwd "$ROOT" --storage http://localhost:8991 --ai http://localhost:8990 \
  >/tmp/frame-blueprint.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://localhost:8992/bp; then break; fi
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8993 \
  --home "$HOME_DIR" \
  --shell "$ROOTDIR/workspace/web/shell" \
  --blueprint http://localhost:8992 \
  --storage http://localhost:8991 --ai http://localhost:8990 \
  --cwd "$ROOT" >/tmp/frame-web.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://localhost:8993/; then break; fi
  sleep 1
done
```

Expected: ai 日志里有 `--stub: model calls disabled`；三个 `engineer …: http://localhost:899x`。

## Run

### 1. 条上的列表（curl）

```bash
# 前台项目的蓝图，文件顺序
curl -s http://localhost:8993/config/blueprints
# → {"project":"demo","blueprints":[{"folder":"","needsFolder":true,"slug":"purechat","title":"Pure Chat","url":"/bp/demo/purechat"}]}
#   带 ai 节点的蓝图要工作目录；还没关联时 folder 是空串

# bp.js 就是 window.bp，不带任何地址前导
curl -s http://localhost:8993/bp/demo/purechat/bp.js | head -c 120 | grep -c BP_ADDR   # → 0
```

### 2. 浏览器里那条链（ego-browser）

```bash
WEB_URL=http://localhost:8993 STORAGE_URL=http://localhost:8991 FOLDER="$ROOT" ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8993";
const STORAGE = process.env.STORAGE_URL || "http://localhost:8991";
const FOLDER = process.env.FOLDER;
const space = await taskSpace("core-web-frame-purechat");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const snapshot = () => page.evaluate(() => ({
  tabs: [...document.querySelectorAll("#tabs .tab")].map((t) => t.textContent.trim()),
  active: document.querySelector("#tabs .tab.active")?.dataset.tabId || "",
  closes: [...document.querySelectorAll("#tabs .tab-close")].length,
  rows: [...document.querySelectorAll("#overview-pane .launcher-item")].map((el) => el.textContent.trim()),
  frames: [...document.querySelectorAll("iframe.blueprint-frame")].map((f) => ({
    src: f.getAttribute("src"),
    hidden: f.hidden,
  })),
  chats: document.querySelectorAll("engineer-chat").length,
}));

await page.goto(`${WEB}/`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${WEB}/`);

// 1. the strip is Overview alone, and Overview is the blueprint list
await page.waitForSelector("#tabs .tab");
const first = await snapshot();
const shell = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme || "",
  dialog: !!document.querySelector("input[name='path']"),
}));
check("the strip is Overview alone", JSON.stringify(first.tabs) === '["Overview"]', first);
check("Overview has no close button", first.closes === 0, first);
check("Overview lists the folder's blueprint", JSON.stringify(first.rows) === '["Pure Chatpurechat"]', first);
check("nothing is framed before a blueprint is opened", first.frames.length === 0 && first.chats === 0, first);
check("no folder dialog when a folder is already imported", !shell.dialog, shell);
check("data-theme is drawn", !!shell.theme, { theme: shell.theme });

// 2. a blueprint with an ai node asks for its working folder before it opens
await page.evaluate(() => document.querySelectorAll("#overview-pane .launcher-item")[0].click());
await page.waitForSelector("input[name='path']", undefined, { timeout: 10_000 });
const askedFirst = await page.evaluate(() => ({
  framed: document.querySelectorAll("iframe.blueprint-frame").length,
  tab: !!document.querySelector("#tabs .tab[data-tab-id='purechat']"),
}));
check("the folder is asked for before anything is framed", askedFirst.framed === 0, askedFirst);
await page.fill("input[name='path']", "/no/such/folder");
await page.press("input[name='path']", "Enter");
await page.waitForFunction(() => /not a folder|must be an absolute/.test(document.querySelector("form")?.innerText || ""), undefined, { timeout: 10_000 });
check("a folder that does not exist is refused, and the dialog stays", true);
await page.fill("input[name='path']", FOLDER);
await page.press("input[name='path']", "Enter");
// then it opens: one tab, which frames the blueprint
await page.waitForSelector("#tabs .tab[data-tab-id='purechat']");
await page.waitForFunction(() => {
  const f = document.querySelector("iframe.blueprint-frame");
  const d = f && f.contentDocument;
  return !!(d && d.body && d.getElementById("in"));
}, undefined, { timeout: 30_000 });
const fresh = await page.evaluate(() => {
  const d = document.querySelector("iframe.blueprint-frame").contentDocument;
  return { session: d.body.dataset.session || "" };
});
check("opening the page raises no conversation", fresh.session === "", fresh);
const opened = await snapshot();
check("the blueprint tab is closable and in front", opened.closes === 1 && opened.active === "purechat", opened);
check("the frame is the one page, not hidden", opened.frames.length === 1 && !opened.frames[0].hidden, opened);

const frame = await page.evaluate(() => {
  const f = document.querySelector("iframe.blueprint-frame");
  const d = f.contentDocument;
  return {
    src: f.getAttribute("src"),
    session: d.body.dataset.session || "",
    bpMode: d.defaultView.bp?.mode || "",
    addr: d.defaultView.bp?.addr ?? null,
    theme: d.documentElement.getAttribute("data-theme"),
    themeCss: !!d.querySelector("link[data-engineer-theme]"),
  };
});
check("the frame points at this blueprint's page", frame.src === "/bp/demo/purechat", { src: frame.src });
check("the page was served as prod", frame.bpMode === "prod", { mode: frame.bpMode });
check("the page is told no address and no path", frame.addr === null, frame.addr);
// 这一段还没建会话：检查在发第一条消息之后（第 4 步）
check("the frame carries the shell's theme", frame.theme === "light" && frame.themeCss, frame);

// 3. it is one tab per blueprint: opening the same one again comes back to it
await page.click("#tabs .tab[data-tab-id='overview']", { label: "back to Overview" });
await page.evaluate(() => document.querySelectorAll("#overview-pane .launcher-item")[0].click());
await page.waitForSelector("#tabs .tab[data-tab-id='purechat']");
await page.waitForTimeout(500);
const again2 = await snapshot();
check("opening it again adds no tab and no frame", again2.tabs.length === 2 && again2.frames.length === 1, again2);
check("it is in front again", again2.active === "purechat", again2);

// 4. it is one conversation: a message goes to that session, and a reload reuses it
await page.evaluate(() => {
  document.querySelector("iframe.blueprint-frame").contentDocument.getElementById("in").focus();
});
await page.keyboard.type("hello through the frame");
await page.keyboard.press("Enter");
await page.waitForFunction(() => {
  const d = document.querySelector("iframe.blueprint-frame")?.contentDocument;
  return (d?.getElementById("log")?.textContent || "").includes("dev stub");
}, undefined, { timeout: 60_000 });
const raised = await page.evaluate(() => document.querySelector("iframe.blueprint-frame").contentDocument
  .body.dataset.session);
check("the first message raised one conversation", /^s_[0-9a-f]+$/.test(raised), { session: raised });

await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id='purechat']");
await page.waitForFunction(() => {
  const d = document.querySelector("iframe.blueprint-frame")?.contentDocument;
  return (d?.getElementById("log")?.textContent || "").includes("dev stub");
}, undefined, { timeout: 30_000 });
const again = await page.evaluate(() => document.querySelector("iframe.blueprint-frame").contentDocument
  .body.dataset.session);
check("a reload reuses the one session the blueprint stored", again === raised,
  { before: raised, after: again });
const restored = await snapshot();
check("a reload brings the open tab back", restored.tabs.length === 2 && restored.active === "purechat", restored);

const count = await page.evaluate(async (storage) => {
  const res = await fetch(`${storage}/log/session/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  });
  return (String(await res.text()).match(/sessionId:\s*\S+/g) || []).length;
}, STORAGE);
check("one session on the board, not one per page load", count === 1, { count });

// 5. closing the tab takes its page away; Overview is still there
await page.evaluate(() => document.querySelector("#tabs .tab[data-tab-id='purechat'] .tab-close").click());
await page.waitForTimeout(500);
const closed = await snapshot();
check("closing the tab removes the tab and its frame",
  JSON.stringify(closed.tabs) === '["Overview"]' && closed.frames.length === 0, closed);
check("the stage falls back to Overview", closed.active === "overview", closed);

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected: `{"ok": true, ...}`，每一项 `pass` 都是 `true`。

Expected: `{"ok": true, ...}`，每一项 `pass` 都是 `true`。

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-web.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8990 8992 8993; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```
