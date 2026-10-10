# Test: core-web-tool-chips

The chat chips — `thinking` and every tool call — are presentation only: a fixed
120px box showing an icon plus the one piece of its arguments that identifies
the call (file name, program name, search pattern, skill name), never the tool
name as the whole label, never a caret. Consecutive chips flow horizontally and
wrap; any non-chip content (assistant text, user message, question card, the
compaction note) ends the row, so the chips after it start a new one.

Source of truth: `workspace/web/app.js` (`aiToolChip`, `AI_ICONS`, `aiChipRow`,
`aiCollapse`, `aiLayoutPanels`) and `workspace/web/style.css` (`.ai-chip-row`,
`.ai-collapse`). Each opened detail leads with the tool's own name (the 120px chip
shows the argument instead), and only one is open at a time.
The behaviour *is* layout, so it is driven through a real browser
(`ego-browser`): width, ellipsis and wrap cannot be observed without a layout
engine.

Tool events cannot come from a real model deterministically, and the frontend's
module scope is not reachable from `page.evaluate`, so the test stands in for the
provider by *serving the documented event stream itself*: a fixture answering
the ai and log endpoints with a fixed script (`contracts/ai-stream.yaml` shape).
The frontend still runs its real code path — SSE parse → `tool_execution_start` →
chip construction; only the model is canned. The fixture is its own process
because the browser runner drops a script's stdout as soon as that script
listens on a socket.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"

# The fake provider is a fixture, not part of the system: it answers the ai / log
# endpoints with a canned event script so the run is deterministic and offline.
# Kept in /tmp — outside the project, so this case stays desp.yaml + TEST.md.
cat > /tmp/tool-chips-fake.go <<'GO'
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

type m = map[string]any

// One run: 11 chips, then assistant text, then 2 more chips. Every built-in
// tool appears once, plus an unknown one for the fallback icon.
var live = []m{
	{"seq": 1, "type": "agent_start"},
	{"seq": 2, "type": "message_update", "assistantMessageEvent": m{"type": "thinking_start"}},
	{"seq": 3, "type": "message_update", "assistantMessageEvent": m{"type": "thinking_delta", "delta": "weighing the options"}},
	{"seq": 4, "type": "tool_execution_start", "toolCallId": "t1", "toolName": "read", "args": m{"path": "src/very/long/path/README.md"}},
	{"seq": 5, "type": "tool_execution_start", "toolCallId": "t2", "toolName": "bash", "args": m{"command": "cd /tmp && bun run src/main.ts --addr :1"}},
	{"seq": 6, "type": "tool_execution_start", "toolCallId": "t3", "toolName": "write", "args": m{"path": "notes/drafts/draft.md"}},
	{"seq": 7, "type": "tool_execution_start", "toolCallId": "t4", "toolName": "edit", "args": m{"path": "workspace/web/style.css"}},
	{"seq": 8, "type": "tool_execution_start", "toolCallId": "t5", "toolName": "grep", "args": m{"pattern": "aiChipRow"}},
	{"seq": 9, "type": "tool_execution_start", "toolCallId": "t6", "toolName": "find", "args": m{"pattern": "**/*.spec.ts"}},
	{"seq": 10, "type": "tool_execution_start", "toolCallId": "t7", "toolName": "ls", "args": m{"path": "development/testing/"}},
	{"seq": 11, "type": "tool_execution_start", "toolCallId": "t8", "toolName": "bash", "args": m{"command": "sudo -E curl -s http://localhost:1"}},
	{"seq": 12, "type": "tool_execution_start", "toolCallId": "t9", "toolName": "edit", "args": m{"path": ".agents/skills/deploy-notes/SKILL.md"}},
	{"seq": 13, "type": "tool_execution_start", "toolCallId": "t10", "toolName": "mystery", "args": m{"x": 1}},
	{"seq": 14, "type": "tool_execution_end", "toolCallId": "t1", "isError": false, "result": "file body"},
	{"seq": 15, "type": "message_update", "assistantMessageEvent": m{"type": "text_start"}},
	{"seq": 16, "type": "message_update", "assistantMessageEvent": m{"type": "text_delta", "delta": "\n\n看完了。"}},
	{"seq": 17, "type": "tool_execution_start", "toolCallId": "t11", "toolName": "read", "args": m{"path": "AGENTS.md"}},
	{"seq": 18, "type": "tool_execution_start", "toolCallId": "t12", "toolName": "bash", "args": m{"command": "git log --oneline -5"}},
	{"seq": 19, "type": "agent_settled"},
}

