package blueprint

// The ai node: a blueprint's conversation, kept by the runtime.
//
// A page that wants an agent writes one node,
//
//	<script type="blueprint/ai">…the agent's system prompt…</script>
//
// and nothing else of the backend. The page talks to it with two event names, and
// both are request/reply — the page asks, the runtime answers it alone:
//
//	page → runtime   ai.info {select?}       what this blueprint's conversations are, and
//	                                         the state of the current one. With `select`, that
//	                                         conversation becomes the current one first
//	                 ai.request {id, path, body}
//	                                         one call to the ai service, by its own path:
//	                                         /ai/new, /ai/ask, /ai/stream, /ai/stop,
//	                                         /ai/resume, /ai/delete. `id` is the page's own
//	                                         correlation id
//	runtime → page   ai.info {sessionId, sessions, lastSeq, active, messages}
//	                                         sessionId is "" when no conversation exists yet:
//	                                         opening a page raises nothing
//	                 ai.response {id, status, body}       a call's answer
//	                 ai.response {id, event}              one event of a /ai/stream call
//	                 ai.response {id, done: true}         that stream ended
//	                 ai.response {id, error}              the call failed
//
// The runtime does exactly two things to a request: it fills in the two values a
// page cannot know (on /ai/new: `cwd`, the folder the user associated with this
// blueprint, and `system`, the node's text plus where things are; on every other
// path: `id`, the current conversation), and it keeps the blueprint's list of
// conversations in its own sqlite (table bp_ai, one row each, `cur` on the current
// one). Everything else travels as the page wrote it.
//
// The records are storage's, by session id: a conversation that is not current is
// still there, and ai.info {select} draws it again.

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// AINode is the parsed `blueprint/ai` block.
type AINode struct {
	Prompt string
}

// aiSchema is the one table the runtime keeps for the node: a row per conversation,
// `cur` on the current one. A conversation is added when it is created (`ai.reset`,
// or the first `ai.ask` with none), never removed here — deleting it would lose the
// only pointer to records storage still has.
const aiSchema = `CREATE TABLE IF NOT EXISTS bp_ai (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  at    TEXT NOT NULL DEFAULT (datetime('now')),
  cur   INTEGER NOT NULL DEFAULT 0
)`

// aiSchemaOld is the table the node used before it kept more than one conversation.
// It is migrated once, in place, so an existing conversation is not lost.
func (a *aiRuntime) migrate() {
	rows, err := a.rt.store.Query(`SELECT name FROM pragma_table_info('bp_ai')`, nil)
	if err != nil {
		return // no table yet: aiSchema made what is there
	}
	hasKey := false
	for _, row := range rows {
		if name, _ := row["name"].(string); name == "k" {
			hasKey = true
		}
	}
	if !hasKey {
		return
	}
	old, err := a.rt.store.Query(`SELECT v FROM bp_ai WHERE k = 'session'`, nil)
	if err != nil || len(old) == 0 {
		return
	}
	id, _ := old[0]["v"].(string)
	if id == "" {
		return
	}
	if err := a.rt.store.Exec(`DROP TABLE bp_ai`, nil); err != nil {
		return
	}
	if err := a.rt.store.Apply([]string{aiSchema}); err != nil {
		return
	}
	_ = a.rt.store.Exec(`INSERT OR REPLACE INTO bp_ai(id, cur) VALUES(?, 1)`, []any{id})
}

// aiClient has no overall timeout: a stream stays open for as long as a run does.
// Plain calls bound themselves with a context.
var aiClient = &http.Client{}

type aiRuntime struct {
	rt     *Runtime
	prompt string
	ctx    context.Context
	cancel context.CancelFunc
}

func newAIRuntime(rt *Runtime, node *AINode) *aiRuntime {
	ctx, cancel := context.WithCancel(context.Background())
	return &aiRuntime{rt: rt, prompt: node.Prompt, ctx: ctx, cancel: cancel}
}

