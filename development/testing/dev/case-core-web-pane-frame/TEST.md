# Test: core-web-pane-frame

When the model changes the tab's pane tree mid-run, the panes are **reconciled,
not rebuilt**. A pane the new tree keeps is the *same* pane — same element, same
draft, same scroll, still subscribed; a pane the tree drops is torn down and
stops receiving the run; a pane the tree adds joins the run in flight and shows
what has already been streamed, not just what comes next.

What makes "the same pane" decidable is `paneId`: the tree says which pane is
which, so a pane that merely *moves* in the tree (it changed position, not
identity) keeps its DOM and its share of the stream. Reading position as identity
is what this case exists to prevent.

Source of truth: `workspace/web/app.js` (`applyLayoutFrame` → `applyPaneLayout` →
`renderPanes` / `ensurePane`, `aiStream`, `aiLoadSession`). Tool events cannot
come from a real model deterministically, and the frontend's module scope is not
reachable from `page.evaluate`, so the case **serves the documented event stream
itself**: a fixture answering the ai and log endpoints with a fixed script
(`contracts/ai-stream.yaml` shape). The frontend still runs its real code path —
SSE parse → `tool_execution_end` → `applyPaneLayout`; only the model is canned.

The frame carries the tree the tool *stored*, which is also what makes this case
independent of the tool's own validation (`layout.ts`) — that half needs a real
provider and is verified by hand in
`development/iterations/2610-29-pane 共享会话流与格子身份.md`.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"

# Reclaim the previous run's fixture before writing this one's: it binds the same
# port, so a leftover would keep serving the old script.
pkill -f "pane-frame-fake" 2>/dev/null || true
sleep 1

# The fake provider is a fixture, not part of the system: it answers the ai and
# log endpoints with a canned event script so the run is deterministic and
# offline. Kept in /tmp — outside the project, so this case stays desp.yaml +
# TEST.md.
cat > /tmp/pane-frame-fake.go <<'GO'
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type m = map[string]any

// The tab starts as one conversation in two panes: p_a and p_b, both showing
// session live-1. Handing the same contentId to two panes is what lets a run
// reach both — and what makes dropping one of them observable.
var startLayout = m{"split": m{"flexDirection": "column", "children": []any{
	m{"pane": m{"paneId": "p_a", "contentType": "chat", "contentId": "live-1"}},
	m{"pane": m{"paneId": "p_b", "contentType": "chat", "contentId": "live-1"}},
}}}

// The tree the model's frame asks for: p_c is new, p_a *moved* from first to
// second, and p_b is gone. p_a changing position without changing identity is
// the whole point — a pane keyed by its place in the tree is a different pane
// after this frame.
var storedLayout = m{"split": m{"flexDirection": "column", "children": []any{
	m{"pane": m{"paneId": "p_c", "contentType": "chat", "contentId": "live-1"}},
	m{"pane": m{"paneId": "p_a", "contentType": "chat", "contentId": "live-1"}},
}}}

// One run: history is already streamed (seq 1-4, hence lastSeq 4), then the
// model changes the tree, then the run continues.
var live = []struct {
	wait time.Duration
	ev   m
}{
	{0, m{"seq": 1, "type": "agent_start"}},
	{150 * time.Millisecond, m{"seq": 2, "type": "turn_start"}},
	{150 * time.Millisecond, m{"seq": 3, "type": "message_update",
		"assistantMessageEvent": m{"type": "text_start"}}},
	{150 * time.Millisecond, m{"seq": 4, "type": "message_update",
		"assistantMessageEvent": m{"type": "text_delta", "delta": "FIRST-HALF "}}},
	{150 * time.Millisecond, m{"seq": 5, "type": "tool_execution_start",
		"toolCallId": "l1", "toolName": "layout", "args": m{"op": "write"}}},
	{150 * time.Millisecond, m{"seq": 6, "type": "tool_execution_end",
		"toolCallId": "l1", "toolName": "layout", "isError": false,
		"result": m{"details": m{"layout": storedLayout}}}},
	// The gap a real model leaves between a tool call and its next turn — long
	// enough for the pane the frame added to finish loading its history.
	{900 * time.Millisecond, m{"seq": 7, "type": "message_update",
		"assistantMessageEvent": m{"type": "text_delta", "delta": "SECOND-HALF"}}},
	{150 * time.Millisecond, m{"seq": 8, "type": "message_end",
		"message": m{"role": "assistant"}}},
	{150 * time.Millisecond, m{"seq": 9, "type": "agent_settled"}},
}

