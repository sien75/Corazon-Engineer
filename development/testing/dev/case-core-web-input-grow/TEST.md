# Test: core-web-input-grow
> ⚠️ 这个用例的 launcher 交互写的是旧外壳（`#newtab` / `data-action=newchat` / `#ai-input-field` 直接挂在
> document 上）。P1/P2 只改了它的启动参数（`--home` / 项目注册），断言部分**尚未**跟上当前外壳
> （composer 在 `<engineer-chat>` 的 shadow DOM 里，`+` 开的是 Engineer launcher）。重写属于另一件事，
> 记在 `development/iterations/2610-50-多项目工作区.md` 的已知缺口里。


The AI input (`#ai-input-field`) grows with its content — soft-wrapped lines
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
# "serve-log --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8920 8921 8922 8923; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8921 >/tmp/input-grow-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8921/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8921/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $ROOT"
# its own static, rooted at $ROOT: the launcher reads skills from static now
/tmp/engineer serve-static --log http://localhost:8921 --bind 127.0.0.1 --port 8922 >/tmp/input-grow-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8920 --stub \
  --log http://localhost:8921 --static http://localhost:8922 \
  --agents "$ROOTDIR/agents" >/tmp/input-grow-ai.log 2>&1 &)
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
  --static http://localhost:8922 --ai http://localhost:8920 --log http://localhost:8921 \
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
conversation is not read back here, so `--log` only needs to point anywhere).

## Run

```bash
WEB_URL=http://localhost:8923 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8923";
const task = await taskSpace("core-web-input-grow");
const page = task.page("p1");
await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// Open a skill: + gives the new tab page, and the row opens a chat with the
// skill text already in the composer. Clear it so the measurement starts empty.
await page.click("#tab-add");
await page.waitForSelector("#newtab .launch-item", { state: "visible" });
await page.click("loc=css:#newtab [data-section=skills] .launch-item >> nth=0");
await page.waitForSelector("#ai-input-field", { state: "visible" });
await page.evaluate(() => {
  const el = document.getElementById("ai-input-field");
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

// Rendered metrics of the textarea, plus the styles that define its limits.
const measure = () =>
  page.evaluate(() => {
    const el = document.getElementById("ai-input-field");
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
  });

// Drive the same path a real edit does: set the value, then fire input.
const setText = (text) =>
  page.evaluate((t) => {
    const el = document.getElementById("ai-input-field");
    el.value = t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);

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

// Soft wrapping depends on width: narrowing the window must re-measure. A CDP
// viewport override does not reliably deliver a resize event to the page (and
// firing one before the new layout settles would measure the old width), so the
// event is dispatched explicitly once the viewport has changed — standing in
// for the user resizing their window.
// Long enough to stay on one line at the full page width, and to wrap past
// two rows once the window is narrow.
await setText("the quick brown fox jumps over the lazy dog and keeps running on".repeat(3));
const wide = await measure();
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
await page.waitForTimeout(200);
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
const narrow = await measure();
await page.cdp("Emulation.clearDeviceMetricsOverride", {});
await page.waitForTimeout(200);
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
const restored = await measure();
check("narrowing the window re-wraps and grows", narrow.height > wide.height,
  { wide: wide.height, narrow: narrow.height });
check("restoring the width re-measures", Math.abs(restored.height - wide.height) <= 1,
  { restored: restored.height, wide: wide.height });

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
cap and turn on the inner scrollbar; 3 lines sit in between; narrowing the
window re-wraps and grows the box (and restoring the width re-measures it);
clearing returns to 2 rows. Exit code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8923'
pkill -f 'main.ts.*--port 8920'
pkill -f 'serve-log.*--port 8921'
```