// The same shape replayed from stored records: those chips come from
// /log/session-detail, so `ask_user` must not become a chip (it never does on
// the live path) and the row must break on the assistant text.
var history = []m{
	{"role": "assistant", "content": []any{
		m{"type": "thinking", "thinking": "reading first"},
		m{"type": "toolCall", "id": "h1", "name": "read", "arguments": m{"path": "workspace/ai/src/registry.ts"}},
		m{"type": "toolCall", "id": "h2", "name": "ask_user", "arguments": m{"text": "继续吗？"}},
		m{"type": "toolCall", "id": "h3", "name": "bash", "arguments": m{"command": "git status"}},
	}},
	{"role": "toolResult", "toolCallId": "h1", "isError": false, "content": []any{m{"type": "text", "text": "..."}}},
	{"role": "assistant", "content": []any{m{"type": "text", "text": "已读完。"}}},
	{"role": "assistant", "content": []any{
		m{"type": "toolCall", "id": "h4", "name": "ls", "arguments": m{"path": "development/testing/"}},
	}},
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		write := func(status int, v any) {
			b, _ := json.Marshal(v)
			w.Header().Set("Content-Type", "application/yaml")
			w.WriteHeader(status)
			w.Write(b)
		}
		switch r.URL.Path {
		case "/static/query":
			write(200, m{"skills": []any{}, "suggested-skills": []any{}, "blueprints": []any{}})
		case "/ai/new":
			write(200, m{"sessionId": "live-1"})
		case "/ai/resume":
			write(200, m{"sessionId": "history-1", "lastSeq": len(history), "active": false})
		case "/ai/ask", "/ai/stop":
			write(200, m{"sessionId": "live-1"})
		case "/ai/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			for _, ev := range live {
				b, _ := json.Marshal(ev)
				fmt.Fprintf(w, "id: %v\ndata: %s\n\n", ev["seq"], b)
			}
		case "/log/list":
			write(200, m{"sessions": []any{m{"sessionId": "history-1", "count": len(history), "lastAt": "2026-10-01 10:00"}}})
		case "/log/session-detail":
			msgs := make([]m, 0, len(history))
			for _, raw := range history {
				msgs = append(msgs, m{"raw": raw})
			}
			write(200, m{"messages": msgs})
		default:
			write(404, m{"error": m{"code": "not_found", "message": r.URL.Path}})
		}
	})
	log.Printf("fake provider: http://%s", os.Args[1])
	log.Fatal(http.ListenAndServe(os.Args[1], nil))
}
GO
go build -o /tmp/tool-chips-fake /tmp/tool-chips-fake.go
/tmp/tool-chips-fake 127.0.0.1:8611 >/tmp/tool-chips-fake.log 2>&1 &
sleep 1
curl -s -X POST http://localhost:8611/ai/new -d '{}'   # {"sessionId":"live-1"}
echo

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-web --bind 127.0.0.1 --port 8610 --assets "$ROOTDIR/workspace/web" \
  --pages /tmp/engineer-pages-unused \
  --static http://localhost:8699 --ai http://localhost:8611 --log http://localhost:8611 \
  >/tmp/tool-chips-web.log 2>&1 &
sleep 1
```

Expected on startup: the fixture answering `{"sessionId":"live-1"}` and
`engineer web: http://localhost:8610`. Nothing needs to listen on 8699 (the graph
view is not exercised here).

## Run

