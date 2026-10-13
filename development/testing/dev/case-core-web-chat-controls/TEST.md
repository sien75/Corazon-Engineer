# Test: core-web-chat-controls

The conversation's own controls are two things a user reaches for without
thinking, and neither is a pane's or a tab's: what `Esc` does, and what happens
when the model asks a question.

**Esc unwinds one layer at a time** — the delete confirm, then the theme menu,
then the composer's drawer, then the run in flight — and the launcher's Esc owns
the key while the launcher is open (the conversation behind it is not the thing
on screen). The layers live on the *pane* the user is working in: the run it
stops is that pane's conversation, exactly like the stop button.

**An `ask_user` question is asked once and answered once.** Picking an option
sends it as an ordinary text block on `/ai/ask` (`contracts/ai-ask.yaml` — there
is no answer endpoint), naming the tab the turn speaks for so the layout tool has
a target; the run continues from there. When the same conversation is shown in
two panes, the question puts a card in each — answering it in either closes
them both.

Source of truth: `workspace/web/app.js` (`bindComposer`, the window `keydown`
listeners, `aiStop`, `aiAskUser` → `aiHubAnswer` → `aiAnswer`). Two of these are
a keyboard path and a click path through the real DOM, so the case runs through a
real browser (`ego-browser`); the third thing it asserts — what went out on the
wire — is read back from the fixture.

A canned provider is what makes this deterministic: `ask_user` cannot be asked for
by a real model on demand, and a run has to be *in flight* while Esc is pressed.
So the fixture answers the ai and log endpoints with a fixed script in the
documented shape (`contracts/ai-stream.yaml`) and **keeps the stream open after
the question** — an unresolved question is a run that has not settled, which is
what the stop control tracks. The frontend still runs its real path: real keys,
real clicks, real `/ai/ask` and `/ai/stop`.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"

# Reclaim the previous run's fixture before writing this one's: it binds the same
# port, so a leftover would keep answering with the old script.
pkill -f "chat-controls-fake" 2>/dev/null || true
sleep 1

# The fake provider is a fixture, not part of the system: it scripts the run and
# records what the frontend sent. Kept in /tmp — outside the project, so this case
# stays desp.yaml + TEST.md.
cat > /tmp/chat-controls-fake.go <<'GO'
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type m = map[string]any

// The whole fixture state: the event log the stream replays from `since`, the
// subscribers a live run is pushed to, and what the frontend actually sent us.
// The last part is read back through /seen — the answer's payload is the thing
// under test and it is not visible in the DOM.
var (
	mu      sync.Mutex
	seq     int
	events  []m
	subs    = map[chan m]bool{}
	asks    []string
	stops   int
	pending bool
)

func emit(evs ...m) {
	mu.Lock()
	defer mu.Unlock()
	for _, ev := range evs {
		seq++
		ev["seq"] = seq
		events = append(events, ev)
		for c := range subs {
			select {
			case c <- ev:
			default: // a full buffer is a slow reader; the seq watermark makes it refetch
			}
		}
	}
}

// question is the canned run that ends in an ask_user card — and then stays put:
// nothing settles, so the run is still in flight when the test presses Esc.
func question() []m {
	return []m{
		{"type": "agent_start"},
		{"type": "turn_start"},
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_start"}},
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_delta", "delta": "先确认一下。"}},
		{"type": "tool_execution_start", "toolCallId": "q1", "toolName": "ask_user",
			"args": m{"text": "选一个", "options": []any{
				m{"label": "A 选项", "value": "A"},
				m{"label": "B 选项", "value": "B"},
			}}},
	}
}

// answered is the rest of the run once an answer arrives: it echoes back the text
// it was given, so "the run continued" is visible on screen, and then settles.
func answered(text string) []m {
	return []m{
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_start"}},
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_delta", "delta": "ANSWER:" + text}},
		{"type": "message_end", "message": m{"role": "assistant"}},
		{"type": "agent_settled"},
	}
}

