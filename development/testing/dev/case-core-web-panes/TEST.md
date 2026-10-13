# Test: core-web-panes

A tab's content is a **pane tree**, not one cell: `chat` panes each own a
conversation (their own message list, composer, session and stream), `page` panes hold an
iframe onto a blueprint, and a `brief` pane is a short band inside a row split.
The tree is stored per tab (see `case-core-web-tab-records`) and the model
changes it through the `layout` tool — this case drives the record side, which is
the deterministic half: write a tree, open the tab, see it rendered.

What the *model's* frame does on top of that (`tool_execution_start` with
`toolName: "layout"` → the same `applyPaneLayout`, and no tool chip) needs a real
provider; it is verified by hand and recorded in
`development/iterations/2610-24-拆窗渲染与布局工具.md`.

Source of truth: `workspace/web/app.js` (`renderPanes` / `ensurePane` /
`focusPane` / `applyPaneLayout` / `aiStream(pane)`) and `style.css` (`#panes`,
`.pane-split`, `.pane`). DOM + a service call, so this case runs through a real
browser (`ego-browser`).

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.panes"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: panes\n' > "$ROOT/engineer.yaml"

# one blueprint, for the page pane
mkdir -p "$ROOT/.agents/blueprints/demo"
cat > "$ROOT/.agents/blueprints/demo/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Demo</title></head>
<body style="margin:0"><p id="mark">demo</p></body></html>
HTML

# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-log --root " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${ROOT:?this case must set ROOT before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 8950 8951 8952 8953; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8951 >/tmp/panes-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8952 >/tmp/panes-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8950 --stub \
  --log http://localhost:8951 --static http://localhost:8952 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/panes-ai.log 2>&1 &)

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8950/ai/new -d '{}' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8953 --assets "$ROOTDIR/workspace/web" \
  --pages "$ROOT/.agents/blueprints" \
  --static http://localhost:8952 --ai http://localhost:8950 --log http://localhost:8951 \
  >/tmp/panes-web.log 2>&1 &
```

## Run

```bash
WEB_URL=http://localhost:8953 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8953";
const space = await taskSpace("core-web-panes");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const errors = [];
page.on?.("pageerror", (e) => errors.push(String(e)));

const log = (body) => page.evaluate(async (b) => {
  const yaml = (await import("/vendor/js-yaml.js")).default;
  const res = await fetch(`${window.ENGINEER.log}` + b.path, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: b.body,
  });
  return yaml.load(await res.text()) || {};
}, body);
const tabs = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem("engineer.tabs") || "[]"));
const shape = () => page.evaluate(() => ({
  panes: document.querySelectorAll("#panes .pane").length,
  chat: document.querySelectorAll("#panes .pane-chat").length,
  page: document.querySelectorAll("#panes .pane-page").length,
  splits: document.querySelectorAll("#panes .pane-split").length,
  messages: [...document.querySelectorAll(".pane-messages")].map((m) => m.querySelectorAll(".ai-msg").length),
  composerPanes: document.querySelectorAll("#panes .pane-chat #ai-input").length,
}));

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.removeItem("engineer.tabs"));
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// 1. a new chat tab is one pane, with the composer inside it
await page.click("#tab-add");
await page.waitForSelector('.launch-item[data-action="newchat"]', { state: "visible" });
await page.click('.launch-item[data-action="newchat"]');
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(1200);
let s = await shape();
check("a new tab is a single chat pane", s.panes === 1 && s.chat === 1 && s.splits === 0, s);
check("the composer sits inside the focused chat pane", s.composerPanes === 1, s);

const tab = (await tabs())[0];

// 2. the model's tree is what renders: write one, reopen the tab
await log({ path: "/log/tab/mutation", body:
  `tabId: ${tab.tabId}\nlayout:\n  split: col\n  children:\n` +
  `    - split: row\n      children:\n` +
  `        - pane:\n            content: chat\n            id: ${tab.sessionId}\n` +
  `        - pane:\n            content: page\n            id: demo\n            size: brief\n` +
  `    - pane:\n        content: chat\n        id: ""\n` });
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(2500);
s = await shape();
check("a two-pane tree renders: one split, one chat and one page pane",
  s.splits >= 2 && s.chat === 2 && s.page === 1, s);
check("each chat pane has its own message list",
  s.messages.length === 2, s);

// ...and every one of them is styled the same. The shell marks the *focused*
// pane with `#ai-messages`, so a rule keyed on that id restyles one pane and
// leaves the other bare the moment the focus moves.
const styled = await page.evaluate(() =>
  [...document.querySelectorAll(".pane-messages")].map((m) => {
    const cs = getComputedStyle(m);
    return `${cs.display}|${cs.padding}|${cs.gap}|${cs.lineHeight}|${cs.maxWidth}`;
  }));
