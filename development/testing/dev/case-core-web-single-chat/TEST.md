# Test: core-web-single-chat

外壳只剩两样东西：**一个对话**，和**主题切换**。没有 tab、没有项目、没有下拉层、没有路由 —
任意路径都落到同一个页面（`/`），页面上只有一个 `<engineer-chat>`。

- 顶栏只有一个 tab，恒显示在 logo 右侧，名字就叫 `Chat`（它是这条对话的名字，不是切换器）；
  主题按钮在右上角。
- 页面第一次进来还没有会话：第一条消息让外壳调 `ai/new`（`cwd` 由 `serve-blueprint --cwd` 经
  `/config.js` 交给页面），之后整页只有这一条会话；再发消息仍是它。
- 刷新之后再回来，读的是 `log/session/list` 的第一条（最近活跃的那个），不是新建一个。
- 主题按钮把 `data-theme` 写在 `<html>` 上，`light` / `dark` 来回切，存在浏览器里，刷新后还在。

Source of truth: `workspace/blueprint/shell/app.js`（外壳）、`workspace/blueprint/shell/index.html`（结构）、
`workspace/blueprint/shell/components/chat.js`（对话本体）、`workspace/blueprint/serve.go`（文件服务与
`/config.js`）。

## Setup

前置：`ego-browser` 在 `PATH` 上（`ego-browser --version`）。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.single-chat-test"
HOME_DIR="$ROOT/home"
BPS="$ROOT/blueprints"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$BPS"

# 外壳打开时如果没有蓝图目录会拦住一切先问；这条用例只关心对话，所以先替它选好
printf 'blueprints: %s\n' "$BPS" >"$HOME_DIR/config.yaml"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8940 8941 8942; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8941 >/tmp/single-chat-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8941/log/session/list -d 'pageNum: 1' && break
  sleep 1
done

# --stub: the reply is the echo stub, so the run is deterministic and offline.
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8940 --stub \
  --storage http://localhost:8941 >/tmp/single-chat-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8940/ai/new -d "cwd: $ROOT" && break
  sleep 1
done

# --cwd is the folder the shell's conversation works in; the page gets it from /config.js.
/tmp/engineer serve-blueprint --bind 127.0.0.1 --port 8942 \
  --shell "$ROOTDIR/workspace/blueprint/shell" \
  --home "$HOME_DIR" \
  --cwd "$ROOT" --storage http://localhost:8941 --ai http://localhost:8940 \
  >/tmp/single-chat-blueprint.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://localhost:8942/ && break
  sleep 1
done
```

Expected: the ai log says `--stub: model calls disabled`；blueprint 打出 `engineer blueprint: http://localhost:8942`。

## Run

```bash
WEB_URL=http://localhost:8942 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8942";
const space = await taskSpace("core-web-single-chat");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const CHAT = `(() => {
  const host = document.querySelector("engineer-chat");
  if (!host || !host.shadowRoot) return null;
  return {
    input: host.shadowRoot.querySelector(".ai-input-field"),
    send: host.shadowRoot.querySelector(".ai-send"),
    text: host.shadowRoot.querySelector(".ai-messages").textContent,
  };
})()`;

const sessions = async (p) => {
  const storage = await p.evaluate(async () => (await import("/config.js")).ENGINEER.storage);
  const body = (await p.fetch(`${storage}/log/session/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  })).body;
  return {
    count: (String(body).match(/sessionId:\s*\S+/g) || []).length,
    ids: [...String(body).matchAll(/sessionId:\s*(\S+)/g)].map((m) => m[1]),
  };
};

await page.goto(`${WEB}/`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${WEB}/`);

// 1. one conversation, one chat element, a theme switch — nothing else
await page.waitForSelector("engineer-chat", { state: "visible" });
const shape = await page.evaluate(() => {
  const tab = document.querySelector("#tabs .tab");
  const brand = document.getElementById("brand");
  return {
    chats: document.querySelectorAll("engineer-chat").length,
    toggles: document.querySelectorAll("#theme-toggle").length,
    tabCount: document.querySelectorAll("#tabs .tab").length,
    tabText: tab ? tab.textContent.trim() : "",
    tabRightOfBrand: !!(tab && brand) && tab.getBoundingClientRect().left >= brand.getBoundingClientRect().right,
    theme: document.documentElement.dataset.theme || "",
    folderDialog: !!document.querySelector("input[name='path']"),
    projectsButton: !!document.getElementById("projects-toggle"),
    projectsName: document.getElementById("projects-name")?.textContent || "",
  };
});
check("one <engineer-chat> on the page", shape.chats === 1, { chats: shape.chats });
check("a theme toggle exists", shape.toggles >= 1, { toggles: shape.toggles });
check("one tab, named Chat, right of the logo", shape.tabCount === 1 && shape.tabText === "Chat" && shape.tabRightOfBrand,
  { count: shape.tabCount, text: shape.tabText, rightOfBrand: shape.tabRightOfBrand });
check("data-theme is drawn", !!shape.theme, { theme: shape.theme });
check("no folder dialog when the folder is already chosen", !shape.folderDialog, shape);
check("the projects switcher is there, named after the front project",
  shape.projectsButton && shape.projectsName === "demo", shape);

// 2. any path is the same page
await page.goto(`${WEB}/whatever/deep/path`);
const deepShape = await page.evaluate(() => ({
  chats: document.querySelectorAll("engineer-chat").length,
  path: location.pathname,
}));
check("other paths serve the same shell", deepShape.chats === 1,
  { path: deepShape.path, chats: deepShape.chats });

// 3. the page is one conversation: it starts the session itself, named by the
// shell's own cwd, and the first message goes into that same one
const before = await sessions(page);
await page.waitForFunction((parts) => !!eval(parts)?.input, CHAT, { timeout: 30_000 });
await page.evaluate((parts) => { eval(parts).input.focus(); }, CHAT);
await page.keyboard.type("hello from the shell");
await page.keyboard.press("Enter");
await page.waitForFunction((parts) => (eval(parts)?.text || "").includes("dev stub"),
  CHAT, { timeout: 60_000 });
const after = await sessions(page);
check("the page is one session, and stays one", after.count === 1,
  { before: before.count, after: after.count });

const cwd = await page.evaluate(async () => (await import("/config.js")).ENGINEER.cwd);
check("the page is told which folder the agent works in", !!cwd, { cwd });

// 4. the theme switch flips data-theme and survives a reload
const t0 = await page.evaluate(() => document.documentElement.dataset.theme || "");
await page.click("#theme-toggle");
await page.click('#theme-menu button[data-theme="dark"]');
const t1 = await page.evaluate(() => document.documentElement.dataset.theme || "");
await page.reload();
const t2 = await page.evaluate(() => document.documentElement.dataset.theme || "");
check("the toggle changes data-theme", t0 !== t1 && !!t1, { from: t0, to: t1 });
check("the choice survives a reload", t2 === t1, { before: t1, after: t2 });

// 5. a reload comes back to the same session instead of starting a new one
await page.goto(`${WEB}/`);
await page.waitForFunction((parts) => (eval(parts)?.text || "").length > 0, CHAT, { timeout: 30_000 });
const again = await sessions(page);
check("a reload reuses the one session", again.count === 1 && again.ids[0] === after.ids[0],
  { before: after.ids, after: again.ids });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected: `{"ok": true, ...}`，每一项 `pass` 都是 `true`。

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8940 8942; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```