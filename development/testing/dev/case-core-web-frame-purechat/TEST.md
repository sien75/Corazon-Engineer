# Test: core-web-frame-purechat

外壳只剩两件事：**选一个蓝图目录**（右上角），和**打开其中一个蓝图**（顶部条的 tab）。外壳自己不再画对话。

- 顶部条是**打开的页面**：最左边是 `Overview`，永远在、没有 ×；后面每个打开过的蓝图一个 tab，带 ×。
- `Overview` 是外壳自己画的一页：前台项目里的蓝图列表（`GET /config/blueprints`），从这里点开一个蓝图。
  一个蓝图都没有时它就写"this folder has no blueprints yet"，页面不是空白也不再是一句错误。
- 点一个蓝图，多一个 tab，主体是一个 iframe，`src="/bp/<project>/<slug>"`，同源。
- **单例**：同一个蓝图再点一次不会再开一个 tab，回到已有的那个。`×` 关掉 tab 和它的 frame，回到前一个 tab
  （最左那个没了就回 Overview）。
- tab 和"哪个在前"都记在浏览器里（按目录分开），刷新后回来还是那几个 tab。
- Pure Chat 是一个普通蓝图（在用户的蓝图目录里）：它把 session id 存在自己的表 `chat_state` 里，
  第一次打开时 `POST /chat/session` 开一段对话（web 转给 blueprint，由 blueprint 拼 spec），之后一直用同一个。
- 页面里的 `bp.addr` 给出 `ai` / `storage` 两个地址；`bp.mode` 是 `prod`。
- 主题由**外壳**交给 frame：同一 origin，外壳在 frame 载入后往它自己的 document 上写 `data-theme`，
  并插入一个 `/theme.css` 的 `link`（带 `data-engineer-theme` 标记）；切换主题时对所有已开的 frame 再写一遍。
  蓝图页因此不需要知道主题的存在。

Source of truth: `workspace/web/shell/app.js`（外壳：条 + frame）、`workspace/web/shell/index.html`（结构）、
`workspace/web/serve.go`（文件服务、`/config.js`、转发）、`workspace/blueprint/serve.go`（`/config/blueprints`、
`bp.js` 的地址前导）、`<蓝图目录>/purechat.html`（Pure Chat 本身）。

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
<script type="blueprint/sql">
  CREATE TABLE IF NOT EXISTS chat_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
</script>
<style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column;overflow:hidden}
#stage{flex:1 1 0;min-height:0;display:flex}#stage>engineer-chat{flex:1 1 0;min-width:0;min-height:0}</style>
<div id="stage"></div>
<script type="module">
const stage = document.getElementById("stage");
try {
  await import("/components/chat.js");
  const rows = await bp.sql("SELECT v FROM chat_state WHERE k = 'session'");
  let id = rows.length ? String(rows[0].v) : "";
  if (!id) {
    const res = await fetch("/chat/session", { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.message || body?.error || res.status);
    id = String(body.sessionId || "");
    await bp.sql("INSERT INTO chat_state(k, v) VALUES('session', ?)", [id]);
  }
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", id);
  chat.setAttribute("autofocus", "");
  stage.append(chat);
} catch (err) {
  stage.textContent = "Pure Chat: " + (err?.message || err);
}
</script>
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
  --agents "$ROOTDIR/agents" \
  --engineer-home "$ROOT" \
  --cwd "$ROOT" --storage http://localhost:8991 --ai http://localhost:8990 \
  >/tmp/frame-blueprint.log 2>&1 &
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 2 http://localhost:8992/bp; then break; fi
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8993 \
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
# → {"project":"demo","blueprints":[{"slug":"purechat","title":"Pure Chat","url":"/bp/demo/purechat"}]}

# bp.js 带着地址前导，页面靠它拿 bp.addr
curl -s http://localhost:8993/bp/demo/purechat/bp.js | head -1
# → window.BP_ADDR = {"ai":"http://localhost:8990","storage":"http://localhost:8991"};
```

### 2. 浏览器里那条链（ego-browser）

```bash
WEB_URL=http://localhost:8993 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8993";
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

// 2. opening it from Overview adds one tab, which frames the blueprint
await page.evaluate(() => document.querySelectorAll("#overview-pane .launcher-item")[0].click());
await page.waitForSelector("#tabs .tab[data-tab-id='purechat']");
await page.waitForFunction(() => {
  const f = document.querySelector("iframe.blueprint-frame");
  const d = f && f.contentDocument;
  return !!(d && d.querySelector("engineer-chat"));
}, undefined, { timeout: 20_000 });
const opened = await snapshot();
check("the blueprint tab is closable and in front", opened.closes === 1 && opened.active === "purechat", opened);
check("the frame is the one page, not hidden", opened.frames.length === 1 && !opened.frames[0].hidden, opened);

const frame = await page.evaluate(() => {
  const f = document.querySelector("iframe.blueprint-frame");
  const d = f.contentDocument;
  const chat = d.querySelector("engineer-chat");
  return {
    src: f.getAttribute("src"),
    session: chat.getAttribute("session"),
    bpMode: d.defaultView.bp?.mode || "",
    addr: d.defaultView.bp?.addr || null,
    theme: d.documentElement.getAttribute("data-theme"),
    themeCss: !!d.querySelector("link[data-engineer-theme]"),
  };
});
check("the frame points at this blueprint's page", frame.src === "/bp/demo/purechat", { src: frame.src });
check("the page was served as prod", frame.bpMode === "prod", { mode: frame.bpMode });
check("bp.addr carries ai and storage", !!(frame.addr && frame.addr.ai && frame.addr.storage), frame.addr);
check("the blueprint raised one session", /^s_[0-9a-f]+$/.test(frame.session), { session: frame.session });
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
  const chat = document.querySelector("iframe.blueprint-frame").contentDocument.querySelector("engineer-chat");
  chat.shadowRoot.querySelector(".ai-input-field").focus();
});
await page.keyboard.type("hello through the frame");
await page.keyboard.press("Enter");
await page.waitForFunction(() => {
  const chat = document.querySelector("iframe.blueprint-frame")?.contentDocument?.querySelector("engineer-chat");
  return (chat?.shadowRoot?.querySelector(".ai-messages")?.textContent || "").includes("dev stub");
}, undefined, { timeout: 60_000 });

await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id='purechat']");
await page.waitForFunction(() => {
  const chat = document.querySelector("iframe.blueprint-frame")?.contentDocument?.querySelector("engineer-chat");
  return (chat?.shadowRoot?.querySelector(".ai-messages")?.textContent || "").includes("dev stub");
}, undefined, { timeout: 30_000 });
const again = await page.evaluate(() => document.querySelector("iframe.blueprint-frame").contentDocument
  .querySelector("engineer-chat").getAttribute("session"));
check("a reload reuses the one session the blueprint stored", again === frame.session,
  { before: frame.session, after: again });
const restored = await snapshot();
check("a reload brings the open tab back", restored.tabs.length === 2 && restored.active === "purechat", restored);

const count = await page.evaluate(async () => {
  const storage = document.querySelector("iframe.blueprint-frame").contentDocument.defaultView.bp.addr.storage;
  const res = await fetch(`${storage}/log/session/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  });
  return (String(await res.text()).match(/sessionId:\s*\S+/g) || []).length;
});
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
