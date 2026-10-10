# Test: core-web-chat-route

The address bar follows the tabs. A conversation tab is a route of its own —
`/chat/<sessionId>` — so a reload lands on the same conversation and a link can
be shared; `/new` is the new tab page's route; the fixed views keep the paths
they always had. Back / forward walk that history instead of leaving the app.
Deep links (`/chat/<id>` opened with no tab for it) resume the session into a
new tab, and a dead link shows its error rather than a blank page.

Source of truth: `workspace/web/app.js` (`parseRoute` / `route` / `routeChat` /
`syncTabUrl` / `activateTab` / `openNewTab` / `closeNewTab`) and
`workspace/web/server/serve.go` (the SPA fallback that makes a chat URL survive
a reload). Routing is browser behaviour, so this case runs through a real
browser (`ego-browser`) rather than curl.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
# A scratch project root: the case must not touch the real .engineer/ or log
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.chat-route-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: chat-route-test\n' > "$ROOT/engineer.yaml"

# log + ai on their own ports (different from the other web cases, so this one
# can run next to them); ai in stub mode, so the run is deterministic and offline
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8523 >/tmp/chat-route-log.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8521 --stub \
  --log http://localhost:8523 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/chat-route-ai.log 2>&1 &)

# one saved skill, so the new tab page has something to run
# wait for ai first: the save must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8521/ai/skill/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8521/ai/skill/save \
  -d 'name: Seeded skill
text: seeded instruction'

# web assets
/tmp/engineer serve-web --bind 127.0.0.1 --port 8620 --assets "$ROOTDIR/workspace/web" \
  --pages /tmp/engineer-pages-unused \
  --static http://localhost:8502 --ai http://localhost:8521 --log http://localhost:8523 \
  >/tmp/chat-route-web.log 2>&1 &
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the log
server logs its address on `:8523`, and the web server logs
`engineer web: http://localhost:8620`. (`--static` is only referenced by the
frontend, never called here, so any address — or none — is fine.)

## Run