```bash
WEB_URL=http://localhost:8610 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8610";

const task = await taskSpace("core-web-tool-chips");
const page = task.page("p1");
await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// Open tabs persist in localStorage, and a tab left over from an earlier run
// would be reopened (and its session replayed) instead of the fresh chat this
// test needs — the reused id would even swallow the "Chat" click. Start from an
// empty profile.
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// A structural dump of the chip rows: only JSON-serializable values. `order`
// keeps the DOM order of chips and detail panels, which is what places a panel
// after the chips of one line.
const dump = () =>
  page.evaluate(() => {
    const round = (n) => Math.round(n);
    const label = (chip) => chip.querySelector(".ai-collapse-title").textContent;
    const rows = [...document.querySelectorAll("#ai-messages > .ai-chip-row")].map((row) => {
      const cs = getComputedStyle(row);
      const children = [...row.children];
      return {
        display: cs.display,
        wrap: cs.flexWrap,
        width: round(row.getBoundingClientRect().width),
        order: children.map((el) =>
          el.classList.contains("ai-collapse") ? `chip:${label(el)}` : "detail",
        ),
        panels: children
          .filter((el) => el.classList.contains("ai-collapse-body"))
          .map((el) => ({
            width: round(el.getBoundingClientRect().width),
            top: round(el.getBoundingClientRect().top),
            hidden: el.hidden,
            name: el.querySelector(":scope > .ai-collapse-body-name")?.textContent,
            nameWeight: getComputedStyle(el.querySelector(":scope > .ai-collapse-body-name")).fontWeight,
            first: el.firstElementChild?.className,
          })),
        chips: children
          .filter((el) => el.classList.contains("ai-collapse"))
          .map((chip) => {
            const title = chip.querySelector(".ai-collapse-title");
            const tcs = getComputedStyle(title);
            const box = chip.getBoundingClientRect();
            return {
              label: label(chip),
              icon: chip.querySelector(".ai-chip-icon svg")?.innerHTML || "",
              tooltip: chip.querySelector(".ai-collapse-head").title,
              width: round(box.width),
              top: round(box.top),
              caret: !!chip.querySelector(".ai-collapse-caret"),
              open: chip.classList.contains("open"),
              weight: tcs.fontWeight,
              overflow: tcs.textOverflow,
              clipped: title.scrollWidth > title.clientWidth,
            };
          }),
      };
    });
    return {
      rows,
      carets: document.querySelectorAll(".ai-collapse-caret").length,
      text: (document.querySelector("#ai-messages .ai-assistant")?.textContent || "").trim(),
    };
  });

const lines = (row) => new Set(row.chips.map((c) => c.top)).size;
// The chips sharing the first chip's top: one rendered line of the row.
const firstLine = (row) => row.chips.filter((c) => c.top === row.chips[0].top).length;
// ego-browser locators are single selectors with an optional terminal
// ">> nth=N", so chips are addressed by :nth-child index — a detail panel
// becomes a child of the row too, which would break :last-child.
const chipHead = (i) =>
  `css:#ai-messages > .ai-chip-row:first-child > .ai-collapse:nth-child(${i + 1}) > .ai-collapse-head`;
const FIRST_CHIP_HEAD = chipHead(0);
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

// ---------- live stream ----------

// The "+" page opens a skill or a blank chat; "Chat" is the blank one, which
// opens a fresh tab and consumes /ai/stream from seq 0.
await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item[data-action='newchat']", { state: "visible" });
await page.click("#newtab .skill-item[data-action='newchat']");
await page.waitForSelector("#ai-input-field", { state: "visible" });
await page.waitForFunction(
  () => document.querySelectorAll("#ai-messages > .ai-chip-row").length >= 2,
  undefined,
  { timeout: 10_000 },
);

const live = await dump();
const liveLabels = live.rows.map((r) => r.chips.map((c) => c.label));
const expectedLive = [
  ["thinking", "README.md", "bun", "draft.md", "style.css", "aiChipRow", "**/*.spec.ts", "testing", "curl", "deploy-notes", "mystery"],
  ["AGENTS.md", "git"],
];

check("chips group into one row per uninterrupted run", live.rows.length === 2,
  { rows: live.rows.length, labels: liveLabels });
check("every chip shows the identifying argument, not the tool name",
  JSON.stringify(liveLabels) === JSON.stringify(expectedLive),
  { got: liveLabels, want: expectedLive });
check("a row wraps instead of scrolling", live.rows[0].display === "flex" && live.rows[0].wrap === "wrap",
  { display: live.rows[0].display, wrap: live.rows[0].wrap });
check("the 11-chip run actually wraps", lines(live.rows[0]) > 1,
  { lines: lines(live.rows[0]), rowWidth: live.rows[0].width });

const allLiveChips = live.rows.flatMap((r) => r.chips);
check("chips are a fixed 120px", allLiveChips.every((c) => c.width === 120),
  { widths: allLiveChips.map((c) => c.width) });
check("no caret anywhere", live.carets === 0 && allLiveChips.every((c) => !c.caret),
  { carets: live.carets });
check("chip labels are secondary text: not bold",
  allLiveChips.every((c) => c.weight === "400"),
  { weights: [...new Set(allLiveChips.map((c) => c.weight))] });
