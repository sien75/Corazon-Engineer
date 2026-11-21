package blueprint

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Options is what a runtime needs from the process around it. None of it has a
// default: a service that invented a data home would write a database nobody
// chose.
type Options struct {
	Home       string // data home; every blueprint's sqlite is under <Home>/blueprints
	Blueprints string // the folder of <slug>.html files
	Cwd        string // folder an `ai` step's agent works in, unless the step says otherwise
	AI         string // ai service base url
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

// Runtime is one loaded blueprint: its page, its database, and the bus its page
// is attached to. Loading is the only place a blueprint's code takes effect —
// there is no hot reload, so what a page shows is what was read when it was
// opened.
type Runtime struct {
	opts    Options
	page    *Page
	store   *Store
	workDir string

	mu      sync.Mutex
	clients map[*Client]bool
	watched map[string]bool
	closed  bool
}

// Client is one open event stream: the browser's page, and nothing else. Its
// channel carries finished JSON messages; the stream writes them as SSE frames.
type Client struct {
	ch chan []byte
}

// Messages is the stream a handler writes out.
func (c *Client) Messages() <-chan []byte { return c.ch }

// ID and Title are the two things a page's chrome needs.
func (rt *Runtime) ID() string    { return rt.page.ID }
func (rt *Runtime) Title() string { return rt.page.Title }

// HTML is the document served to the browser: the blueprint with every backend
// block cut out. The page runs only what it was written to run.
func (rt *Runtime) HTML() []byte { return rt.page.HTML }

func newRuntime(opts Options, page *Page) (*Runtime, error) {
	store, err := openStore(opts.Home, page.ID)
	if err != nil {
		return nil, err
	}
	if err := store.Apply(page.SQL); err != nil {
		store.Close()
		return nil, err
	}
	work := filepath.Join(opts.Home, "blueprints", ".work", page.ID)
	if err := os.MkdirAll(work, 0o755); err != nil {
		store.Close()
		return nil, err
	}
	rt := &Runtime{
		opts:    opts,
		page:    page,
		store:   store,
		workDir: work,
		clients: map[*Client]bool{},
		watched: map[string]bool{},
	}
	store.afterWrite(rt.pushChanges)
	return rt, nil
}

// Subscribe attaches one page to the bus. The buffer is bounded: a page that
// cannot keep up loses pushes rather than stalling the flow that produced them.
func (rt *Runtime) Subscribe() (*Client, error) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.closed {
		return nil, fmt.Errorf("this blueprint was reloaded; reload the page")
	}
	c := &Client{ch: make(chan []byte, 128)}
	rt.clients[c] = true
	return c, nil
}

// Unsubscribe detaches a page and closes its channel, which ends the stream.
func (rt *Runtime) Unsubscribe(c *Client) {
	rt.mu.Lock()
	_, ok := rt.clients[c]
	delete(rt.clients, c)
	rt.mu.Unlock()
	if ok {
		close(c.ch)
	}
}

// Close ends the runtime: its store is released and every attached page is told
// the connection is over.
func (rt *Runtime) Close() {
	rt.mu.Lock()
	if rt.closed {
		rt.mu.Unlock()
		return
	}
	rt.closed = true
	clients := make([]*Client, 0, len(rt.clients))
	for c := range rt.clients {
		clients = append(clients, c)
	}
	rt.clients = map[*Client]bool{}
	rt.mu.Unlock()

	for _, c := range clients {
		close(c.ch)
	}
	rt.store.Close()
}

// broadcast writes one message to every attached page, dropping it for a page
// whose buffer is full.
func (rt *Runtime) broadcast(msg []byte) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.closed {
		return
	}
	for c := range rt.clients {
		select {
		case c.ch <- msg:
		default:
		}
	}
}

// pushEvent puts one event on the bus: the page sees it, and every rule that
// listens for its type starts.
func (rt *Runtime) pushEvent(ev Event) {
	if ev.Time == "" {
		ev.Time = now()
	}
	msg, err := json.Marshal(map[string]any{
		"op":     "event",
		"type":   ev.Type,
		"source": ev.Source,
		"data":   ev.Data,
		"time":   ev.Time,
	})
	if err != nil {
		return
	}
	rt.broadcast(msg)
}