```bash
WEB_URL=http://localhost:8620 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8620";
const space = await taskSpace("core-web-chat-route");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const path = () => page.evaluate(() => location.pathname);
const nowPath = async () => new URL(await page.url()).pathname;
const chatId = (p) => (String(p).match(/^\/chat\/(.+)$/) || [])[1] || "";
const back = async () => { await page.evaluate(() => history.back()); };
const forward = async () => { await page.evaluate(() => history.forward()); };

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// start from a clean browser state (open tabs live in localStorage)
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// 1. the fixed views keep their paths (the routing that already existed)
check("the graph is /", (await path()) === "/", { path: await nowPath() });
await page.click("loc=css:#tabs button[data-view='how-to']");
await page.waitForFunction(() => location.pathname === "/how-to");
check("a fixed view keeps its own path", (await path()) === "/how-to");
await back();
await page.waitForFunction(() => location.pathname === "/");
check("back from a fixed view returns to the graph", (await path()) === "/");
await forward();
await page.waitForFunction(() => location.pathname === "/how-to");
check("forward returns to the fixed view", (await path()) === "/how-to");

// 2. /new is the new tab page's own route
await page.click("#tab-add");
await page.waitForFunction(() => location.pathname === "/new");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
check("+ moves the address bar to /new", (await path()) === "/new");

// 3. running a skill from it names that conversation's session in the URL
// (one saved skill, so it is among the launcher's preview rows)
await page.click("loc=css:#newtab [data-section=skills] .launch-item:has-text('Seeded skill') >> nth=0");
await page.waitForFunction(() => /^\/chat\/.+/.test(location.pathname));
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
const sid1 = chatId(await path());
check("running a skill puts its session in the URL", !!sid1, { path: await nowPath() });

// 4. the page it was started from is replaced, not stacked: back skips /new
await back();
await page.waitForFunction(() => location.pathname === "/how-to");
check("the new tab page is not left behind in history", (await path()) === "/how-to");

// 5. forward re-enters the conversation straight from the URL
await forward();
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, sid1);
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
check("forward renders the conversation the URL names", (await path()) === `/chat/${sid1}`);

// 6. a tab click is an explicit move: it pushes, so back leaves it
await page.click("loc=css:#tabs button[data-view='graph']");
await page.waitForFunction(() => location.pathname === "/");
await page.click("loc=css:#tabs .tab[data-tab-id]");
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, sid1);
check("clicking a session tab names it in the URL", (await path()) === `/chat/${sid1}`);
await back();
await page.waitForFunction(() => location.pathname === "/");
check("back leaves the conversation for the previous view", (await path()) === "/");

// 7. a deep link: no tab for it, the session is resumed into a new one
await page.evaluate(() => localStorage.clear());
await page.goto(`${WEB}/chat/${sid1}`);
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
const deep = await page.evaluate((id) => ({
  path: location.pathname,
  tab: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  user: document.querySelector("#ai-messages .ai-user")?.textContent.trim(),
  tabMode: document.getElementById("ai").classList.contains("tab-mode"),
}), sid1);
check("a deep link opens the session as a tab",
  deep.path === `/chat/${sid1}` && deep.tabMode === true && !!deep.tab, deep);
check("the deep-linked conversation replays its history",
  deep.user === "seeded instruction", { user: deep.user });

// 8. a reload stays on the conversation (the URL is the state)
await page.reload();
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
const reloaded = await page.evaluate((id) => ({
  path: location.pathname,
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
}), sid1);
check("a reload stays on the conversation the URL names",
  reloaded.path === `/chat/${sid1}` && reloaded.tabs === 1, reloaded);

// 9. + / Esc: the new tab page remembers the view it was opened from
await page.click("#tab-add");
await page.waitForFunction(() => location.pathname === "/new");
await page.keyboard.press("Escape");
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, sid1);
const afterEsc = await page.evaluate(() => ({
  path: location.pathname,
  tabMode: document.getElementById("ai").classList.contains("tab-mode"),
  newTabHidden: document.getElementById("newtab").hidden,
}));
check("Esc leaves the new tab page for the conversation it came from",
  afterEsc.path === `/chat/${sid1}` && afterEsc.tabMode === true && afterEsc.newTabHidden === true,
  afterEsc);

// 10. /new replaces the instance in place: new session, no extra entry
const lenBefore = await page.evaluate(() => history.length);
await page.fill("#ai-input-field", "/new");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
await page.press("#ai-input-field", "Enter");
await page.waitForFunction(
  (old) => /^\/chat\/.+/.test(location.pathname) && location.pathname !== `/chat/${old}`, sid1);
const afterNew = await page.evaluate(() => ({
  path: location.pathname,
  len: history.length,
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
}));
const sid2 = chatId(afterNew.path);
check("the /new command names the fresh session in the URL",
  !!sid2 && sid2 !== sid1 && afterNew.tabs === 1 && afterNew.messages === 0, afterNew);
check("the /new command rewrites the current entry instead of pushing one",
  afterNew.len === lenBefore, { before: lenBefore, after: afterNew.len });

// 11. closing a tab with a neighbour falls through to that neighbour's URL
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click("loc=css:#newtab [data-action=newchat]");
await page.waitForFunction(() => /^\/chat\/.+/.test(location.pathname));
const sid3 = chatId(await path());
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=0");
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, sid2);
await page.click("loc=css:#tabs .tab[data-tab-id].active .tab-close");
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, sid3);
const closed = await page.evaluate(() => ({
  path: location.pathname,
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
}));
check("closing the active tab names its neighbour in the URL",
  closed.path === `/chat/${sid3}` && closed.tabs === 1, closed);

// 12. a conversation that does not exist: the URL keeps the error on screen
await page.goto(`${WEB}/chat/s_0000000000000000`);
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("[error]"),
  undefined, { timeout: 30_000 });
const dead = await page.evaluate(() => ({
  path: location.pathname,
  text: document.querySelector("#ai-messages")?.textContent.trim().slice(0, 60),
  leftHidden: document.getElementById("left").hidden,
}));
check("a dead chat link shows the error instead of a blank page",
  dead.path === "/chat/s_0000000000000000" && dead.text.includes("[error]"), dead);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — the graph is `/` and the
fixed views keep their paths; back / forward walk them; `+` moves the address bar
to `/new`, and running a skill from it leaves `/chat/<sessionId>` with `/new`
replaced (back skips it); forward re-renders the conversation from the URL; a tab
click pushes that tab's URL and back leaves it; opening `/chat/<id>` with no tab
for it resumes the session into a tab and replays its history; a reload stays
there; Esc leaves the new tab page for the view it was opened from; `/new`
replaces the instance with a new session, rewriting the current history entry;
closing the active tab names its neighbour; and a link to a session that does not
exist shows its error on screen. Exit code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8620'
pkill -f '/tmp/engineer serve-log --root .*chat-route-test'
pkill -f 'main.ts.*--port 8521'
```
