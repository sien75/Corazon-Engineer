# Test: core-web-chat-composer

Three things a user does with the composer without thinking, all of them in
`<engineer-chat>` and all three dropped when the chat moved out of `app.js` in
`84d52d0` (see `development/iterations/2610-44-…`):

1. **Typing while a run is in flight sends it — it does not wait.** The prompt
   goes out on `/ai/ask` while the run is still streaming, and the service steers
   it into the run (`contracts/ai-ask.yaml`; the backend has done this since
   `d23c816`). The composer clears, the user turn is drawn, stop stays offered.
2. **Esc stops the run**, exactly like the stop button: one `/ai/stop`, the
   composer comes back. On an idle conversation Esc stops nothing.
3. **ArrowUp / ArrowDown recall this conversation's prompts**, newest first, and
   give the unsent draft back after the newest one. A multi-line — including
   soft-wrapped — draft keeps its arrow key for the caret.

Source of truth: `workspace/web/components/chat.js` (`ask`, `stopRun`, the window
`keydown`, `historyRecord` / `historySeed` / `historyUp` / `historyDown` /
`caretVisualLine`, and the `keydown` on `.ai-input-field`). All three are
keystrokes over a live textarea, so the case runs through a real browser
(`ego-browser`) against the real component, served the way `serve-web` serves it.

A canned provider is what makes it deterministic: **the run has to still be in
flight when the second Enter and the Esc arrive**, and no real model can be told
to take exactly that long. The fixture answers the ai endpoints in the shape of
`contracts/ai-stream.yaml`, holds a "hold …" prompt open for six seconds, and
records what the frontend sent so the test can read it back through `/seen`. The
frontend still runs its own path: real keys, real clicks, real `/ai/ask` and
`/ai/stop` over the wire.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"
PORT=9040

# Reclaim the previous run's fixture before writing this one's: it binds the same
# port, so a leftover would keep answering with the old script.
pkill -f "chat-composer-fake" 2>/dev/null || true
sleep 1

# The fixture is not part of the system: it scripts the run, serves the real
# component out of workspace/web, and records what the frontend sent. Kept in
# /tmp — outside the project — so this case stays desp.yaml + TEST.md.
cat > /tmp/chat-composer-fake.go <<'GO'
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