// field pulls one `key: value` out of the yaml body the frontend sends (a flat
// object dumped one key per line).
func field(body, key string) string {
	for _, line := range strings.Split(body, "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), key+":"); ok {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// The tab starts as one conversation in two panes: handing the same contentId to
// two panes is what makes "the question is asked once, in both views" checkable.
var layout = m{"split": m{"flexDirection": "row", "children": []any{
	m{"pane": m{"paneId": "p_a", "contentType": "chat", "contentId": "live-1"}},
	m{"pane": m{"paneId": "p_b", "contentType": "chat", "contentId": "live-1"}},
}}}

var record = m{"tabId": "t_live", "layout": layout,
	"createdAt": "2026-10-01T10:00:00Z", "updatedAt": "2026-10-01T10:00:00Z"}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
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

		// The run is driven by what the prompt says: a prompt that asks for a
		// question gets the ask_user script, anything else is an answer and gets
		// the continuation. That is what lets one fixture cover "stop the run"
		// and "answer the question" without the test telling it which is which.
		case "/ai/ask":
			b, _ := io.ReadAll(r.Body)
			body := string(b)
			mu.Lock()
			asks = append(asks, body)
			mu.Unlock()
			write(200, m{"sessionId": "live-1"})
			// The run streams *after* the call returns, as a service with a model
			// behind it does: the frontend attaches its subscription between the
			// response and the first event, and a run that settled in the same
			// instant would settle before anything was listening.
			if strings.HasPrefix(field(body, "text"), "ask me") {
				go func() {
					time.Sleep(150 * time.Millisecond)
					mu.Lock()
					pending = true
					mu.Unlock()
					emit(question()...)
				}()
				return
			}
			text := field(body, "text")
			go func() {
				time.Sleep(150 * time.Millisecond)
				mu.Lock()
				pending = false
				mu.Unlock()
				emit(answered(text)...)
			}()

		// A stop aborts the run: the agent settles and the stream closes.
		case "/ai/stop":
			io.Copy(io.Discard, r.Body)
			mu.Lock()
			stops++
			pending = false
			mu.Unlock()
			write(200, m{"sessionId": "live-1"})
			go func() {
				time.Sleep(150 * time.Millisecond)
				emit(m{"type": "agent_settled"})
			}()

		// The subscription is per conversation, and `since` is its watermark: the
		// backlog is enqueued under the same lock the emitters take, so a new
		// subscriber can never see a later event before an earlier one.
		case "/ai/stream":
			b, _ := io.ReadAll(r.Body)
			since := 0
			fmt.Sscanf(field(string(b), "since"), "%d", &since)
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			flusher, _ := w.(http.Flusher)
			c := make(chan m, 256)
			mu.Lock()
			for _, ev := range events {
				if ev["seq"].(int) > since {
					c <- ev
				}
			}
			subs[c] = true
			mu.Unlock()
			defer func() {
				mu.Lock()
				delete(subs, c)
				mu.Unlock()
			}()
			for {
				select {
				case ev := <-c:
					body, _ := json.Marshal(ev)
					fmt.Fprintf(w, "id: %v\ndata: %s\n\n", ev["seq"], body)
					if flusher != nil {
						flusher.Flush()
					}
					if ev["type"] == "agent_settled" {
						return
					}
				case <-r.Context().Done():
					return
				}
			}

		// `active` is what tells a pane joining late whether to subscribe: a
		// question standing open is a run that has not settled.
		case "/ai/resume":
			mu.Lock()
			last, active := seq, pending
			mu.Unlock()
			write(200, m{"sessionId": "live-1", "lastSeq": last, "active": active})

		case "/ai/new":
			write(200, m{"sessionId": "live-1"})

		// What the frontend sent us, for the test to assert on.
		case "/seen":
			mu.Lock()
			out := m{"asks": asks, "stops": stops}
			mu.Unlock()
			write(200, out)

		case "/log/tab/new":
			write(200, m{"tabId": "t_live"})
		case "/log/tab/mutation", "/log/tab/detail":
			write(200, record)
		case "/log/tab/list":
			write(200, m{"tabs": []any{record}, "pageNum": 1, "hasMore": false, "pageSize": 100})
		case "/log/session-detail":
			write(200, m{"sessionId": "live-1", "messages": []any{}})
		case "/log/list":
			write(200, m{"sessions": []any{m{"sessionId": "old-1", "count": 3,
				"preview": "历史会话", "lastAt": "2026-10-01 10:00"}}})
		default:
			write(404, m{"error": m{"code": "not_found", "message": r.URL.Path}})
		}
	})
	log.Printf("fake provider: http://%s", os.Args[1])
	log.Fatal(http.ListenAndServe(os.Args[1], nil))
}
GO
go build -o /tmp/chat-controls-fake /tmp/chat-controls-fake.go
/tmp/chat-controls-fake 127.0.0.1:9011 >/tmp/chat-controls-fake.log 2>&1 &
sleep 1
curl -s -X POST http://localhost:9011/ai/resume -d 'id: live-1'
echo

# Reclaim a previous run of this case. A leftover service keeps serving its old
# script (or silently stops this run's from binding, so the frontend talks to the
# other case's services) — and the failure that causes looks like a wrong answer,
# not a dead service. This happens before, not after.
for p in 9010; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-web --bind 127.0.0.1 --port 9010 --assets "$ROOTDIR/workspace/web" \
  --pages /tmp/engineer-pages-unused \
  --static http://localhost:9012 --ai http://localhost:9011 --log http://localhost:9011 \
  >/tmp/chat-controls-web.log 2>&1 &