check("every chat pane's list carries the same styling, focused or not",
  styled.length === 2 && styled[0] === styled[1], { styled });

// 3. brief is a short band, not a proportional share
const heights = await page.evaluate(() => {
  const panes = [...document.querySelectorAll("#panes .pane")];
  const brief = panes.find((p) => p.classList.contains("brief"));
  const other = panes.find((p) => !p.classList.contains("brief"));
  return {
    brief: Math.round(brief.getBoundingClientRect().height),
    other: Math.round(other.getBoundingClientRect().height),
  };
});
check("a brief pane is much shorter than the pane beside it",
  heights.brief > 0 && heights.other > heights.brief * 2, heights);

// 4. every chat pane has its own composer — a conversation you cannot type into
// is not one you can have — and each keeps its own unsent draft.
const composers = await page.evaluate(() =>
  [...document.querySelectorAll("#panes .pane-chat")].map((p) => {
    const c = p.querySelector(".ai-input");
    const i = p.querySelector(".ai-input-field");
    const b = c.getBoundingClientRect();
    const pb = p.getBoundingClientRect();
    return { hasComposer: !!c, hasInput: !!i, bottomGap: Math.round(pb.bottom - b.bottom), visible: b.height > 0 };
  }));
check("each chat pane carries its own composer, pinned to its bottom",
  composers.length === 2 && composers.every((c) => c.hasComposer && c.hasInput && c.visible && c.bottomGap === 0),
  { composers });
await page.fill("loc=css:#panes .pane-chat .ai-input-field >> nth=0", "left draft");
await page.fill("loc=css:#panes .pane-chat .ai-input-field >> nth=1", "right draft");
const twoDrafts = await page.evaluate(() =>
  [...document.querySelectorAll("#panes .pane-chat .ai-input-field")].map((i) => i.value));
check("two composers hold two drafts at once",
  twoDrafts.length === 2 && twoDrafts[0] === "left draft" && twoDrafts[1] === "right draft",
  { drafts: twoDrafts });

// 4b. panes are independent: sending in one leaves the other alone. Clicking a
// chat pane makes it the shell's current conversation.
const before = (await shape()).messages;
await page.click("loc=css:#panes .pane-chat >> nth=1");
await page.waitForTimeout(400);
await page.fill("#ai-input-field", "second pane speaks");
await page.click("#ai-send");
await page.waitForTimeout(3000);
const after = (await shape()).messages;
check("sending in the second pane leaves the first one untouched",
  after[0] === before[0] && after[1] > before[1], { before, after });
const draftsAfterSend = await page.evaluate(() =>
  [...document.querySelectorAll("#panes .pane-chat .ai-input-field")].map((i) => i.value));
check("sending from one composer does not touch the other's draft",
  draftsAfterSend[0] === "left draft" && draftsAfterSend[1] === "", { draftsAfterSend });
check("clicking a pane makes it the shell's current conversation",
  await page.evaluate(() =>
    document.getElementById("ai-input").closest(".pane-chat") ===
    document.querySelectorAll("#panes .pane-chat")[1]));
// Focusing moves `#ai-messages` to the other pane; the styling must not move
// with it (checked again after the switch, which is where it broke).
const styledAfter = await page.evaluate(() =>
  [...document.querySelectorAll(".pane-messages")].map((m) => {
    const cs = getComputedStyle(m);
    return `${cs.display}|${cs.padding}|${cs.gap}|${cs.lineHeight}|${cs.maxWidth}`;
  }));
check("switching focus does not restyle the pane left behind",
  styledAfter.length === 2 && styledAfter[0] === styledAfter[1] && styledAfter[0] === styled[0],
  { before: styled, after: styledAfter });

// 5. the split survives a reload, and the launcher still lists tabs
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(2500);
s = await shape();
check("the split comes back after a reload", s.chat === 2 && s.page === 1, s);
check("no page errors", errors.length === 0, { errors });

console.log(JSON.stringify({ checks }, null, 2));
await space.finish({ keep: [] });
EOF
```

Expected: a new tab is one chat pane with the composer inside it; writing a tree
with two chat panes and a brief page pane makes the tab render two splits and
three panes, each chat pane with its own message list; the brief pane is a short
band; sending in the second pane does not touch the first; and the whole thing
comes back after a reload.

## Teardown

```bash
pkill -f 'serve-log --root .*/.panes'
pkill -f 'serve-static --root .*/.panes'
pkill -f 'serve-web --bind 127.0.0.1 --port 8953'
pkill -f 'main.ts.*--root .*/.panes'
```
