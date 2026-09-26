# Test: core-web-input-grow

The AI input (`#ai-input-field`) grows with its content — soft-wrapped lines
included — from a 2-row minimum up to 10 rendered lines, after which it scrolls
inside; clearing it falls back to 2 rows.

Source of truth: `workspace/web/app.js` (`aiResizeInput`) and
`workspace/web/style.css` (`#ai-input` / `#ai-input-field`). The behaviour *is*
layout, so it is driven through a real browser (`ego-browser`) instead of curl:
`scrollHeight` cannot be observed without a layout engine.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

Serve the web assets alone — the AI service is not needed: the panel opens and
the textarea stays editable even when `/ai/new` fails.

```bash
cd workspace/web/server && go build -o /tmp/engineer-web . && /tmp/engineer-web 8610 \
  --root "$(cd .. && pwd)" \
  --static http://localhost:8502 --ai http://localhost:8501 --log http://localhost:8503 &
```

Expected on startup: `engineer web: http://localhost:8610`.

## Run

```bash
WEB_URL=http://localhost:8610 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8610";
const task = await taskSpace("core-web-input-grow");
const page = task.page("p1");
await page.goto(`${WEB}/`);
await page.waitForSelector("#ai-toggle", { state: "visible" });
if (await page.evaluate(() => document.getElementById("ai").hidden)) {
  await page.click("#ai-toggle");
}
await page.waitForSelector("#ai-input-field", { state: "visible" });

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

// Soft wrapping depends on width: narrowing the window must re-measure. The
// CDP override fires resize on the way in; clearing it does not, so the
// listener is dispatched manually to stand in for the user's window resize.
await setText("the quick brown fox jumps over the lazy dog and keeps running on");
const wide = await measure();
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
await page.waitForTimeout(200);
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
pkill -f 'engineer-web 8610'
```