func (a *aiRuntime) close() { a.cancel() }

// handle takes one event the page emitted. It reports whether the event was the
// node's: those are not echoed back and no flow listens for them.
func (a *aiRuntime) handle(ev Event) bool {
	switch ev.Type {
	case "ai.info":
		go a.info(ev.Data)
	case "ai.request":
		go a.request(ev.Data)
	default:
		return false
	}
	return true
}

var errNoFolder = fmt.Errorf("no folder is associated with this blueprint yet")

// ---------- the conversations ----------

// currentID is the conversation the page is on, or "" when there is none yet.
func (a *aiRuntime) currentID() string {
	rows, err := a.rt.store.Query(`SELECT id FROM bp_ai WHERE cur = 1`, nil)
	if err != nil || len(rows) == 0 {
		return ""
	}
	id, _ := rows[0]["id"].(string)
	return id
}

// sessions is the list the page draws: every conversation of this blueprint,
// oldest first, with the current one marked.
func (a *aiRuntime) sessions() []any {
	rows, err := a.rt.store.Query(`SELECT id, title, at, cur FROM bp_ai ORDER BY at`, nil)
	if err != nil {
		return []any{}
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"id": row["id"], "title": row["title"], "at": row["at"],
			"current": toInt64(row["cur"]) == 1,
		})
	}
	return out
}

// keepSession records a conversation the page just raised with /ai/new: it becomes
// the current one, and the old ones stay — a new conversation is not a delete.
func (a *aiRuntime) keepSession(id string) {
	if id == "" {
		return
	}
	if err := a.rt.store.Exec(`UPDATE bp_ai SET cur = 0`, nil); err != nil {
		return
	}
	_ = a.rt.store.Exec(`INSERT OR REPLACE INTO bp_ai(id, cur) VALUES(?, 1)`, []any{id})
}

// useSession makes an already known conversation the current one.
func (a *aiRuntime) useSession(id string) error {
	rows, err := a.rt.store.Query(`SELECT id FROM bp_ai WHERE id = ?`, []any{id})
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return fmt.Errorf("no conversation %q in this blueprint", id)
	}
	if err := a.rt.store.Exec(`UPDATE bp_ai SET cur = 0`, nil); err != nil {
		return err
	}
	return a.rt.store.Exec(`UPDATE bp_ai SET cur = 1 WHERE id = ?`, []any{id})
}

// system is the node's text, then where things are — what the agent cannot find out
// for itself. A page that passes its own `system` to /ai/new still gets this, and
// keeps its own text after it.
func (a *aiRuntime) system(folder, extra string) string {
	var b strings.Builder
	b.WriteString(a.prompt)
	b.WriteString("\n\n## Where things are\n\n")
	fmt.Fprintf(&b, "- **Home position**: %s — Engineer's own folder; its data, including `data/models.yaml`, is in `data/` under it.\n", a.rt.opts.Home)
	b.WriteString("- **Runtime endpoints**: the services you may call.\n")
	fmt.Fprintf(&b, "  - storage: %s\n", a.rt.opts.Storage)
	fmt.Fprintf(&b, "  - ai: %s\n", a.rt.opts.AI)
	fmt.Fprintf(&b, "- **Working folder**: %s\n", folder)
	if strings.TrimSpace(extra) != "" {
		b.WriteString("\n")
		b.WriteString(extra)
	}
	return b.String()
}

// ---------- ai.info ----------