// The conversation starts empty: both panes replay it from log, and what this
// run streams is the only content they ever hold.
var history = []m{}

// asked flips when the test's send reaches /ai/ask: before it the session is
// idle (a stream subscription is answered with an empty backlog and closed, as
// the real service does), after it the canned run is the backlog.
var asked bool

// numOf pulls one `key: value` out of a one-line yaml body.
func numOf(r *http.Request, key string) int {
	b, _ := io.ReadAll(r.Body)
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), key+":"); ok {
			n := 0
			fmt.Sscanf(strings.TrimSpace(v), "%d", &n)
			return n
		}
	}
	return 0
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
			last := 0
			if asked {
				last = 4 // history + FIRST-HALF are out; the run is still going
			}
			write(200, m{"sessionId": "live-1", "lastSeq": last, "active": asked})
		case "/ai/ask":
			io.Copy(io.Discard, r.Body)
			asked = true
			write(200, m{"sessionId": "live-1"})
		case "/ai/stop":
			write(200, m{"sessionId": "live-1"})
		case "/ai/stream":
			since := numOf(r, "since")
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			flusher, _ := w.(http.Flusher)
			if !asked {
				return // idle: nothing live, close (as the real service does)
			}
			for _, e := range live {
				if e.ev["seq"].(int) <= since {
					continue
				}
				time.Sleep(e.wait)
				b, _ := json.Marshal(e.ev)
				fmt.Fprintf(w, "id: %v\ndata: %s\n\n", e.ev["seq"], b)
				if flusher != nil {
					flusher.Flush()
				}
			}
		case "/log/tab/new":
			write(200, m{"tabId": "t_live"})
		case "/log/tab/detail":
			write(200, m{"tabId": "t_live", "layout": startLayout,
				"createdAt": "2026-10-01T10:00:00Z", "updatedAt": "2026-10-01T10:00:00Z"})
		case "/log/tab/mutation":
			write(200, m{"tabId": "t_live", "layout": startLayout})
		case "/log/tab/list":
			write(200, m{"tabs": []any{m{"tabId": "t_live", "layout": startLayout,
				"createdAt": "2026-10-01T10:00:00Z", "updatedAt": "2026-10-01T10:00:00Z"}},
				"pageNum": 1, "hasMore": false, "pageSize": 100})
		case "/log/session-detail":
			write(200, m{"sessionId": "live-1", "messages": history})
		case "/log/list":
			write(200, m{"sessions": []any{}})
		default:
			write(404, m{"error": m{"code": "not_found", "message": r.URL.Path}})
		}
	})
	log.Printf("fake provider: http://%s", os.Args[1])
	log.Fatal(http.ListenAndServe(os.Args[1], nil))
}
GO
go build -o /tmp/pane-frame-fake /tmp/pane-frame-fake.go
/tmp/pane-frame-fake 127.0.0.1:9001 >/tmp/pane-frame-fake.log 2>&1 &
sleep 1

# Reclaim a previous run of this case. A leftover service keeps serving its old
# script (or silently stops this run's from binding, so the frontend talks to
# the other case's services) — and the failure that causes looks like a wrong
# answer, not a dead service. This happens before, not after.
for p in 9000; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-web --bind 127.0.0.1 --port 9000 --assets "$ROOTDIR/workspace/web" \
  --pages /tmp/engineer-pages-unused \
  --static http://localhost:9002 --ai http://localhost:9001 --log http://localhost:9001 \
  >/tmp/pane-frame-web.log 2>&1 &
sleep 1
```

Expected on startup: the fixture logging `fake provider: http://127.0.0.1:9001`
and `engineer web: http://localhost:9000`. Nothing needs to listen on 9002 (the
graph view is not exercised here).

## Run

