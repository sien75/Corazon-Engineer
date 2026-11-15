# Test: core-web-chat-scroll

A conversation is read as a column: the messages and the composer are capped at
1000px and centred. The *scrolling*, though, belongs to the whole pane — the
scroll container spans the full width of the chat page, so the wheel scrolls the
conversation wherever the pointer is, not only while it is over the column.
`.scroll` is that container; `.ai-messages` inside it is the column. Both live in
the shadow root of the conversation element (`<engineer-chat>`), so every read goes
through it.

Source of truth: `workspace/web/components/chat.js` and `components/chat.css`
(`.scroll` / `.ai-messages` / `.ai-input`), plus the stick-to-bottom rule there. Scroll geometry and wheel input are browser
behaviour, so this case runs through a real browser (`ego-browser`).

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
# A scratch project root: the case must not touch the real .engineer/ or log.
# storage's database lives in the engineer home.
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.chat-scroll-test"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: chat-scroll-test\n' > "$ROOT/engineer.yaml"

# log + ai on their own ports; ai in stub mode, so the run is deterministic and
# offline. The conversation itself is seeded from the test (see Run).
# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-storage --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8910 8911 8912; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8911 >/tmp/chat-scroll-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8911/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8911/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $ROOT"
PROJECT=$(curl -s -X POST http://localhost:8911/log/project/list | awk '$1=="projectId:" {print $2}' | head -1)

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8910 --stub \
  --storage http://localhost:8911 \
  --agents "$ROOTDIR/agents" --docs "$ROOTDIR/.engineer/docs" \
  >/tmp/chat-scroll-ai.log 2>&1 &)

# ai boots after storage (it resolves models first), and the page's first call is
# to it: wait for the port rather than hoping it bound in time — a lost race here
# reads as "Failed to fetch", not as a missing service.
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8910/ai/new -d 'kind: main' && break
  sleep 1
done

# web assets
/tmp/engineer serve-web --bind 127.0.0.1 --port 8912 --assets "$ROOTDIR/workspace/web" \
  --storage http://localhost:8911 --ai http://localhost:8910 \
  >/tmp/chat-scroll-web.log 2>&1 &

# The browser drives this service on the next line, so wait for the port instead
# of hoping it bound in time: a lost race reads as a wrong answer (a refused
# navigation), not as a missing service.
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://localhost:8912/ && break
  sleep 1
done
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the log
server logs its address on `:8911`, and the web server logs
`engineer web: http://localhost:8912`. (`--storage` is only referenced by the
frontend, never called here, so any address — or none — is fine.)

## Run

The conversation is seeded through the same APIs the page uses: a long prompt,
which the dev stub echoes back as the reply, so the replay is far taller than the
window. It is then opened as a deep link (`/session/<sessionId>`).