// info answers ai.info: what conversations this blueprint has, and the state of the
// current one — its records, the watermark of its run and whether one is in flight.
// It raises nothing: a page that is merely opened leaves no empty conversation
// behind.
func (a *aiRuntime) info(data any) {
	id := a.currentID()
	// The page's own correlation id goes back with the answer, like every other
	// reply: without it a page cannot tell which question an answer belongs to.
	corr := ""
	if m, ok := data.(map[string]any); ok {
		corr, _ = m["id"].(string)
	}
	if m, ok := data.(map[string]any); ok {
		// Asking for a conversation a page is already on still redraws it: the page
		// asks because its view may be empty, not because the row changed.
		if want, _ := m["select"].(string); want != "" && want == id {
			if err := a.useSession(want); err != nil {
				a.reply("ai.info", map[string]any{
					"id": corr, "sessionId": id, "sessions": a.sessions(), "error": err.Error(),
				})
				return
			}
			id = want
			// The reply says which conversation was asked for — a page that merely
			// refreshes the list (no `select`) leaves the view where it is — and
			// carries that conversation, so it can be drawn without a second ask.
			out := map[string]any{
				"id": corr, "sessionId": id, "select": want, "sessions": a.sessions(),
			}
			lastSeq, active, messages := a.state(id)
			out["lastSeq"] = lastSeq
			out["active"] = active
			out["messages"] = messages
			a.reply("ai.info", out)
			return
		}
	}
	out := map[string]any{"id": corr, "sessionId": id, "sessions": a.sessions()}
	if id != "" {
		lastSeq, active, messages := a.state(id)
		out["lastSeq"] = lastSeq
		out["active"] = active
		out["messages"] = messages
	}
	a.reply("ai.info", out)
}

// state is one conversation as the page draws it: where its last event was, whether
// a run is in flight, and the records storage keeps for it.
func (a *aiRuntime) state(id string) (int64, bool, []any) {
	lastSeq, active := int64(0), false
	if out, status, err := a.call("/ai/resume", map[string]any{"id": id}); err == nil && status == http.StatusOK {
		lastSeq = toInt64(out["lastSeq"])
		active, _ = out["active"].(bool)
	}
	messages := []any{}
	out, status, err := a.callStorage("/log/session/messages", map[string]any{"sessionId": id})
	if err == nil && status == http.StatusOK {
		if list, ok := out["messages"].([]any); ok {
			messages = list
		}
	}
	return lastSeq, active, messages
}

// reply puts an answer on the bus. A reply carries the asker's own correlation id,
// so a page ignores every answer that is not to a question it asked — which is also
// what lets two tabs of one blueprint share the node.
func (a *aiRuntime) reply(typ string, data any) {
	a.rt.pushEvent(Event{Type: typ, Source: "ai", Data: data})
}

// ---------- ai.request ----------

// request carries one call to the ai service. The runtime fills in the two values a
// page cannot know and forwards the rest untouched.
func (a *aiRuntime) request(data any) {
	m, _ := data.(map[string]any)
	corr, _ := m["id"].(string)
	path, _ := m["path"].(string)
	body := map[string]any{}
	if in, ok := m["body"].(map[string]any); ok {
		for k, v := range in {
			body[k] = v
		}
	}
	if !strings.HasPrefix(path, "/ai/") {
		a.reply("ai.response", map[string]any{"id": corr, "error": fmt.Sprintf("not an ai path: %q", path)})
		return
	}

	switch path {
	case "/ai/new":
		folder := a.rt.opts.Folder(a.rt.slug)
		if folder == "" {
			a.reply("ai.response", map[string]any{"id": corr, "error": errNoFolder.Error()})
			return
		}
		extra, _ := body["system"].(string)
		body["cwd"] = folder
		body["system"] = a.system(folder, extra)
	default:
		if id := a.currentID(); id != "" {
			if _, given := body["id"]; !given {
				body["id"] = id
			}
		}
	}

	if path == "/ai/stream" {
		a.stream(corr, body)
		return
	}

	out, status, err := a.call(path, body)
	if err != nil {
		a.reply("ai.response", map[string]any{"id": corr, "error": err.Error()})
		return
	}
	switch path {
	case "/ai/new":
		if status == http.StatusOK {
			if id, _ := out["sessionId"].(string); id != "" {
				a.keepSession(id)
			}
		}
	case "/ai/delete":
		// The records go with it, so the pointer goes too.
		if status == http.StatusOK {
			if id, _ := body["id"].(string); id != "" {
				_ = a.rt.store.Exec(`DELETE FROM bp_ai WHERE id = ?`, []any{id})
			}
		}
	}
	a.reply("ai.response", map[string]any{"id": corr, "status": status, "body": out})
}