check("labels that do not fit ellipsize",
  allLiveChips.every((c) => c.overflow === "ellipsis") && allLiveChips.some((c) => c.clipped),
  { clipped: allLiveChips.filter((c) => c.clipped).map((c) => c.label) });
check("the tooltip carries the full argument, not just the label",
  allLiveChips[1].tooltip.includes("read") && allLiveChips[1].tooltip.includes("src/very/long/path/README.md"),
  { tooltip: allLiveChips[1].tooltip });

// Icons: one per chip, all nine tools distinct, the unknown one a wrench.
const iconOf = {};
for (const c of allLiveChips) if (!(c.label in iconOf)) iconOf[c.label] = c.icon;
check("every chip carries an icon", allLiveChips.every((c) => c.icon.length > 0),
  { missing: allLiveChips.filter((c) => !c.icon).map((c) => c.label) });
const named = ["thinking", "README.md", "bun", "draft.md", "style.css", "aiChipRow", "**/*.spec.ts", "testing", "deploy-notes"];
const namedIcons = named.map((l) => iconOf[l]);
check("thinking + each tool has its own icon", new Set(namedIcons).size === namedIcons.length,
  { distinct: new Set(namedIcons).size, of: namedIcons.length });
check("an unknown tool falls back to the wrench icon",
  iconOf["mystery"].length > 0 && !namedIcons.includes(iconOf["mystery"]),
  { unknownIconMatchesKnown: namedIcons.includes(iconOf["mystery"]) });

// Opening a chip shows its detail under the chip's *whole line*: the line's
// chips keep their places and the detail spans the row between that line and the
// next, instead of breaking the line at the chip that was clicked.
const liveLine1 = firstLine(live.rows[0]);
const lineOneTops = live.rows[0].chips.slice(0, liveLine1).map((c) => c.top);
await page.click(FIRST_CHIP_HEAD);
await page.waitForTimeout(100);
const opened = await dump();
const openRow = opened.rows[0];
check("the first line holds more than the clicked chip",
  liveLine1 > 1 && liveLine1 < live.rows[0].chips.length,
  { firstLine: liveLine1, chips: live.rows[0].chips.length, rowWidth: live.rows[0].width });
check("the detail follows the last chip of the clicked chip's line",
  openRow.order[liveLine1] === "detail" && openRow.order.length === live.rows[0].chips.length + 1,
  { order: openRow.order, detailIndex: liveLine1 });
check("the detail spans the whole row",
  openRow.panels.length === 1 && Math.abs(openRow.panels[0].width - openRow.width) <= 1,
  { panels: openRow.panels, rowWidth: openRow.width });
check("it sits between the two lines",
  openRow.panels[0].top > openRow.chips[liveLine1 - 1].top &&
    openRow.panels[0].top < openRow.chips[liveLine1].top,
  { detailTop: openRow.panels[0].top, line1Top: openRow.chips[liveLine1 - 1].top, line2Top: openRow.chips[liveLine1].top });
check("the detail opens with the tool's own name",
  openRow.panels[0].name === "thinking" && openRow.panels[0].first === "ai-collapse-body-name",
  { name: openRow.panels[0].name, first: openRow.panels[0].first });
check("that name is secondary text too: not bold",
  openRow.panels[0].nameWeight === "400",
  { weight: openRow.panels[0].nameWeight });
check("the chips of that line do not move",
  openRow.chips.slice(0, liveLine1).every((c, i) => c.top === lineOneTops[i]),
  { before: lineOneTops, after: openRow.chips.slice(0, liveLine1).map((c) => c.top) });
check("an opened chip keeps its 120px",
  openRow.chips[0].open && openRow.chips[0].width === 120,
  { open: openRow.chips[0].open, width: openRow.chips[0].width });

// Only one detail at a time: opening another chip on the same line replaces the
// panel rather than stacking a second one under the row.
await page.click(chipHead(1));
await page.waitForTimeout(100);
const swapped = await dump();
check("opening another chip on the same line replaces the open detail",
  swapped.rows[0].panels.length === 1 &&
    !swapped.rows[0].chips[0].open && swapped.rows[0].chips[1].open,
  { panels: swapped.rows[0].panels.length, open: swapped.rows[0].chips.map((c) => c.open) });
check("the replacement lands in the same place, lines unmoved",
  swapped.rows[0].order[liveLine1] === "detail" &&
    swapped.rows[0].chips.slice(0, liveLine1).every((c, i) => c.top === lineOneTops[i]),
  { order: swapped.rows[0].order });
