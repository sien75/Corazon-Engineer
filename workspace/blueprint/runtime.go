package blueprint

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Options is what a runtime needs from the process around it. None of it has a
// default: a service that invented a data home would write a database nobody
// chose.
type Options struct {
	// Data is where one project keeps everything it writes: its blueprints'
	// sqlite files, and the scratch space for the script files they run.
	Data string
	// Blueprints is that project's folder of <slug>.html files.
	Blueprints string
	AI         string // ai service base url, handed to every script as BP_AI
	Storage    string // storage service base url: where an ai node reads its records back
	Home       string // Engineer's own folder, told to an ai node's agent
	// Folder is the folder the user associated with a blueprint (by its slug), or
	// "" when none is: an ai node's agent works there, and does not start without.
	Folder func(slug string) string
}

// Modes: the same file, two runtimes, two databases. Prod is what the user uses
// and is loaded when the service starts; dev is what its author works on and is
// loaded when its page is opened. Neither reloads on a file change — the page's
// own button is the reload.
const (
	ModeProd = "prod"
	ModeDev  = "dev"
)

func now() string { return time.Now().UTC().Format(time.RFC3339) }

// optsData is the directory a runtime writes into: its project's own, so two
// projects can hold blueprints with the same <meta id> without sharing a row.
func optsData(opts Options) string { return opts.Data }