// stream forwards one /ai/stream call: every frame as one event, then done. The
// frames are parsed here so a page can draw them without a YAML parser of its own.
func (a *aiRuntime) stream(corr string, body map[string]any) {
	raw, err := json.Marshal(body)
	if err != nil {
		a.reply("ai.response", map[string]any{"id": corr, "error": err.Error()})
		return
	}
	ctx, cancel := context.WithCancel(a.ctx)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(a.rt.opts.AI, "/")+"/ai/stream", bytes.NewReader(raw))
	if err != nil {
		a.reply("ai.response", map[string]any{"id": corr, "error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/yaml")
	res, err := aiClient.Do(req)
	if err != nil {
		a.reply("ai.response", map[string]any{"id": corr, "error": err.Error()})
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		text, _ := io.ReadAll(io.LimitReader(res.Body, 1<<16))
		a.reply("ai.response", map[string]any{
			"id": corr, "status": res.StatusCode, "error": strings.TrimSpace(string(text)),
		})
		return
	}

	reader := bufio.NewReaderSize(res.Body, 64*1024)
	var lines []string
	for {
		line, readErr := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if line == "" && readErr == nil {
			a.frame(corr, lines)
			lines = lines[:0]
			continue
		}
		if strings.HasPrefix(line, "data:") {
			lines = append(lines, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
		if readErr != nil {
			if len(lines) > 0 {
				a.frame(corr, lines)
			}
			break
		}
	}
	a.reply("ai.response", map[string]any{"id": corr, "done": true})
}

// frame parses one SSE frame and hands it to the page as one event.
func (a *aiRuntime) frame(corr string, lines []string) {
	if len(lines) == 0 {
		return
	}
	var ev map[string]any
	if err := yaml.Unmarshal([]byte(strings.Join(lines, "\n")), &ev); err != nil || ev == nil {
		return
	}
	// A conversation's display name arrives on its stream; it is what the list
	// draws, so it is kept on the row.
	if ev["type"] == "session_title" {
		if title, _ := ev["title"].(string); title != "" {
			if id := a.currentID(); id != "" {
				_ = a.rt.store.Exec(`UPDATE bp_ai SET title = ? WHERE id = ?`, []any{title, id})
			}
		}
	}
	a.reply("ai.response", map[string]any{"id": corr, "event": ev})
}

func (a *aiRuntime) call(path string, body map[string]any) (map[string]any, int, error) {
	return a.post(strings.TrimSuffix(a.rt.opts.AI, "/")+path, body)
}

func (a *aiRuntime) callStorage(path string, body map[string]any) (map[string]any, int, error) {
	return a.post(strings.TrimSuffix(a.rt.opts.Storage, "/")+path, body)
}

func (a *aiRuntime) post(url string, body map[string]any) (map[string]any, int, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/yaml")
	res, err := aiClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()
	text, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return nil, res.StatusCode, err
	}
	var out map[string]any
	_ = yaml.Unmarshal(text, &out)
	if out == nil {
		out = map[string]any{}
	}
	return out, res.StatusCode, nil
}

func aiMessage(out map[string]any, status int) string {
	if e, ok := out["error"].(map[string]any); ok {
		if m, _ := e["message"].(string); m != "" {
			return m
		}
	}
	return fmt.Sprintf("HTTP %d", status)
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int:
		return int64(n)
	case int64:
		return n
	case uint64:
		return int64(n)
	case float64:
		return int64(n)
	}
	return 0
}