```bash
WEB_URL=http://localhost:9000 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:9000";
const space = await taskSpace("core-web-pane-frame");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const errors = [];
page.on?.("pageerror", (e) => errors.push(String(e)));

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// 1. the tab opens as the stored tree says: one conversation in two panes
await page.click("#tab-add");
await page.waitForSelector('.launch-item[data-action="newchat"]', { state: "visible" });
await page.click('.launch-item[data-action="newchat"]');
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => document.querySelectorAll("#panes .pane-chat").length);
check("the tab opens with the two panes its record holds", opened === 2, { opened });

// The panes themselves are the handle on identity: keep the elements, so "the
// same pane" is checkable later as "the same node".
await page.evaluate(() => {
  const p = document.querySelectorAll("#panes .pane-chat");
  window.__a = p[0];
  window.__b = p[1];
});

// A draft in pane A, which stays. An unsent draft is state only the pane
// element holds — it is what tells a moved pane from a rebuilt one.
await page.fill("loc=css:#panes .pane-chat .ai-input-field >> nth=0", "kept draft");

// 2. send from pane B: the run starts, and the model changes the tree mid-run
await page.click("loc=css:#panes .pane-chat >> nth=1");
await page.waitForTimeout(300);
await page.fill("#ai-input-field", "run for the frame test");
await page.click("#ai-send");

// The frame lands ~750ms in (four events), the rest of the run ~900ms later.
await page.waitForFunction(() => document.querySelectorAll("#panes .pane-chat").length === 2 &&
  [...document.querySelectorAll("#panes .pane-chat")].some((p) => p.textContent.includes("SECOND-HALF")),
  undefined, { timeout: 30_000 });
await page.waitForTimeout(1000);

const state = await page.evaluate(() => {
  const panes = [...document.querySelectorAll("#panes .pane-chat")];
  return {
    count: panes.length,
    first: panes[0] === window.__a ? "p_a" : panes[0] === window.__b ? "p_b" : "new",
    second: panes[1] === window.__a ? "p_a" : panes[1] === window.__b ? "p_b" : "new",
    draftA: window.__a.querySelector(".ai-input-field").value,
    texts: panes.map((p) => p.querySelector(".pane-messages").textContent),
    aText: window.__a.querySelector(".pane-messages").textContent,
    bText: window.__b.querySelector(".pane-messages").textContent,
    bDetached: !document.contains(window.__b),
    aAttached: document.contains(window.__a),
    msgs: panes.map((p) => p.querySelectorAll(".ai-msg").length),
  };
});

// 3. the tree is what the frame stored — p_c added, p_a moved, p_b dropped
check("the frame's tree is what renders: two panes, the new one first",
  state.count === 2 && state.first === "new" && state.second === "p_a", 
  { first: state.first, second: state.second });

// 4. the pane that only moved is the same pane: same node, same draft, its
// history still on screen
check("a pane that moved keeps its element instead of being rebuilt",
  state.aAttached && state.second === "p_a", { second: state.second });
check("a pane that moved keeps its unsent draft",
  state.draftA === "kept draft", { draftA: state.draftA });
check("the moved pane keeps taking the run it is part of",
  state.aText.includes("FIRST-HALF") && state.aText.includes("run for the frame test"),
  { a: state.aText.slice(0, 160) });

// 5. the pane the tree dropped is gone, and stops receiving the run
check("the dropped pane is detached from the document",
  state.bDetached, { detached: state.bDetached });
check("the dropped pane stops receiving the run",
  !state.bText.includes("SECOND-HALF"), { b: state.bText.slice(0, 120) });

// 6. the pane the frame added joins the run in flight: it shows what was
// streamed before it existed, and the prompt that started the run
check("the added pane shows the part of the run that predates it",
  state.first === "new" && state.texts[0].includes("FIRST-HALF"),
  { first: state.first, text: state.texts[0].slice(0, 160) });
check("the added pane shows the prompt that started the run",
  state.texts[0].includes("run for the frame test"), { text: state.texts[0].slice(0, 160) });
check("the added pane caught the rest of the run",
  state.texts[0].includes("SECOND-HALF"), { text: state.texts[0].slice(0, 160) });

// 7. and both surviving panes show the same conversation, from one stream
check("both panes end with the same conversation on screen",
  state.msgs[0] === state.msgs[1] && state.texts[0] === state.texts[1],
  { msgs: state.msgs });

check("no page errors", errors.length === 0, { errors });

console.log(JSON.stringify({ checks }, null, 2));
await space.finish({ keep: [] });
EOF
```

Expected: the tab opens with the two panes its record holds (`p_a`, `p_b`). A
draft is typed into `p_a`; the run is sent from `p_b`. When the model's frame
lands, the tab renders the stored tree — the new pane `p_c` first, `p_a` second,
`p_b` gone — and:

- `p_a` is the **same element** as before (`window.__a`), still attached, still
  holding `kept draft`, and still receiving the run (the prompt and `FIRST-HALF`);
- `p_b` is detached and never receives `SECOND-HALF`;
- `p_c` shows `FIRST-HALF` — streamed before it existed — plus the prompt that
  started the run, then `SECOND-HALF`, ending on exactly the same conversation as
  `p_a`.

## Teardown

```bash
pkill -f 'pane-frame-fake'
pkill -f 'serve-web --bind 127.0.0.1 --port 9000'
```