// pushChanges re-reads every watched table and sends it. A page always redraws
// from a full answer: a diff would have to guess what the page already had.
func (rt *Runtime) pushChanges() {
	rt.mu.Lock()
	tables := make([]string, 0, len(rt.watched))
	for t := range rt.watched {
		tables = append(tables, t)
	}
	rt.mu.Unlock()

	for _, table := range tables {
		rows, err := rt.store.Rows(table)
		if err != nil {
			continue
		}
		msg, err := json.Marshal(map[string]any{"op": "change", "table": table, "rows": rows})
		if err != nil {
			continue
		}
		rt.broadcast(msg)
	}
}

// Emit starts a flow from outside: a page's bp.emit, or a flow's own emit step.
func (rt *Runtime) Emit(ev Event) { rt.emit(ev, 0) }

// maxHops stops a flow that emits the event it listens for. Nothing else in a
// blueprint can loop on the bus, so one counter is enough to keep a mistake from
// turning into a runaway.
const maxHops = 16

func (rt *Runtime) emit(ev Event, hops int) {
	rt.pushEvent(ev)
	if hops > maxHops {
		rt.pushEvent(Event{Type: "flow.error", Source: "flow", Data: map[string]any{
			"message": fmt.Sprintf("stopped after %d nested emits — does a flow emit the event it listens for?", maxHops),
		}})
		return
	}
	for _, rule := range rt.page.Rules {
		if rule.On != ev.Type {
			continue
		}
		go rt.runRule(rule, ev, hops)
	}
}

// runRule runs one rule's steps in order. Each step's output is the next step's
// input unless `with` says otherwise, and a step with an `id` is addressable as
// `${{ steps.<id>.output }}` for the rest of the rule.
func (rt *Runtime) runRule(rule FlowRule, ev Event, hops int) {
	steps := map[string]any{}
	var last any

	for _, step := range rule.Steps {
		input := last
		if step.With != nil {
			input = resolve(step.With, ev, steps)
		}

		out, err := rt.runStep(step, input, ev, hops)
		if err != nil {
			rt.pushEvent(Event{Type: "flow.error", Source: "flow", Data: map[string]any{
				"message": err.Error(),
				"rule":    rule.On,
				"step":    stepLabel(step),
			}})
			return
		}
		if step.ID != "" {
			steps[step.ID] = out
		}
		last = out
	}
}

func (rt *Runtime) runStep(step Step, input any, ev Event, hops int) (any, error) {
	switch {
	case step.Run != "":
		return rt.execScript(rt.page.Scripts[step.Run], input)

	case step.SQL != "":
		params, err := paramsOf(input)
		if err != nil {
			return nil, err
		}
		if isRead(step.SQL) {
			return rt.store.Query(step.SQL, params)
		}
		if err := rt.store.Exec(step.SQL, params); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, nil

	case step.Emit != "":
		rt.emit(Event{Type: step.Emit, Source: "flow", Data: input}, hops+1)
		return input, nil

	case step.AI != nil:
		return rt.runAI(input)

	}
	return nil, fmt.Errorf("step does nothing")
}

func stepLabel(step Step) string {
	switch {
	case step.ID != "":
		return step.ID
	case step.Run != "":
		return "run " + step.Run
	case step.SQL != "":
		return "sql"
	case step.Emit != "":
		return "emit " + step.Emit
	case step.AI != nil:
		return "ai"
	}
	return "step"
}

// ---------- the page's own channel ----------

// Op is one request from a page: emit an event, watch a table, or run a query.
// It answers synchronously; anything a flow produces arrives on the event stream
// instead.
type opRequest struct {
	Op     string `json:"op"`
	Type   string `json:"type"`
	Data   any    `json:"data"`
	Table  string `json:"table"`
	SQL    string `json:"sql"`
	Params any    `json:"params"`
}

