# Test: core-web-panes

A tab's content is a **pane tree**, not one cell. A leaf states three separate
things — `paneId` (which pane this is), `contentType` / `contentId` (what it
shows), and `flex` (the share it takes from its parent) — so the *same*
conversation may sit in two panes at once, and a layout change can tell one pane
from another. `chat` panes each own a composer and a draft, `page` panes hold an
iframe onto a blueprint, and a split hands its children their shares the way
`flex` says.

The tree is stored per tab (see `case-core-web-tab-records`); this case drives
the record side — write a tree, open the tab, see it rendered — and the side the
model's frame reaches through the same code (`applyPaneLayout`).

Two conversations on screen at once must stay two conversations (own composer,
own draft, own scroll) *and* a conversation shown twice must stay one
conversation (one stream, every view updating). Both halves are here.

Source of truth: `workspace/web/app.js` (`renderPanes` / `ensurePane` /
`focusPane` / `applyPaneLayout` / `aiStream`) and `style.css` (`.pane-split`,
`.pane`). DOM + a service call, so this case runs through a real browser
(`ego-browser`).

What the *model's* frame does on top of that (`tool_execution_start` with
`toolName: "layout"` → the same `applyPaneLayout`) needs a real provider: it is
covered deterministically by `case-core-web-pane-frame` (a canned provider) and
verified by hand in `development/iterations/2610-29-pane 共享会话流与格子身份.md`.

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
  --agents "$ROOTDIR/agents" \
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
  const { ENGINEER } = await import("/config.js");
  const res = await fetch(`${ENGINEER.log}` + b.path, {
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
// Each chat pane's last message, read out of the pane's own list — what makes
// "the same conversation twice" checkable: same text in both, or not.
const lasts = () => page.evaluate(() =>
  [...document.querySelectorAll("#panes .pane-chat")].map((p) => {
    const msgs = p.querySelectorAll(".ai-msg");
    return msgs.length ? msgs[msgs.length - 1].textContent.trim().slice(0, 80) : null;
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
const put = (layout) => log({ path: "/log/tab/mutation",
  body: `tabId: ${tab.tabId}\nlayout:\n${layout}` });

// 2. the stored tree is what renders, in the shape the layout tool writes:
// paneId is the pane's own identity, contentType/contentId its content, and
// flex the share it takes from its parent (CSS `flex` shorthand; ratio form).
await put(
  `  split:\n    flexDirection: row\n    children:\n` +
  `      - split:\n          flexDirection: column\n          flex: "2 1 0"\n          children:\n` +
  `            - pane:\n                paneId: p_aa01\n                contentType: chat\n` +
  `                contentId: ${tab.sessionId}\n` +
  `            - pane:\n                paneId: p_aa02\n                contentType: page\n` +
  `                contentId: demo\n                flex: "0 0 132px"\n` +
  `      - pane:\n          paneId: p_aa03\n          contentType: chat\n`);
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(2500);
s = await shape();
check("a two-split tree renders: one row split, one chat and one page pane",
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

// 2b. flex decides the geometry: "2 1 0" takes twice the share of a pane that
// says nothing, and "0 0 132px" is a fixed size rather than a share.
const geom = await page.evaluate(() => {
  const outer = document.querySelector("#panes > .pane-tree > .pane-split");
  const [left, right] = [...outer.children].map((c) => c.getBoundingClientRect().width);
  const col = outer.children[0];
  const page = col.querySelector(".pane-page").getBoundingClientRect().height;
  const chat = col.querySelector(".pane-chat").getBoundingClientRect().height;
  return { left: Math.round(left), right: Math.round(right),
           ratio: +(left / right).toFixed(2), page: Math.round(page), chat: Math.round(chat) };
});
check("a pane with flex 2 takes about twice the width of one that says nothing",
  geom.ratio > 1.7 && geom.ratio < 2.3, geom);
check("a pane with a fixed basis keeps its size instead of taking a share",
  geom.page > 120 && geom.page < 145 && geom.chat > geom.page * 2, geom);

// 3. every chat pane has its own composer — a conversation you cannot type into
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

// 4. two panes, one conversation: the same sessionId in two panes is one
// conversation shown twice — each view has its own list and composer, and a run
// started in either one lands in both. Seed a long history first, so the pane is
// taller than the window and the scroll question is a real one.
const ai = await page.evaluate(async () => (await import("/config.js")).ENGINEER.ai);
const filler = Array.from({ length: 140 }, (_, i) =>
  `      filler line ${String(i + 1).padStart(3, "0")}\n`).join("");
const seeded = await page.fetch(`${ai}/ai/ask`, { method: "POST",
  headers: { "Content-Type": "application/yaml" },
  body: `id: ${tab.sessionId}\nblocks:\n  - type: text\n    text: |\n${filler}` });
check("the long seed prompt was accepted", /sessionId/.test(String(seeded.body)), null);

await put(
  `  split:\n    flexDirection: row\n    children:\n` +
  `      - pane:\n          paneId: p_bb01\n          contentType: chat\n          contentId: ${tab.sessionId}\n` +
  `      - pane:\n          paneId: p_bb02\n          contentType: chat\n          contentId: ${tab.sessionId}\n`);
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForFunction(() =>
  [...document.querySelectorAll(".pane-scroll")].every((s) => s.scrollHeight > s.clientHeight + 200),
  undefined, { timeout: 30_000 });

s = await shape();
check("one conversation in two panes renders two lists", s.chat === 2 && s.messages.length === 2, s);
check("both panes replay the same history",
  s.messages[0] === s.messages[1] && s.messages[0] > 0, s);

// Scroll the left pane up, then send from the right one. The run belongs to the
// conversation, not to the pane it was typed in: both lists must take the new
// messages — and only the pane that was following the bottom may move.
await page.evaluate(() => { document.querySelectorAll(".pane-scroll")[0].scrollTop = 0; });
await page.waitForTimeout(300);
const beforeSend = await page.evaluate(() =>
  [...document.querySelectorAll(".pane-scroll")].map((s) => ({
    top: Math.round(s.scrollTop),
    gap: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight),
  })));
await page.click("loc=css:#panes .pane-chat >> nth=1");
await page.waitForTimeout(400);
await page.fill("loc=css:#panes .pane-chat .ai-input-field >> nth=1", "both panes should see this");
const beforeCounts = (await shape()).messages;
await page.click("#ai-send");
await page.waitForTimeout(4000);

s = await shape();
// Typed in the right pane, but the run belongs to the conversation: the user
// bubble and the reply land in both lists.
check("sending in one pane of a shared conversation updates both",
  s.messages[0] >= beforeCounts[0] + 2 && s.messages[1] >= beforeCounts[1] + 2 &&
  s.messages[0] === s.messages[1], { before: beforeCounts, after: s.messages });

const texts = await lasts();
check("both panes end on the same message", texts[0] && texts[0] === texts[1], { texts });

const afterSend = await page.evaluate(() =>
  [...document.querySelectorAll(".pane-scroll")].map((s) => ({
    top: Math.round(s.scrollTop),
    gap: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight),
  })));
check("a pane the reader scrolled up is not dragged to the bottom by the other pane's send",
  afterSend[0].top < beforeSend[0].top + 40, { before: beforeSend[0], after: afterSend[0] });
check("the pane that was following the bottom follows the new messages",
  afterSend[1].gap <= 24, { before: beforeSend[1], after: afterSend[1] });

// 4b. taking focus does not restyle the pane left behind
await page.click("loc=css:#panes .pane-chat >> nth=0");
await page.waitForTimeout(400);
check("clicking a pane makes it the shell's current conversation",
  await page.evaluate(() =>
    document.getElementById("ai-input").closest(".pane-chat") ===
    document.querySelectorAll("#panes .pane-chat")[0]));
const styledAfter = await page.evaluate(() =>
  [...document.querySelectorAll(".pane-messages")].map((m) => {
    const cs = getComputedStyle(m);
    return `${cs.display}|${cs.padding}|${cs.gap}|${cs.lineHeight}|${cs.maxWidth}`;
  }));
check("switching focus does not restyle the pane left behind",
  styledAfter.length === 2 && styledAfter[0] === styledAfter[1] && styledAfter[0] === styled[0],
  { before: styled, after: styledAfter });

// 5. a tree written before paneId existed still renders: an absent paneId is
// given one on read, and the old content/id names are read as contentType/contentId.
await put(
  `  pane:\n    content: chat\n    id: ${tab.sessionId}\n`);
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(2000);
s = await shape();
check("a stored tree without paneId still opens, as a single chat pane",
  s.panes === 1 && s.chat === 1 && s.page === 0, s);

// 6. the tree survives a reload, and the launcher still lists tabs
await put(
  `  split:\n    flexDirection: row\n    children:\n` +
  `      - pane:\n          paneId: p_cc01\n          contentType: chat\n          contentId: ${tab.sessionId}\n` +
  `      - pane:\n          paneId: p_cc02\n          contentType: page\n          contentId: demo\n`);
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(2500);
s = await shape();
check("the split comes back after a reload", s.chat === 1 && s.page === 1, s);
check("no page errors", errors.length === 0, { errors });

console.log(JSON.stringify({ checks }, null, 2));
await space.finish({ keep: [] });
EOF
```

Expected: a new tab is one chat pane with the composer inside it; a stored tree
in the current shape (paneId / contentType / contentId / flex) renders one row
split and one column split holding two chat panes and a page pane, each chat pane
with its own list, composer and draft, and the `flex` values drive the geometry
(a `2 1 0` pane is about twice as wide as a pane that says nothing; a `0 0 132px`
pane keeps its fixed height). With the same `contentId` in both chat panes, the
two lists replay the same history, a send from the right pane lands in *both*,
and the left pane — scrolled up by the reader — stays where it was while the
right one follows the bottom. A tree stored before `paneId` existed still opens,
and the tree written last is the one that comes back after a reload.

## Teardown

```bash
pkill -f 'serve-log --root .*/.panes'
pkill -f 'serve-static --root .*/.panes'
pkill -f 'serve-web --bind 127.0.0.1 --port 8953'
pkill -f 'main.ts.*--root .*/.panes'
```