```bash
WEB_URL=http://localhost:8912 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8912";
const space = await taskSpace("core-web-chat-scroll");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const post = async (url, body) =>
  (await page.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body,
  })).body;

// 会话是这个 view 本身（`<engineer-chat>`），scroller / 消息列 / composer 都在它的
// shadow root 里，所以每次读 DOM 都从那个 host 穿进去。
const PARTS = `(() => {
  const host = document.querySelector("#panes .view:not([hidden])");
  if (!host || !host.shadowRoot) return null;
  return {
    host,
    scroll: host.shadowRoot.querySelector(".scroll"),
    messages: host.shadowRoot.querySelector(".ai-messages"),
    input: host.shadowRoot.querySelector(".ai-input"),
    text: () => (host.shadowRoot.querySelector(".ai-messages")?.textContent || ""),
  };
})()`;

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.clear());
const ai = await page.evaluate(async () => (await import("/config.js")).ENGINEER.ai);

// 1. seed a conversation much taller than the window (the stub echoes the prompt).
// 外壳只认 sub 会话的 /session/<id>（main 有它自己的位置），所以这条会话要有项目。
const storage = await page.evaluate(async () => (await import("/config.js")).ENGINEER.storage);
const projectId = (String(await post(`${storage}/log/project/list`, "{}"))
  .match(/projectId:\s*(\S+)/) || [])[1];
const created = await post(`${ai}/ai/new`, `projectId: ${projectId}\nkind: sub`);
const sid = (created.match(/sessionId:\s*(\S+)/) || [])[1];
check("the seed session was created", !!sid, { response: String(created).trim() });
const filler = Array.from({ length: 140 }, (_, i) =>
  `      filler line ${String(i + 1).padStart(3, "0")}\n`).join("");
await post(`${ai}/ai/ask`, `id: ${sid}\nblocks:\n  - type: text\n    text: |\n${filler}`);
// 一条刚建的会话还没上屏：直接开 /session/<id> 会被外壳回落到 main，所以先把它
// 放进 openSessions（等价于点开它的 tab），再走深链。
await post(`${storage}/log/session/on`, `sessionIds: [${sid}]`);

// 2. open it as a deep link and wait until it really overflows
await page.goto(`${WEB}/session/${sid}`);
await page.waitForFunction((parts) => {
  const el = eval(parts);
  return !!el?.scroll && el.scroll.scrollHeight > el.scroll.clientHeight + 500;
}, PARTS, { timeout: 30_000 });
await page.waitForFunction((parts) => (eval(parts)?.text?.() || "").includes("dev stub"),
  PARTS, { timeout: 30_000 });

// 3. the geometry: full-width scroller, capped centred column
const geo = await page.evaluate((parts) => {
  const el = eval(parts);
  const host = el.host.getBoundingClientRect();
  const s = el.scroll.getBoundingClientRect();
  const t = el.messages.getBoundingClientRect();
  const i = el.input.getBoundingClientRect();
  const mid = (a, b) => Math.round((a + b) / 2);
  return {
    scrollerWidth: Math.round(s.width),
    hostWidth: Math.round(host.width),
    gapLeft: Math.round(s.left - host.left),
    gapRight: Math.round(host.right - s.right),
    gapAboveComposer: Math.round(i.top - s.bottom),
    scrollerHeight: Math.round(s.height),
    threadWidth: Math.round(t.width),
    threadCentreOffset: mid(t.left, t.right) - mid(host.left, host.right),
    inputCentreOffset: mid(i.left, i.right) - mid(host.left, host.right),
    columnLeft: Math.round(t.left - host.left),
    columnRight: Math.round(host.right - t.right),
    columnX: Math.round(t.left + t.width / 2),
    leftX: Math.round(Math.max(s.left + 4, t.left - 60)),
    rightX: Math.round(Math.min(s.right - 4, t.right + 60)),
    midY: Math.round((s.top + s.bottom) / 2),
  };
}, PARTS);
// 横向必须贴边；纵向在 scroller 和 composer 之间留了 8px 的缝（chat.css 的间距），
// 所以那里比的是"缝很小"，不是 0。
check("the scroll area spans the whole pane",
  geo.gapLeft <= 1 && geo.gapRight <= 1 &&
  geo.scrollerWidth >= geo.hostWidth - 1 && geo.gapAboveComposer <= 10, geo);
check("the conversation column is still capped and centred",
  geo.threadWidth <= 1001 && Math.abs(geo.threadCentreOffset) <= 2 &&
  Math.abs(geo.inputCentreOffset) <= 2, geo);
check("there is empty pane on both sides of the column",
  geo.columnLeft > 40 && geo.columnRight > 40, geo);

// 4. an opened conversation sits at its bottom (the stick-to-bottom rule reads
// the scroller now, not the column)
const opened = await page.evaluate((parts) => {
  const s = eval(parts).scroll;
  return { gap: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight) };
}, PARTS);
check("a freshly opened conversation sits at its bottom", opened.gap <= 2, opened);

// 5. the wheel works over the empty pane, on both sides
// 命中点不一定落在某条消息上（消息之间有内边距），所以"是否在列里"按列的矩形
// 判断，而不是 elementFromPoint 的祖先链。
const inColumn = (x, y) => page.evaluate(([x, y, parts]) => {
  const r = eval(parts).messages.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}, [x, y, PARTS]);
const state = () => page.evaluate((parts) => {
  const el = eval(parts);
  const first = el.messages.querySelector(".ai-msg");
  return {
    scrollTop: Math.round(el.scroll.scrollTop),
    firstBubbleTop: first ? Math.round(first.getBoundingClientRect().top) : null,
  };
}, PARTS);
const wheelAt = async (x, y, dy) => {
  const before = await state();
  await page.mouse.move(x, y, { label: "pointer over the chat pane" });
  await page.mouse.wheel(0, dy, { label: "scroll the conversation" });
  await page.waitForFunction(
    ([b, d, parts]) => {
      const s = eval(parts).scroll;
      return d > 0 ? s.scrollTop > b : s.scrollTop < b;
    },
    [before.scrollTop, dy, PARTS], { timeout: 3_000 }).catch(() => {});
  return { before, after: await state() };
};

const leftOutside = !(await inColumn(geo.leftX, geo.midY));
const left = await wheelAt(geo.leftX, geo.midY, -300);
check("the wheel scrolls from the empty pane left of the column",
  leftOutside && left.after.scrollTop < left.before.scrollTop,
  { ...left, outsideColumn: leftOutside });
check("the messages themselves moved with it",
  left.after.firstBubbleTop !== null && left.after.firstBubbleTop > left.before.firstBubbleTop,
  { from: left.before.firstBubbleTop, to: left.after.firstBubbleTop });

const rightOutside = !(await inColumn(geo.rightX, geo.midY));
const right = await wheelAt(geo.rightX, geo.midY, 300);
check("the wheel scrolls from the empty pane right of the column",
  rightOutside && right.after.scrollTop > right.before.scrollTop,
  { ...right, outsideColumn: rightOutside });

// 6. over the column itself the behaviour is unchanged
const columnInside = await inColumn(geo.columnX, geo.midY);
const overColumn = await wheelAt(geo.columnX, geo.midY, -300);
check("the wheel still scrolls over the column itself",
  columnInside && overColumn.after.scrollTop < overColumn.before.scrollTop,
  { ...overColumn, insideColumn: columnInside });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — the seeded conversation
overflows the window; the scroller spans the whole pane (left / right gaps ≈ 0 and the
gap above the composer ≤ 10px) while the messages and the composer stay a ≤1000px
column sharing one centre, leaving more than 40px of empty pane on each side; the
conversation opens scrolled to its bottom; the wheel over the empty pane left of
the column scrolls the list up and the messages visibly move, over the empty pane
right of it scrolls back down, and over the column itself keeps working. Exit
code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8912'
pkill -f 'serve-storage --home .*chat-scroll-test'
pkill -f 'main.ts.*--port 8910'
```