func (rt *Runtime) Op(raw []byte) (any, error) {
	var req opRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil, fmt.Errorf("bad request: %w", err)
	}
	switch req.Op {
	case "emit":
		if strings.TrimSpace(req.Type) == "" {
			return nil, fmt.Errorf("emit needs a type")
		}
		rt.Emit(Event{Type: req.Type, Source: "ui", Data: req.Data})
		return map[string]any{"ok": true}, nil

	case "watch":
		if !tableShape.MatchString(req.Table) {
			return nil, fmt.Errorf("not a table: %q", req.Table)
		}
		rt.mu.Lock()
		rt.watched[req.Table] = true
		rt.mu.Unlock()
		rows, err := rt.store.Rows(req.Table)
		if err != nil {
			return nil, err
		}
		return map[string]any{"rows": rows}, nil

	case "unwatch":
		rt.mu.Lock()
		delete(rt.watched, req.Table)
		rt.mu.Unlock()
		return map[string]any{"ok": true}, nil

	case "sql":
		if strings.TrimSpace(req.SQL) == "" {
			return nil, fmt.Errorf("sql needs a statement")
		}
		if isRead(req.SQL) {
			rows, err := rt.store.Query(req.SQL, req.Params)
			if err != nil {
				return nil, err
			}
			return map[string]any{"rows": rows}, nil
		}
		if err := rt.store.Exec(req.SQL, req.Params); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, nil
	}
	return nil, fmt.Errorf("unknown op %q", req.Op)
}

// ---------- the ai step ----------

// runAI runs one `ai` step: a new conversation, one question, the answer to the
// end. The step's output is the reply text, which is the only part a page or a
// later script can act on; the deltas are pushed as `ai.delta` events while it
// streams, so a page can show progress.
func (rt *Runtime) runAI(input any) (any, error) {
	prompt, system, title, cwd := aiArgs(input)
	if strings.TrimSpace(prompt) == "" {
		return nil, fmt.Errorf("an `ai` step needs a prompt")
	}
	if rt.opts.AI == "" {
		return nil, fmt.Errorf("no ai service is configured for this blueprint")
	}
	if strings.TrimSpace(cwd) == "" {
		cwd = rt.opts.Cwd
	}
	base := strings.TrimSuffix(rt.opts.AI, "/")

	var created struct {
		SessionID string `json:"sessionId"`
	}
	if err := postYAML(base+"/ai/new", map[string]any{
		"cwd": cwd, "system": system, "title": title,
	}, &created); err != nil {
		return nil, fmt.Errorf("ai/new: %w", err)
	}
	if created.SessionID == "" {
		return nil, fmt.Errorf("ai/new answered no sessionId")
	}

	if err := postYAML(base+"/ai/ask", map[string]any{
		"id": created.SessionID,
		"blocks": []any{
			map[string]any{"type": "text", "text": prompt},
		},
	}, nil); err != nil {
		return nil, fmt.Errorf("ai/ask: %w", err)
	}

	text, err := rt.followAI(base, created.SessionID)
	if err != nil {
		return nil, err
	}
	return text, nil
}

// followAI reads the answer's event stream until the run settles, collecting the
// text as it goes.
func (rt *Runtime) followAI(base, sessionID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), scriptTimeout)
	defer cancel()

	body, _ := yaml.Marshal(map[string]any{"id": sessionID, "since": 0})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/ai/stream", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/yaml")
	res, err := (&http.Client{}).Do(req)
	if err != nil {
		return "", fmt.Errorf("ai/stream: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ai/stream: %s", res.Status)
	}

	var text strings.Builder
	var failure error
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	scanner.Split(splitFrames)
	for scanner.Scan() {
		ev := parseFrame(scanner.Text())
		switch ev["type"] {
		case "message_update":
			ae, _ := ev["assistantMessageEvent"].(map[string]any)
			if ae != nil && ae["type"] == "text_delta" {
				delta, _ := ae["delta"].(string)
				if delta != "" {
					text.WriteString(delta)
					rt.pushEvent(Event{Type: "ai.delta", Source: "ai", Data: map[string]any{"text": delta}})
				}
			}
		case "error":
			failure = fmt.Errorf("ai: %v", ev["error"])
		case "agent_settled":
			// The turn is over; the conversation is left behind on purpose.
			return text.String(), failure
		}
	}
	if err := scanner.Err(); err != nil {
		return text.String(), fmt.Errorf("ai/stream: %w", err)
	}
	return text.String(), failure
}