check("the replacement names its own tool",
  swapped.rows[0].panels[0].name === "read",
  { name: swapped.rows[0].panels[0].name, chip: swapped.rows[0].chips[1].label });

await page.click(chipHead(1));
await page.waitForTimeout(100);
const closed = await dump();
check("closing removes the detail",
  closed.rows[0].panels.length === 0 &&
    closed.rows[0].order.length === closed.rows[0].chips.length &&
    closed.rows[0].chips[0].width === 120,
  { order: closed.rows[0].order, width: closed.rows[0].chips[0].width });

// A chip on the last line puts its detail after that line — at the end of the
// row. The first chip of the last line is used, addressed by its index.
const lastTop = live.rows[0].chips[live.rows[0].chips.length - 1].top;
const LAST_LINE_HEAD = chipHead(liveLine1);
check("the chip picked for the last-line case starts the last line",
  live.rows[0].chips[liveLine1].top === lastTop,
  { index: liveLine1, top: live.rows[0].chips[liveLine1].top, lastTop });
await page.click(LAST_LINE_HEAD);
await page.waitForTimeout(100);
const bottom = await dump();
check("a detail on the last line ends the row",
  bottom.rows[0].order[bottom.rows[0].order.length - 1] === "detail" &&
    Math.abs(bottom.rows[0].panels[0].width - bottom.rows[0].width) <= 1,
  { order: bottom.rows[0].order });
check("the last line's chips do not move",
  bottom.rows[0].chips[bottom.rows[0].chips.length - 1].top === lastTop &&
    bottom.rows[0].panels[0].top > lastTop,
  { detailTop: bottom.rows[0].panels[0].top, lastTop });
check("the detail on the last line names its tool",
  bottom.rows[0].panels[0].name === "ls",
  { name: bottom.rows[0].panels[0].name, chip: bottom.rows[0].chips[liveLine1].label });
await page.click(LAST_LINE_HEAD);
await page.waitForTimeout(100);
check("the live run rendered its text", live.text.includes("看完了"), { text: live.text });

// ---------- history replay ----------

await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item[data-action='resume']", { state: "visible" });
await page.click("#newtab .skill-item[data-action='resume']");
// Wait for a label only the replayed session has — the live rows are still on
// screen when the click returns, so a row count alone would race ahead.
await page.waitForFunction(
  () => [...document.querySelectorAll("#ai-messages .ai-collapse-title")].some((t) => t.textContent === "registry.ts"),
  undefined,
  { timeout: 10_000 },
);
const replay = await dump();
const replayLabels = replay.rows.map((r) => r.chips.map((c) => c.label));
const expectedReplay = [["thinking", "registry.ts", "git"], ["testing"]];

check("replayed chips group exactly like the live ones",
  JSON.stringify(replayLabels) === JSON.stringify(expectedReplay),
  { got: replayLabels, want: expectedReplay });
check("replayed chips are also 120px, no caret",
  replay.rows.flatMap((r) => r.chips).every((c) => c.width === 120 && !c.caret),
  { widths: replay.rows.flatMap((r) => r.chips).map((c) => c.width) });
check("ask_user never becomes a chip",
  !replay.rows.flatMap((r) => r.chips).some((c) => c.tooltip.includes("ask_user")),
  { tooltips: replay.rows.flatMap((r) => r.chips).map((c) => c.tooltip) });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await task.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — the live run renders 11
chips in one wrapping row (`thinking` `README.md` `bun` `draft.md` `style.css`
`aiChipRow` `**/*.spec.ts` `testing` `curl` `deploy-notes` `mystery`) and 2 more
after the assistant text; all chips are exactly 120px with an icon, ellipsis and
no caret; the nine tools have nine distinct icons and the unknown tool uses a
wrench. Opening a chip on a wrapped line shows its detail under that whole line —
the line's chips stay put, the detail spans the row, and the next line moves down;
one detail at a time (opening another replaces it and renames itself); the detail's
first line is the tool's own name with the call content below it (chip labels and
that name are secondary text: neither is bold); a chip on the last
line puts its detail at the end of the row; closing removes it. Reopening a past
conversation replays the same grouping from stored records, with `ask_user` never
becoming a chip. Exit code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8610'
pkill -f 'tool-chips-fake 127.0.0.1:8611'
```
