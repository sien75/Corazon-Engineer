# Test: core-web-input-grow
The AI input grows with its content — soft-wrapped lines
included — from a 2-row minimum up to 10 rendered lines, after which it scrolls
inside; clearing it falls back to 2 rows.

Source of truth: `workspace/web/app.js` (`aiResizeInput`) and
`workspace/web/style.css` (`#ai-input` / `#ai-input-field`). The behaviour *is*
layout, so it is driven through a real browser (`ego-browser`) instead of curl:
`scrollHeight` cannot be observed without a layout engine.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

The chat panel is the content of a tab (there is no side panel and no `ai`
toggle any more), so the ai service is needed to open one — in stub mode, so the
run is deterministic and offline.

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.input-grow"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: input-grow\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-storage --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8920 8921 8923; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8921 >/tmp/input-grow-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8921/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8921/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $ROOT"
# its own static, rooted at $ROOT: the launcher reads skills from static now

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8920 --stub \
  --storage http://localhost:8921 \
  --agents "$ROOTDIR/agents" --docs "$ROOTDIR/.engineer/docs" >/tmp/input-grow-ai.log 2>&1 &)
sleep 2
# one skill, so the new tab page has something to open — a plain file
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8920/ai/new -d '{}' && break
  sleep 1
done
mkdir -p "$ROOT/.agents/skills/input-grow"
printf -- '---\nname: Input grow\ndescription: placeholder skill\n---\nplaceholder skill\n' \
  > "$ROOT/.agents/skills/input-grow/SKILL.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-web --bind 127.0.0.1 --port 8923 --assets "$ROOTDIR/workspace/web" \
  --storage http://localhost:8921 --ai http://localhost:8920 \
  >/tmp/input-grow-web.log 2>&1 &
# The browser drives this service a few lines later, so wait for the port instead
# of hoping it bound in time: a lost race reads as a wrong answer (a refused
# navigation), not as a missing service.
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://localhost:8923/ && break
  sleep 1
done
```

Expected on startup: `engineer web: http://localhost:8923` (the recorded
conversation is not read back here, so `--storage` only needs to point anywhere).

## Run

```bash
WEB_URL=http://localhost:8923 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8923";
const task = await taskSpace("core-web-input-grow");
const page = task.page("p1");
await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
// main is the shell's own conversation and it is on screen from the first paint:
// its composer is what this case measures. The composer lives in the shadow root
// of the visible pane's <engineer-chat>, so every read goes through it.
const measureInput = `(() => {
  const host = document.querySelector("#panes .view:not([hidden])");
  if (!host || host.tagName !== "ENGINEER-CHAT" || !host.shadowRoot) return null;
  return host.shadowRoot.querySelector(".ai-input-field");
})()`;

// Rendered metrics of the textarea, plus the styles that define its limits.
const measure = () =>
  page.evaluate((find) => {
    const el = eval(find);
    const cs = getComputedStyle(el);
    return {
      height: Math.round(el.getBoundingClientRect().height),
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflowY: cs.overflowY,
      lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4,
      chrome:
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth),
    };
  }, measureInput);

// Drive the same path a real edit does: set the value, then fire input.
const setText = (text) =>
  page.evaluate(([t, find]) => {
    const el = eval(find);
    el.value = t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [text, measureInput]);

// 组件是按 input 事件量的：空框落盘时还没量过，先给它一个事件，再读基线。
await setText("");
const base = await measure();
const rows = (n) => Math.round(base.lineHeight * n + base.chrome);
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

const empty = base;
check("empty falls back to 2 rows", Math.abs(empty.height - rows(2)) <= 1,
  { height: empty.height, expected: rows(2), overflowY: empty.overflowY });

await setText("x".repeat(1000)); // one very long logical line -> soft wrap
const soft = await measure();
check("soft wrap grows the box", soft.height > rows(2),
  { height: soft.height, twoRows: rows(2) });

await setText(Array.from({ length: 11 }, (_, i) => `line ${i}`).join("\n"));
const capped = await measure();
check("11 logical lines cap at 10 rows", Math.abs(capped.height - rows(10)) <= 1,
  { height: capped.height, expected: rows(10) });
check("past the cap it scrolls inside", capped.overflowY === "auto" &&
  capped.scrollHeight > capped.clientHeight,
  { overflowY: capped.overflowY, scrollHeight: capped.scrollHeight, clientHeight: capped.clientHeight });

await setText("a\nb\nc");
const mid = await measure();
check("3 lines sit between 2 and 10 rows", mid.height > rows(2) && mid.height < rows(10) &&
  mid.overflowY === "hidden", { height: mid.height, overflowY: mid.overflowY });

await setText("");
const cleared = await measure();
check("clearing returns to 2 rows", Math.abs(cleared.height - rows(2)) <= 1 &&
  cleared.overflowY === "hidden", { height: cleared.height, expected: rows(2), overflowY: cleared.overflowY });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await task.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — the empty input is
2 rows; a long soft-wrapped line grows it; 11 logical lines stop at the 10-row
cap and turn on the inner scrollbar; 3 lines sit in between; clearing returns to 2 rows. Exit code `0`.

Not covered: 窗口宽度变化后自动重量。组件只在 input 事件上量（`resize()` 由
input 触发），改窗口宽度本身不会让它重新按行数长高；写过一版 width 的
ResizeObserver，在这台机器上没能验证出来，撤掉了。要恢复这个行为是产品改动，
不是用例能钉的事。

## Teardown

```bash
pkill -f 'serve-web.*--port 8923'
pkill -f 'main.ts.*--port 8920'
pkill -f 'serve-storage.*--port 8921'
```