sleep 1
```

Expected on startup: the fixture answering `{"sessionId":"live-1","lastSeq":0,"active":false}`
and `engineer web: http://localhost:9010`. Nothing needs to listen on 9012 (the
graph view is not exercised here).

## Run

```bash
WEB_URL=http://localhost:9010 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:9010";
const FAKE = "http://localhost:9011";

const space = await taskSpace("core-web-chat-controls");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const errors = [];
page.on?.("pageerror", (e) => errors.push(String(e)));

// What the frontend actually sent: the answer's payload is invisible in the DOM,
// and it is exactly what the bug dropped.
const seen = async () => {
  const res = await page.fetch(`${FAKE}/seen`);
  return JSON.parse(res.body);
};
// The control state the checks read. An answered question keeps its card on
// screen disabled — that is the "asked once" rule — so what "the question
// standing now" means is the set of *enabled* options: the run whose options are
// still clickable is the run in flight.
const view = () => page.evaluate(() => {
  const buttons = [...document.querySelectorAll("#panes .pane-chat .ai-question-options button")];
  return {
    panes: document.querySelectorAll("#panes .pane-chat").length,
    questions: document.querySelectorAll("#panes .pane-chat .ai-question").length,
    enabled: buttons.filter((b) => !b.disabled).map((b) => b.textContent),
    stops: [...document.querySelectorAll("#panes .ai-stop")].filter((b) => !b.hidden).length,
    text: [...document.querySelectorAll("#panes .pane-chat .pane-messages")].map((m) => m.textContent),
    drawer: !document.getElementById("ai-cmd").hidden,
    drawerRows: document.querySelectorAll("#ai-cmd .ai-cmd-item").length,
    confirm: !!document.querySelector(".ai-confirm"),
    themeMenu: !document.getElementById("theme-menu").hidden,
    launcher: !document.getElementById("newtab").hidden,
    inputDisabled: document.getElementById("ai-input-field").disabled,
  };
});
// A question that is standing now: an option that can still be clicked.
const question = () => page.waitForFunction(
  () => document.querySelectorAll("#panes .pane-chat .ai-question-options button:not([disabled])").length > 0,
  undefined, { timeout: 15_000 });
// Sending waits for the previous run to settle: a hub keeps its one connection
// until then, and a send during that window would be drawn into the connection
// that is already closing.
const waitSettled = () => page.waitForFunction(
  () => [...document.querySelectorAll("#panes .ai-stop")].every((b) => b.hidden),
  undefined, { timeout: 15_000 });
const send = async (text) => {
  await page.click("loc=css:#panes .pane-chat >> nth=0");
  await page.fill("#ai-input-field", text);
  await page.click("#ai-send");
};

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// Open tabs persist in localStorage; a tab left over from an earlier run would
// be reopened (and its session replayed) instead of the fresh one this case needs.
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// The tab is one conversation in two panes (the fixture's record says so): both
// lists hold it, so "asked once, in both views" is checkable.
await page.click("#tab-add");
await page.waitForSelector('.launch-item[data-action="newchat"]', { state: "visible" });
await page.click('.launch-item[data-action="newchat"]');
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(1200);
check("the tab opens with the conversation in both panes", (await view()).panes === 2, await view());

// ---------- 1. picking an option answers the question ----------

await send("ask me something");
await question();
let v = await view();
check("the question is a card in each pane, carrying the labels the model sent",
  v.questions === 2 && v.enabled.length === 4 &&
  JSON.stringify(v.enabled) === JSON.stringify(["A 选项", "B 选项", "A 选项", "B 选项"]),
  { cards: v.questions, enabled: v.enabled });
check("an unanswered question is a run in flight: both panes offer stop",
  v.stops === 2, { stops: v.stops });

// The second option of the first pane, among the options still standing. Both
// panes hold the same question, so their order is pane 0's then pane 1's.
await page.click("css:#panes .pane-chat .ai-question-options button:not([disabled]) >> nth=1");
await page.waitForFunction(
  () => [...document.querySelectorAll("#panes .pane-chat .pane-messages")]
    .some((m) => m.textContent.includes("ANSWER:B")),
  undefined, { timeout: 15_000 });

const answered = await seen();
// The answer is the last /ai/ask: the picked value as a text block, and the tab
// it speaks for — without the tabId the layout tool has no target for the turn.
const answerBody = answered.asks[answered.asks.length - 1];
check("the picked option goes out as the text block the contract describes",
  /blocks:[\s\S]*?-\s*type:\s*text/.test(answerBody) && /\btabId:\s*t_live\b/.test(answerBody) &&
  /\btext:\s*B\s*$/.test(answerBody),
  { body: answerBody });
v = await view();
check("the run continues from the answer",
  v.text.some((t) => t.includes("ANSWER:B")), { texts: v.text.map((t) => t.slice(-40)) });
check("answering in one pane closes the question in both",
  v.enabled.length === 0 && v.questions === 2, { enabled: v.enabled, cards: v.questions });
await waitSettled();

// ---------- 2. Esc stops the run in flight ----------

await send("ask me again");
await question();
v = await view();
check("the second run asks its own question, in both panes",
  v.enabled.length === 4 && v.questions === 4, { enabled: v.enabled.length, cards: v.questions });
check("that run is in flight: both panes offer stop", v.stops === 2, { stops: v.stops });

const beforeEsc = (await seen()).stops;
await page.keyboard.press("Escape");
await waitSettled();
const afterEsc = await seen();
v = await view();
check("Esc asks the service to stop the run", afterEsc.stops === beforeEsc + 1,
  { before: beforeEsc, after: afterEsc.stops });
check("the stopped run leaves no stop control behind", v.stops === 0, { stops: v.stops });

// ---------- 3. Esc unwinds the conversation's layers, one at a time ----------

// The session picker: /resume opens the drawer, and it is the composer's own
// layer — Esc leaves it without touching anything else.
await page.click("loc=css:#panes .pane-chat >> nth=0");
await page.fill("#ai-input-field", "/resume");
await page.keyboard.press("Enter");
await page.waitForFunction(() => !document.getElementById("ai-cmd").hidden, undefined, { timeout: 10_000 });
v = await view();
check("the session picker opens as the composer's drawer",
  v.drawer && v.drawerRows === 1 && v.inputDisabled, { drawer: v.drawer, rows: v.drawerRows });

// "d" opens the delete confirm on top of it; Esc closes the confirm and leaves
// the drawer standing — the layers unwind one at a time, not all at once.
await page.keyboard.press("d");
await page.waitForFunction(() => !!document.querySelector(".ai-confirm"), undefined, { timeout: 10_000 });
check("delete opens its confirm over the drawer", (await view()).confirm, null);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
v = await view();
check("Esc closes the confirm and leaves the drawer standing",
  !v.confirm && v.drawer, { confirm: v.confirm, drawer: v.drawer });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
v = await view();
check("Esc then leaves the drawer and gives the input back",
  !v.drawer && !v.inputDisabled, { drawer: v.drawer, disabled: v.inputDisabled });

// The theme menu is a shell layer, not a pane's.
await page.click("#theme-toggle");
check("the theme menu opens", (await view()).themeMenu, null);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Esc closes the theme menu", !(await view()).themeMenu, null);

// ---------- 4. the launcher's Esc owns the key while it is open ----------

// A run in flight behind the launcher: Esc must back out of the launcher, not
// stop a conversation the user is not looking at.
await send("ask me once more");
await question();
const beforeLauncher = (await seen()).stops;
v = await view();
check("a run is in flight before the launcher opens", v.stops === 2, { stops: v.stops });
await page.click("#tab-add");
await page.waitForFunction(() => !document.getElementById("newtab").hidden, undefined, { timeout: 10_000 });
check("the launcher is open over that run", (await view()).launcher, null);
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
v = await view();
check("Esc backs out of the launcher", !v.launcher, { launcher: v.launcher });
check("and does not stop the run behind it", (await seen()).stops === beforeLauncher,
  { before: beforeLauncher, after: (await seen()).stops });
check("that run is still in flight, stop control and all", v.stops === 2, { stops: v.stops });

check("no page errors", errors.length === 0, { errors });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — the tab opens with one
conversation in two panes. The first run asks a question: a card appears in *both*
panes with the model's labels, both panes offer stop, and picking the second
option of the first pane sends `text: B` on `/ai/ask` naming the tab, continues
the run (`ANSWER:B` on screen) and closes both panes' cards. The second run is
stopped by `Esc` — the fixture counts the `/ai/stop` — and leaves no stop
control behind. `Esc` then unwinds the composer's own layers one at a time: the
delete confirm, then the session picker, giving the input back, and closes the
theme menu. With the launcher open over a third run in flight, `Esc` backs out of
the launcher and leaves that run alone. Exit code `0`.

## Teardown

```bash
pkill -f 'chat-controls-fake'
pkill -f 'serve-web --bind 127.0.0.1 --port 9010'
```