func aiArgs(with any) (prompt, system, title, cwd string) {
	switch v := with.(type) {
	case string:
		prompt = v
	case map[string]any:
		prompt, _ = v["prompt"].(string)
		system, _ = v["system"].(string)
		title, _ = v["title"].(string)
		cwd, _ = v["cwd"].(string)
	}
	return
}

func postYAML(url string, body any, out any) error {
	payload, err := yaml.Marshal(body)
	if err != nil {
		return err
	}
	res, err := (&http.Client{Timeout: scriptTimeout}).Post(url, "application/yaml", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var buf bytes.Buffer
		buf.ReadFrom(res.Body)
		return fmt.Errorf("%s: %s", res.Status, strings.TrimSpace(buf.String()))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// splitFrames cuts an SSE body into frames, which arrive separated by a blank
// line.
func splitFrames(data []byte, atEOF bool) (int, []byte, error) {
	if i := bytes.Index(data, []byte("\n\n")); i >= 0 {
		return i + 2, data[:i], nil
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

// parseFrame joins a frame's data: lines and reads them as one YAML document —
// the shape the ai stream contract promises.
func parseFrame(frame string) map[string]any {
	var lines []string
	for _, line := range strings.Split(frame, "\n") {
		if strings.HasPrefix(line, "data:") {
			lines = append(lines, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if len(lines) == 0 {
		return map[string]any{}
	}
	var ev map[string]any
	if err := yaml.Unmarshal([]byte(strings.Join(lines, "\n")), &ev); err != nil {
		return map[string]any{}
	}
	return ev
}

// ---------- the loaded set ----------

// Registry holds what is loaded. A blueprint is addressed by its file's slug, but
// filed by its own id: opening the page again reloads it, and the runtime that was
// there is shut down first.
type Registry struct {
	opts   Options
	mu     sync.Mutex
	bySlug map[string]*Runtime
	byID   map[string]*Runtime
}

func NewRegistry(opts Options) *Registry {
	return &Registry{opts: opts, bySlug: map[string]*Runtime{}, byID: map[string]*Runtime{}}
}

// File is one blueprint a reader can open.
type File struct {
	Slug  string
	Title string
}

// Files lists the folder's blueprints, by slug, in name order.
func (r *Registry) Files() ([]File, error) {
	entries, err := os.ReadDir(r.opts.Blueprints)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := []File{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".html") {
			continue
		}
		slug := strings.TrimSuffix(name, ".html")
		title := slug
		if src, err := os.ReadFile(filepath.Join(r.opts.Blueprints, name)); err == nil {
			if t := titleOf(string(src)); t != "" {
				title = t
			}
		}
		out = append(out, File{Slug: slug, Title: title})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out, nil
}

// Load reads a blueprint and makes it the live one for its id. Every open of the
// page goes through here: a blueprint is reloaded when it is opened, not while it
// is being watched.
func (r *Registry) Load(slug string) (*Runtime, error) {
	path := filepath.Join(r.opts.Blueprints, slug+".html")
	src, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("blueprint %q: %w", slug, err)
	}
	page, err := Parse(src, path)
	if err != nil {
		return nil, err
	}
	rt, err := newRuntime(r.opts, page)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	old := r.byID[page.ID]
	r.byID[page.ID] = rt
	r.bySlug[slug] = rt
	// A previous file for the same id stops being reachable: one identity is one
	// runtime, whichever slug it was opened by.
	for s, other := range r.bySlug {
		if other == old {
			delete(r.bySlug, s)
		}
	}
	r.mu.Unlock()

	if old != nil {
		old.Close()
	}
	return rt, nil
}

// Get answers with what is loaded for this slug, loading it if the page has not
// been opened yet. Calls that only act on a blueprint (its event stream, its ops)
// go through here: they must not reload it under a page that is already attached.
func (r *Registry) Get(slug string) (*Runtime, error) {
	r.mu.Lock()
	rt, ok := r.bySlug[slug]
	r.mu.Unlock()
	if ok {
		return rt, nil
	}
	return r.Load(slug)
}