// Runtime is one loaded blueprint: its page, its database, and the bus its page
// is attached to. Loading is the only place a blueprint's code takes effect —
// there is no hot reload, so what a page shows is what was read when it was
// opened.
type Runtime struct {
	opts    Options
	page    *Page
	store   *Store
	mode    string // ModeProd or ModeDev: which database this runtime is filed under
	slug    string // the file it came from, for the reload op
	project string // the project it belongs to: its folder, its data, its address
	workDir string // scratch space for script files; scripts themselves run in opts.Blueprints
	reg     *Registry

	mu      sync.Mutex
	clients map[*Client]bool
	watched map[string]bool
	closed  bool
	init    *initProcess
	ai      *aiRuntime // the page's ai node, or nil
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

func newRuntime(opts Options, page *Page, mode, slug, project string, reg *Registry) (*Runtime, error) {
	store, err := openStore(optsData(opts), page.ID, mode)
	if err != nil {
		return nil, err
	}
	blocks := page.SQL
	if page.AI != nil {
		blocks = append(append([]string{}, blocks...), aiSchema)
	}
	if err := store.Apply(blocks); err != nil {
		store.Close()
		return nil, err
	}
	// Slugs and identities both end up in a path; neither is trusted as written.
	work := filepath.Join(opts.Data, ".work", page.ID+"."+mode)
	if err := os.MkdirAll(work, 0o755); err != nil {
		store.Close()
		return nil, err
	}
	rt := &Runtime{
		opts:    opts,
		page:    page,
		store:   store,
		mode:    mode,
		slug:    slug,
		project: project,
		workDir: work,
		reg:     reg,
		clients: map[*Client]bool{},
		watched: map[string]bool{},
	}
	store.afterWrite(rt.pushChanges)
	if page.AI != nil {
		rt.ai = newAIRuntime(rt, page.AI)
		rt.ai.migrate()
	}
	return rt, nil
}

// Start brings the blueprint's code up: the init script, if it has one. The
// flows need no start — they are the bus, and the bus exists as soon as the
// runtime does. Prod runtimes are started when the service starts, dev ones when
// their page is first opened; either way, what runs does not wait for a page.
func (rt *Runtime) Start() error { return rt.startInit() }

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

// Close ends the runtime: its init script is killed, its store is released and
// every attached page is told the connection is over. A runtime that is closed
// cannot be restarted — a reload makes a new one.
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
	init := rt.init
	rt.init = nil
	ai := rt.ai
	rt.mu.Unlock()

	if ai != nil {
		ai.close()
	}
	for _, c := range clients {
		close(c.ch)
	}
	if init != nil {
		init.kill()
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

// sendEvent puts one event on one page's stream and nobody else's: what a page
// gets when it attaches, which a page that was already there must not see again.
func (rt *Runtime) sendEvent(c *Client, ev Event) {
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
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.closed || !rt.clients[c] {
		return
	}
	select {
	case c.ch <- msg:
	default:
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
	rt.mu.Lock()
	closed := rt.closed
	rt.mu.Unlock()
	if closed {
		return
	}
	// The ai node's own events (ai.sync, ai.ask, ai.stop) are not for the bus: the
	// runtime answers them itself, and an ask is not echoed back to every page.
	if rt.ai != nil && ev.Source == "ui" && rt.ai.handle(ev) {
		return
	}
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
	}
	return "step"
}

// ---------- the page's own channel ----------

// reloadFailed marks a reload that could not parse or start the file, so the
// route can answer "the file is broken" instead of "your request is bad": the
// request was fine, the blueprint is not.
type reloadFailed struct{ err error }

func (e reloadFailed) Error() string { return e.err.Error() }
func (e reloadFailed) Unwrap() error { return e.err }

// Op is one request from a page: emit an event, watch a table, run a query, or
// reload the blueprint.
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

	case "reload", "restart":
		// The only way a blueprint's code takes a change: kill the init script,
		// read the file, apply its schema, start it again. The page reloads itself
		// after this, because its stream belonged to the runtime that just ended.
		if rt.reg == nil {
			return nil, fmt.Errorf("this runtime cannot be reloaded")
		}
		if _, err := rt.reg.Load(rt.slug); err != nil {
			return nil, reloadFailed{err}
		}
		return map[string]any{"ok": true, "reloaded": true, "mode": rt.mode}, nil

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

// ---------- the loaded set ----------

// Registry holds the loaded runtimes of one mode. A blueprint is addressed by its
// file's slug, but filed by its own id: loading it again replaces the runtime that
// was there, and the old one is shut down first.
//
// Prod and dev are two registries, and that is all that separates them: the same
// files, the same folder, different databases, separate buses.
type Registry struct {
	mode    string
	project string
	mu      sync.Mutex
	opts    Options
	// bySlug and byID both point at the same runtimes: one identity is one
	// runtime, whichever slug it was loaded by.
	bySlug map[string]*Runtime
	byID   map[string]*Runtime
}

func NewRegistry(opts Options, mode, project string) *Registry {
	return &Registry{
		mode:    mode,
		project: project,
		opts:    opts,
		bySlug:  map[string]*Runtime{},
		byID:    map[string]*Runtime{},
	}
}

// Folder is this project's blueprints folder, or "" when the project could not be
// opened.
func (r *Registry) Folder() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.opts.Blueprints
}

// LoadAll loads every blueprint in the folder, starting each one's code. Prod uses
// it at start-up: the user's blueprints run whether or not a page is open. One
// blueprint failing to load does not stop the others — a broken file is its own
// error page, not a dead service.
func (r *Registry) LoadAll() error {
	files, err := r.Files()
	if err != nil {
		return err
	}
	var firstErr error
	for _, f := range files {
		if _, err := r.Load(f.Slug); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// File is one blueprint a reader can open.
type File struct {
	Slug  string
	Title string
	// AI is true when the blueprint has an ai node: it needs a folder before it
	// can be opened.
	AI bool
}

// Files lists the folder's blueprints, by slug, in name order.
func (r *Registry) Files() ([]File, error) {
	folder := r.Folder()
	if folder == "" {
		return nil, nil
	}
	entries, err := os.ReadDir(folder)
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
		hasAI := false
		if src, err := os.ReadFile(filepath.Join(folder, name)); err == nil {
			if t := titleOf(string(src)); t != "" {
				title = t
			}
			if page, err := Parse(src, filepath.Join(folder, name)); err == nil {
				hasAI = page.AI != nil
			}
		}
		out = append(out, File{Slug: slug, Title: title, AI: hasAI})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out, nil
}

// Load reads a blueprint and makes it the live one for its id, starting its code.
// It is the whole of "apply a change": a reload is this call again, and nothing
// else reloads — not opening a page, not a file change.
func (r *Registry) Load(slug string) (*Runtime, error) {
	if !slugShape.MatchString(slug) {
		return nil, fmt.Errorf("not a blueprint name: %q", slug)
	}
	r.mu.Lock()
	folder := r.opts.Blueprints
	r.mu.Unlock()
	if folder == "" {
		return nil, fmt.Errorf("this project's folder is not available")
	}

	path := filepath.Join(folder, slug+".html")
	src, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("blueprint %q: %w", slug, err)
	}
	page, err := Parse(src, path)
	if err != nil {
		return nil, err
	}
	rt, err := newRuntime(r.opts, page, r.mode, slug, r.project, r)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	old := r.byID[page.ID]
	r.byID[page.ID] = rt
	r.bySlug[slug] = rt
	for s, other := range r.bySlug {
		if other == old {
			delete(r.bySlug, s)
		}
	}
	r.mu.Unlock()

	if old != nil {
		old.Close()
	}
	if err := rt.Start(); err != nil {
		return nil, err
	}
	return rt, nil
}

// Get answers with what is loaded for this slug, loading it if nothing is yet.
// Calls that only act on a blueprint (its event stream, its ops) go through here:
// they must not reload it under a page that is already attached.
func (r *Registry) Get(slug string) (*Runtime, error) {
	r.mu.Lock()
	rt, ok := r.bySlug[slug]
	r.mu.Unlock()
	if ok {
		return rt, nil
	}
	return r.Load(slug)
}

// Shutdown stops every runtime: the service is going away.
func (r *Registry) Shutdown() {
	r.mu.Lock()
	runtimes := r.bySlug
	r.bySlug = map[string]*Runtime{}
	r.byID = map[string]*Runtime{}
	r.mu.Unlock()
	for _, rt := range runtimes {
		rt.Close()
	}
}