// The whole fixture state: the event log a stream replays from `since`, the
// subscribers a live run is pushed to, and what the frontend actually sent. The
// last part is read back through /seen — "did the prompt leave while the run was
// still in flight" is not visible in the DOM.
var (
	mu      sync.Mutex
	seq     int
	events  []m
	subs    = map[chan m]bool{}
	asks    []string
	stops   int
	streams int
	running bool
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

// cors answers the preflight and lets the probe page talk to this fixture
// whatever host it resolved: the page and the addresses in /config.js share an
// origin, but a request typed as 127.0.0.1 where the page says localhost does not.
func cors(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	return false
}

// field pulls one flat `key: value` out of the yaml body the frontend sends.
func field(body, key string) string {
	for _, line := range strings.Split(body, "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), key+":"); ok {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// promptText pulls the text of the first text block. js-yaml dumps a prompt with
// spaces as a block scalar (`text: |-` and the prompt on the next, deeper-indented
// line), so a flat key/value scan is not enough. This case only ever sends a
// one-line prompt plus a plain steer, so a dedent of the block's lines is all it
// needs.
func promptText(body string) string {
	lines := strings.Split(body, "\n")
	for i, line := range lines {
		v, ok := strings.CutPrefix(strings.TrimSpace(line), "text:")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		if v != "|" && v != "|-" && v != ">" && v != ">-" {
			return v
		}
		var out []string
		for _, next := range lines[i+1:] {
			indent := len(next) - len(strings.TrimLeft(next, " "))
			if strings.TrimSpace(next) != "" && indent < 2 {
				break
			}
			out = append(out, strings.TrimLeft(next, " "))
		}
		return strings.TrimSpace(strings.Join(out, "\n"))
	}
	return ""
}

// say is one assistant paragraph, the way pi streams it: the text block opens,
// the deltas arrive, the message ends.
func say(delta string) []m {
	return []m{
		{"type": "turn_start"},
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_start"}},
		{"type": "message_update", "assistantMessageEvent": m{"type": "text_delta", "delta": delta}},
		{"type": "message_end", "message": m{"role": "assistant"}},
	}
}

const page = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<title>composer probe</title>
<link rel="stylesheet" href="/vendor/highlight.css">
<link rel="stylesheet" href="/theme.css">
<style>
  /* The component is :host { height: 100% }, so the page owes it a height. */
  html, body { margin: 0; height: 100%; }
  body { background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; }
  engineer-chat { display: block; height: 100vh; }
</style>
<script type="module" src="/components/chat.js"></script>
</head>
<body><engineer-chat session="live-1"></engineer-chat></body>
</html>`

func main() {
	addr, assets := os.Args[1], os.Args[2]

	http.HandleFunc("/ai/ask", func(w http.ResponseWriter, r *http.Request) {
		if cors(w, r) {
			return
		}
		b, _ := io.ReadAll(r.Body)
		text := promptText(string(b))
		mu.Lock()
		asks = append(asks, text)
		steer := running
		if !steer {
			running = true
		}
		mu.Unlock()
		io.WriteString(w, "sessionId: live-1\n")
		// A run streams *after* the call returns, as a service with a model behind
		// it does: the frontend opens its stream between the response and the first
		// event. running is already true here, so that stream stays open.
		if steer {
			// A prompt that arrives mid-run joins the run: its own paragraph, and no
			// settle — the run it joined owns the terminal agent_settled.
			go func() {
				time.Sleep(150 * time.Millisecond)
				emit(say("STEER:" + text)...)
			}()
			return
		}
		hold := 300 * time.Millisecond
		if strings.HasPrefix(text, "hold") {
			hold = 6 * time.Second // long enough to send, press Esc, and look around
		}
		go func() {
			time.Sleep(150 * time.Millisecond)
			emit(append([]m{{"type": "agent_start"}}, say("RUN:"+text)...)...)
			time.Sleep(hold)
			mu.Lock()
			was := running
			running = false
			mu.Unlock()
			if !was {
				return // a stop already settled this run
			}
			emit(m{"type": "agent_settled"})
		}()
	})

	// A stop aborts the run: the agent settles and the stream closes.
	http.HandleFunc("/ai/stop", func(w http.ResponseWriter, r *http.Request) {
		if cors(w, r) {
			return
		}
		io.Copy(io.Discard, r.Body)
		mu.Lock()
		stops++
		was := running
		running = false
		mu.Unlock()
		io.WriteString(w, "sessionId: live-1\n")
		if was {
			go func() {
				time.Sleep(120 * time.Millisecond)
				emit(m{"type": "agent_settled"})
			}()
		}
	})

	// The subscription is per conversation and `since` is its watermark. Idle and
	// caught up, it closes at once — the component's first read is a watermark-only
	// stream it awaits before its first ask, so a fixture that held it open would
	// hang the composer instead of testing it.
	http.HandleFunc("/ai/stream", func(w http.ResponseWriter, r *http.Request) {
		if cors(w, r) {
			return
		}
		b, _ := io.ReadAll(r.Body)
		var since int
		fmt.Sscanf(field(string(b), "since"), "%d", &since)
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		flusher, _ := w.(http.Flusher)
		c := make(chan m, 256)
		mu.Lock()
		streams++
		for _, ev := range events {
			if ev["seq"].(int) > since {
				c <- ev
			}
		}
		idle := !running && len(c) == 0
		if !idle {
			subs[c] = true
		}
		mu.Unlock()
		if idle {
			return
		}
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
	})

	// What the frontend sent us, for the test to assert on.
	http.HandleFunc("/seen", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		out := m{"asks": asks, "stops": stops, "streams": streams}
		mu.Unlock()
		b, _ := json.Marshal(out)
		w.Header().Set("Content-Type", "application/yaml")
		w.Write(b)
	})

	// The addresses the component imports, pointed back at this fixture — same host
	// the page was loaded from, so the page talks to it as its own origin.
	http.HandleFunc("/config.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		base := "http://" + r.Host
		fmt.Fprintf(w,
			"export const ENGINEER = {ai:%q, log:%q, static:%q};\nexport default ENGINEER;\n",
			base, base, base)
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, page)
	})
	// The real component, byte for byte what serve-web serves.
	http.Handle("/components/", http.FileServer(http.Dir(assets)))
	http.Handle("/vendor/", http.FileServer(http.Dir(assets)))
	http.HandleFunc("/theme.css", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, assets+"/theme.css")
	})

	log.Printf("chat-composer fixture: http://%s (assets %s)", addr, assets)
	log.Fatal(http.ListenAndServe(addr, nil))
}
GO

go build -o /tmp/chat-composer-fake /tmp/chat-composer-fake.go
/tmp/chat-composer-fake "127.0.0.1:$PORT" "$ROOTDIR/workspace/web" >/tmp/chat-composer-fake.log 2>&1 &
sleep 1

curl -s "http://localhost:$PORT/seen"
echo
curl -s "http://localhost:$PORT/components/chat.css" | head -3
```

Expected on startup: `{"asks":null,"stops":0,"streams":0}` and the first lines of
`chat.css` — the fixture is up and it is serving the project's real component.

## Run

```bash
WEB_URL=http://localhost:9040 ego-browser nodejs <<'EOF'
const WEB = "http://localhost:9040";

const space = await taskSpace("core-web-chat-composer");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

// The composer lives in the component's shadow root; every read and every key
// goes through it. `probe` is the one observation the checks use.
const probe = () => page.evaluate(() => {
  const r = document.querySelector("engineer-chat").shadowRoot;
  const t = r.querySelector(".ai-input-field");
  return {
    value: t.value,
    start: t.selectionStart,
    end: t.selectionEnd,
    stopHidden: r.querySelector(".ai-stop").hidden,
    sendDisabled: r.querySelector(".ai-send").disabled,
    users: r.querySelectorAll(".ai-msg.ai-user").length,
    text: r.querySelector(".ai-messages").textContent,
  };
});
const seen = async () => JSON.parse((await page.fetch(`${WEB}/seen`)).body);
const focus = () => page.evaluate(() => {
  document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-input-field").focus();
});
// fill: set the draft without typing it (a caret at the end, the way a draft is).
const fill = (v) => page.evaluate((v) => {
  const t = document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-input-field");
  t.value = v;
  t.setSelectionRange(v.length, v.length);
  t.dispatchEvent(new Event("input", { bubbles: true }));
}, v);
const type = async (text) => { await focus(); await page.keyboard.type(text); };
const press = async (key) => { await focus(); await page.keyboard.press(key); };
const submit = async (text) => { await type(text); await page.keyboard.press("Enter"); };
// The component's own "a run is in flight" signal is the stop button.
const stopShown = () => page.waitForFunction(
  () => !document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-stop").hidden,
  undefined, { timeout: 15_000 });
const stopGone = () => page.waitForFunction(
  () => document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-stop").hidden,
  undefined, { timeout: 20_000 });
const shown = (text) => page.waitForFunction(
  (t) => document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-messages")
    .textContent.includes(t),
  text, { timeout: 15_000 });
const userTurns = (n) => page.waitForFunction(
  (c) => document.querySelector("engineer-chat").shadowRoot.querySelectorAll(".ai-msg.ai-user").length === c,
  n, { timeout: 15_000 });

await page.goto(`${WEB}/`);
await page.waitForFunction(
  () => !!document.querySelector("engineer-chat")?.shadowRoot?.querySelector(".ai-input-field"),
  undefined, { timeout: 15_000 });

// ---------- 1. sending while a run is in flight steers, it does not wait ----------

await submit("hold one");
await stopShown();
check("a run in flight offers stop", !(await probe()).stopHidden, await probe());
await shown("RUN:hold one");

await submit("steered two");
await userTurns(2);
const midRun = await probe();
const afterSteer = await seen();
check("a prompt sent mid-run leaves the composer", midRun.value === "", midRun);
check("a prompt sent mid-run is drawn as a user turn, not swallowed",
  midRun.users === 2, { userTurns: midRun.users });
check("the composer stays usable mid-run: send is not disabled, stop is still offered",
  midRun.sendDisabled === false && midRun.stopHidden === false,
  { sendDisabled: midRun.sendDisabled, stopHidden: midRun.stopHidden });
check("the second prompt reached /ai/ask while the first run was still in flight",
  afterSteer.asks.length === 2 && afterSteer.asks[1] === "steered two" &&
  afterSteer.stops === 0, afterSteer);
await shown("STEER:steered two");
check("the steered prompt came back as its own paragraph",
  (await probe()).text.includes("STEER:steered two"));
await stopGone();
check("the run settles on its own after the steer", (await probe()).sendDisabled === false);

// ---------- 2. Esc stops the run, like the stop button ----------

await submit("hold two");
await stopShown();
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const afterEsc = await seen();
const stopped = await probe();
check("Esc put one /ai/stop on the wire", afterEsc.stops === 1, afterEsc);
check("Esc hands the composer back: stop is gone, nothing is dead",
  stopped.stopHidden === true && stopped.sendDisabled === false, stopped);

// ---------- 3. Esc on an idle conversation stops nothing ----------

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Esc on an idle conversation stops nothing", (await seen()).stops === 1, await seen());

// ---------- 4. ArrowUp / ArrowDown recall this conversation's prompts ----------
// Sent so far, oldest first: "hold one", "steered two", "hold two".

await press("ArrowUp");
let v = await probe();
check("ArrowUp recalls the newest prompt", v.value === "hold two", v);
await press("ArrowUp");
check("ArrowUp again walks back", (await probe()).value === "steered two", await probe());
await press("ArrowUp");
check("ArrowUp reaches the oldest prompt", (await probe()).value === "hold one", await probe());
await press("ArrowUp");
v = await probe();
check("ArrowUp at the oldest stops there", v.value === "hold one", v);
check("a recalled prompt puts the caret at the end",
  v.start === v.end && v.end === "hold one".length, { start: v.start, end: v.end });

await press("ArrowDown");
check("ArrowDown walks forward", (await probe()).value === "steered two", await probe());
await press("ArrowDown");
await press("ArrowDown");
check("ArrowDown past the newest returns the (empty) draft", (await probe()).value === "", await probe());

// ---------- 5. an unsent draft comes back ----------

await fill("an unsent draft");
await press("ArrowUp");
check("ArrowUp replaces the draft with the newest prompt",
  (await probe()).value === "hold two", await probe());
await press("ArrowDown");
check("ArrowDown restores the unsent draft", (await probe()).value === "an unsent draft", await probe());
await fill("");

// ---------- 6. editing a recalled prompt leaves browsing ----------

await press("ArrowUp");
await type(" edited");
const edited = await probe();
await press("ArrowDown");
check("editing a recalled prompt leaves history browsing",
  edited.value === "hold two edited" && (await probe()).value === "hold two edited",
  { edited: edited.value, afterDown: (await probe()).value });
await fill("");

// ---------- 7. a multi-line draft keeps its arrow key for the caret ----------

await fill("line one\nline two");
const multiBefore = await probe();
await press("ArrowUp");
const multiAfter = await probe();
check("on a multi-line draft ArrowUp only moves the caret",
  multiAfter.value === "line one\nline two" && multiAfter.start < multiBefore.start,
  { before: multiBefore.start, after: multiAfter.start, value: multiAfter.value });

// ---------- 8. the same holds for a soft-wrapped long line ----------

await fill("the quick brown fox jumps over the lazy dog ".repeat(8));
const wrapped = await page.evaluate(() => {
  const t = document.querySelector("engineer-chat").shadowRoot.querySelector(".ai-input-field");
  const lh = parseFloat(getComputedStyle(t).lineHeight) || 18;
  return { value: t.value, lines: Math.round(t.scrollHeight / lh) };
});
await press("ArrowUp");
const wrappedAfter = await probe();
check("a soft-wrapped draft counts as multi-line (ArrowUp does not recall)",
  wrapped.lines >= 2 && wrappedAfter.value === wrapped.value,
  { renderedLines: wrapped.lines, after: wrappedAfter.value.slice(0, 24) });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true`. Exit code `0`.

What each block is proving, in the words of the report that started this case:

- **block 1** — a prompt typed while a run is in flight leaves the composer, is
  drawn as a user turn, and reaches `/ai/ask` *before* the first run settles
  (`stops == 0`, two asks); the service's answer to it (`STEER:…`) shows up in
  the same conversation, and the run still settles on its own.
- **block 2** — one `/ai/stop`, stop gone, send usable: Esc is the stop button.
- **block 3** — an idle Esc puts nothing on the wire.
- **blocks 4–6** — newest first, oldest last, caret at the end, forward again,
  draft given back, editing leaves browsing.
- **blocks 7–8** — a hard-wrapped and a soft-wrapped draft both keep ArrowUp for
  the caret, because the rule is the *rendered* line and not `\n`.

Not covered here (checked by hand): a prompt that carried a pasted image is not
recorded, and the arrows do not recall while an image is staged in the composer —
both need a real clipboard image, which this case does not paste.

## Teardown

```bash
pkill -f "chat-composer-fake"
```
