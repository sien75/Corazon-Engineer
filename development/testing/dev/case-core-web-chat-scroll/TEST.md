# Test: core-web-chat-scroll

> ⚠️ 这个用例的外壳交互写的是旧外壳（`#ai-scroll` / `#ai-messages` / `/chat/<id>`，都是 chat 搬进
> `<engineer-chat>` shadow DOM 之前的形状）。P1/P2 只改了它的启动参数（`--home` / 项目注册），
> 断言部分**尚未**跟上当前外壳，跑起来会在选择器上先失败；重写它属于另一件事，记在
> `development/iterations/2610-50-多项目工作区.md` 的已知缺口里。

A conversation is read as a column: the messages and the composer are capped at
1000px and centred. The *scrolling*, though, belongs to the whole pane — the
scroll container spans the full width of the chat page, so the wheel scrolls the
conversation wherever the pointer is, not only while it is over the column.
`#ai-scroll` is that container; `#ai-messages` inside it is the column.

Source of truth: `workspace/web/index.html` (`#ai-scroll`), `workspace/web/style.css`
(`#ai-scroll` / `#ai-messages` / `#ai-input`) and `workspace/web/app.js`
(`aiAtBottom` / `aiScrollToBottom`). Scroll geometry and wheel input are browser
behaviour, so this case runs through a real browser (`ego-browser`).

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
# A scratch project root: the case must not touch the real .engineer/ or log.
# log's database lives in the engineer home.
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.chat-scroll-test"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: chat-scroll-test\n' > "$ROOT/engineer.yaml"

# log + ai on their own ports; ai in stub mode, so the run is deterministic and
# offline. The conversation itself is seeded from the test (see Run).
# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-log --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8910 8911 8912; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8911 >/tmp/chat-scroll-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8911/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8911/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $ROOT"
PROJECT=$(curl -s -X POST http://localhost:8911/log/project/list | awk '$1=="projectId:" {print $2}' | head -1)

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8910 --stub \
  --log http://localhost:8911 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents" \
  >/tmp/chat-scroll-ai.log 2>&1 &)

# web assets
/tmp/engineer serve-web --bind 127.0.0.1 --port 8912 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:8502 --ai http://localhost:8910 --log http://localhost:8911 \
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
`engineer web: http://localhost:8912`. (`--static` is only referenced by the
frontend, never called here, so any address — or none — is fine.)

## Run

The conversation is seeded through the same APIs the page uses: a long prompt,
which the dev stub echoes back as the reply, so the replay is far taller than the
window. It is then opened as a deep link (`/chat/<sessionId>`).

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

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.clear());
const ai = await page.evaluate(async () => (await import("/config.js")).ENGINEER.ai);

// 1. seed a conversation much taller than the window (the stub echoes the prompt).
// A conversation belongs to no tab, so this needs no tab id.
const created = await post(`${ai}/ai/new`, "{}");
const sid = (created.match(/sessionId:\s*(\S+)/) || [])[1];
check("the seed session was created", !!sid, { response: String(created).trim() });
const filler = Array.from({ length: 140 }, (_, i) =>
  `      filler line ${String(i + 1).padStart(3, "0")}\n`).join("");
await post(`${ai}/ai/ask`, `id: ${sid}\nblocks:\n  - type: text\n    text: |\n${filler}`);

// 2. open it as a deep link and wait until it really overflows
await page.goto(`${WEB}/chat/${sid}`);
await page.waitForFunction(() => {
  const s = document.getElementById("ai-scroll");
  return s && s.scrollHeight > s.clientHeight + 500;
}, undefined, { timeout: 30_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });

// 3. the geometry: full-width scroller, capped centred column
const geo = await page.evaluate(() => {
  const host = document.querySelector("#panes .pane-chat").getBoundingClientRect();
  const s = document.getElementById("ai-scroll").getBoundingClientRect();
  const t = document.getElementById("ai-messages").getBoundingClientRect();
  const i = document.getElementById("ai-input").getBoundingClientRect();
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
    // a point inside the scroller but outside the column, on each side
    leftX: Math.round(Math.max(s.left + 4, t.left - 60)),
    rightX: Math.round(Math.min(s.right - 4, t.right + 60)),
    midY: Math.round((s.top + s.bottom) / 2),
  };
});
check("the scroll area spans the whole pane",
  geo.gapLeft <= 1 && geo.gapRight <= 1 &&
  geo.scrollerWidth >= geo.hostWidth - 1 && geo.gapAboveComposer <= 1, geo);
check("the conversation column is still capped and centred",
  geo.threadWidth <= 1001 && Math.abs(geo.threadCentreOffset) <= 2 &&
  Math.abs(geo.inputCentreOffset) <= 2, geo);
check("there is empty pane on both sides of the column",
  geo.columnLeft > 40 && geo.columnRight > 40, geo);

// 4. an opened conversation sits at its bottom (the stick-to-bottom rule reads
// the scroller now, not the column)
const opened = await page.evaluate(() => {
  const s = document.getElementById("ai-scroll");
  return { gap: Math.round(s.scrollHeight - s.scrollTop - s.clientHeight) };
});
check("a freshly opened conversation sits at its bottom", opened.gap <= 2, opened);

// 5. the wheel works over the empty pane, on both sides
const inColumn = (x, y) => page.evaluate(
  ([x, y]) => !!document.elementFromPoint(x, y)?.closest("#ai-messages"), [x, y]);
const state = () => page.evaluate(() => {
  const s = document.getElementById("ai-scroll");
  const first = document.querySelector("#ai-messages .ai-msg");
  return {
    scrollTop: Math.round(s.scrollTop),
    firstBubbleTop: first ? Math.round(first.getBoundingClientRect().top) : null,
  };
});
const wheelAt = async (x, y, dy) => {
  const before = await state();
  await page.mouse.move(x, y, { label: "pointer over the chat pane" });
  await page.mouse.wheel(0, dy, { label: "scroll the conversation" });
  await page.waitForFunction(
    ([b, d]) => d > 0
      ? document.getElementById("ai-scroll").scrollTop > b
      : document.getElementById("ai-scroll").scrollTop < b,
    [before.scrollTop, dy], { timeout: 3_000 }).catch(() => {});
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
overflows the window; `#ai-scroll` spans the whole pane (left / right gaps and the
gap above the composer ≤ 1px) while the messages and the composer stay a ≤1000px
column sharing one centre, leaving more than 40px of empty pane on each side; the
conversation opens scrolled to its bottom; the wheel over the empty pane left of
the column scrolls the list up and the messages visibly move, over the empty pane
right of it scrolls back down, and over the column itself keeps working. Exit
code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8912'
pkill -f 'serve-log --home .*chat-scroll-test'
pkill -f 'main.ts.*--port 8910'
```
