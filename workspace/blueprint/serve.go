// Package blueprint runs blueprints: it serves, parses and runs single-file
// blueprints, it keeps the projects (the blueprints folders) the user imported,
// and it keeps the conversation of a page that has an ai node.
//
//	A blueprint is one HTML file that carries its own tables (<script type="blueprint/sql">),
//	its own orchestration (<script type="blueprint/flow">) and its own backend
//	scripts (<script type="blueprint/sh|js|py" id="…">). The browser skips all of
//	it; opening the page here activates it.
//
// It is not a program of its own: the engineer binary is a multi-call binary, and
// Serve is the entry point behind the `serve-blueprint` subcommand:
//
//	engineer serve-blueprint --bind <host> --port <n> --home <dir>
//	                         --engineer-home <dir> --cwd <dir> --storage <url> --ai <url>
//
// Every flag is required and there is no fallback: an invented default silently
// binds a port nobody chose.
package blueprint

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
)

//go:embed client.js
var clientJS []byte

// Extension → content type.
var types = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".json": "application/json",
	".md":   "text/markdown; charset=utf-8",
	".png":  "image/png",
	".svg":  "image/svg+xml",
}

type config struct {
	home string // the data home: <engineer home>/data
	// engineerHome is Engineer's own folder, whose data is this service's home.
	// It is only told to an ai node's agent.
	engineerHome string
	rt           runtimeConfig
}

// runtimeConfig is what this service was told about the other two.
type runtimeConfig struct {
	Storage string `json:"storage"`
	AI      string `json:"ai"`
	Cwd     string `json:"cwd"`
}

const usage = "usage: engineer serve-blueprint --bind <host> --port <n> " +
	"--home <dir> --engineer-home <dir> --cwd <dir> " +
	"--storage <url> --ai <url>"

// Serve runs the shell and the blueprint runtime until it is killed. argv is the
// argument list following the subcommand; on failure it prints to stderr and
// exits.
func Serve(argv []string) {
	bind := ""
	port := 0
	cfg := config{}

	for i := 0; i < len(argv); i++ {
		switch {
		case argv[i] == "--bind" && i+1 < len(argv):
			i++
			bind = argv[i]
		case argv[i] == "--port" && i+1 < len(argv):
			i++
			port, _ = strconv.Atoi(argv[i])
		case argv[i] == "--engineer-home" && i+1 < len(argv):
			i++
			cfg.engineerHome = argv[i]
		case argv[i] == "--home" && i+1 < len(argv):
			i++
			cfg.home = argv[i]
		case argv[i] == "--cwd" && i+1 < len(argv):
			i++
			cfg.rt.Cwd = argv[i]
		case argv[i] == "--storage" && i+1 < len(argv):
			i++
			cfg.rt.Storage = argv[i]
		case argv[i] == "--ai" && i+1 < len(argv):
			i++
			cfg.rt.AI = argv[i]
		}
	}

	if bind == "" || port == 0 || cfg.home == "" ||
		cfg.engineerHome == "" || cfg.rt.Cwd == "" || cfg.rt.Storage == "" || cfg.rt.AI == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	if info, err := os.Stat(cfg.home); err != nil || !info.IsDir() {
		log.Fatalf("engineer blueprint: --home is not a folder: %s", cfg.home)
	}
	engineerHome, err := filepath.Abs(cfg.engineerHome)
	if err != nil {
		log.Fatalf("engineer blueprint: bad --engineer-home %q: %v", cfg.engineerHome, err)
	}
	cfg.engineerHome = engineerHome
	cwd, err := filepath.Abs(cfg.rt.Cwd)
	if err != nil {
		log.Fatalf("engineer blueprint: bad --cwd %q: %v", cfg.rt.Cwd, err)
	}
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		log.Fatalf("engineer blueprint: --cwd is not a folder: %s", cwd)
	}
	cfg.rt.Cwd = cwd

	// Which folders are imported is the user's choice, made in the web UI and kept
	// in the data home. There is no flag for it: a folder chosen by a launcher would
	// be a folder the user never agreed to.
	projects, err := OpenProjects(cfg.home, Env{AI: cfg.rt.AI, Storage: cfg.rt.Storage, EngineerHome: cfg.engineerHome})
	if err != nil {
		log.Fatalf("engineer blueprint: %v", err)
	}
	list, _ := projects.Snapshot()

	addr := net.JoinHostPort(bind, strconv.Itoa(port))
	// Bind first, then announce: the banner must never claim a port we did not
	// get.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("engineer blueprint: %v", err)
	}
	log.Printf("engineer blueprint: http://%s:%d", displayHost(bind), port)
	if len(list) == 0 {
		log.Printf("engineer blueprint: no project yet — pick a folder in the web UI")
	}
	// A stopped service must take its blueprint scripts with it: an init script
	// runs in its own process group, so killing this process does not reach it,
	// and a leaked listener is exactly what the next start would double up.
	go func() {
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
		sig := <-signals
		log.Printf("engineer blueprint: %v — stopping blueprints", sig)
		projects.Shutdown()
		os.Exit(0)
	}()

	if err := http.Serve(ln, handler(cfg, projects)); err != nil {
		log.Fatalf("engineer blueprint: %v", err)
	}
}

// displayHost is the host to show a human: a wildcard or loopback bind is reached
// as localhost.
func displayHost(bind string) string {
	if bind == "" || bind == "0.0.0.0" || bind == "::" || bind == "127.0.0.1" || bind == "::1" || bind == "localhost" {
		return "localhost"
	}
	return bind
}

func handler(cfg config, projects *Projects) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This is a local tool: its files change when the tool does, and a cached
		// app.js served next to a fresh index.html is a broken shell.
		w.Header().Set("Cache-Control", "no-store")

		// net/http has already percent-decoded the path.
		urlPath := r.URL.Path

		switch {
		case urlPath == "/favicon.ico":
			w.WriteHeader(http.StatusNotFound)
			return

		// The projects: the web UI's one setting, and the only place they change.
		case urlPath == "/config/projects":
			serveProjects(w, r, projects)
			return
		case urlPath == "/config/projects/foreground":
			serveForeground(w, r, projects)
			return

		// The blueprints of the front project, as JSON: the shell draws its tabs from
		// this, and opens one at a time in a frame.
		case urlPath == "/config/blueprints":
			serveBlueprintList(w, r, projects)
			return

		// The folder a blueprint with an ai node works in: asked for the first time
		// it is opened, and kept in the data home's config.yaml.
		case urlPath == "/config/blueprints/folder":
			serveBlueprintFolder(w, r, projects)
			return

		case urlPath == "/bp" || urlPath == "/bp/":
			blueprintIndex(w, projects, ModeProd)
			return

		case strings.HasPrefix(urlPath, "/bp/"):
			blueprintRoute(w, r, projects, cfg, urlPath, "/bp/", ModeProd)
			return

		case urlPath == "/bp-dev" || urlPath == "/bp-dev/":
			blueprintIndex(w, projects, ModeDev)
			return

		case strings.HasPrefix(urlPath, "/bp-dev/"):
			blueprintRoute(w, r, projects, cfg, urlPath, "/bp-dev/", ModeDev)
			return
		}

		// The shell page belongs to the web service; a blueprint URL is the only
		// other thing this service answers.
		http.NotFound(w, r)
	})
}

// ---------- projects ----------

// serveProjects answers the project list, imports a folder, and removes one.
//
//	GET    /config/projects                  → {projects, foreground}
//	POST   /config/projects   {path}         → {id, path}  (importing starts it)
//	DELETE /config/projects?id=<id>          → {projects, foreground} (stops it)
func serveProjects(w http.ResponseWriter, r *http.Request, projects *Projects) {
	w.Header().Set("Content-Type", types[".json"])
	switch r.Method {
	case http.MethodGet:
		writeProjects(w, projects, "")

	case http.MethodPost:
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		// JSON or YAML: the pages send JSON, a person at a terminal may send either.
		var req struct {
			Path string `json:"path" yaml:"path"`
		}
		if err := yaml.Unmarshal(body, &req); err != nil {
			badRequest(w, "bad request: "+err.Error())
			return
		}
		added, err := projects.Add(req.Path)
		if err != nil {
			// A project that was imported and is now running is fine even if one of
			// its blueprints failed: that blueprint has its own error page.
			if added.ID != "" {
				json.NewEncoder(w).Encode(map[string]any{"id": added.ID, "path": added.Path, "warning": err.Error()})
				return
			}
			badRequest(w, err.Error())
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"id": added.ID, "path": added.Path})

	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == "" {
			badRequest(w, "id is required")
			return
		}
		if err := projects.Remove(id); err != nil {
			badRequest(w, err.Error())
			return
		}
		writeProjects(w, projects, "")

	default:
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost+", "+http.MethodDelete)
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// serveForeground switches which project is in front. Nothing else changes: every
// project keeps running.
func serveForeground(w http.ResponseWriter, r *http.Request, projects *Projects) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", types[".json"])
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	var req struct {
		ID string `json:"id" yaml:"id"`
	}
	if err := yaml.Unmarshal(body, &req); err != nil {
		badRequest(w, "bad request: "+err.Error())
		return
	}
	if err := projects.SetForeground(req.ID); err != nil {
		badRequest(w, err.Error())
		return
	}
	writeProjects(w, projects, "")
}

func writeProjects(w http.ResponseWriter, projects *Projects, warning string) {
	list, front := projects.Snapshot()
	out := map[string]any{"projects": list, "foreground": front}
	if warning != "" {
		out["warning"] = warning
	}
	json.NewEncoder(w).Encode(out)
}

func badRequest(w http.ResponseWriter, message string) {
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]any{"error": message})
}

// serveBlueprintList answers GET /config/blueprints: the front project's
// blueprints, in file order — what the shell's tab strip lists.
func serveBlueprintList(w http.ResponseWriter, r *http.Request, projects *Projects) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", types[".json"])
	list, front := projects.Snapshot()
	out := struct {
		Project   string `json:"project"`
		Blueprints []any `json:"blueprints"`
	}{Project: front, Blueprints: []any{}}

	var entry *project
	if front != "" {
		entry, _ = projects.Get(front)
	}
	if entry != nil && entry.prod != nil {
		if files, err := entry.prod.Files(); err == nil {
			for _, f := range files {
				item := map[string]any{
					"slug":  f.Slug,
					"title": f.Title,
					"url":   baseOf(ModeProd, entry.ID, f.Slug),
				}
				if f.AI {
					// An ai node's agent needs a working folder before the page opens.
					item["needsFolder"] = true
					item["folder"] = projects.Folder(entry.ID, f.Slug)
				}
				out.Blueprints = append(out.Blueprints, item)
			}
		}
	}
	_ = list
	json.NewEncoder(w).Encode(out)
}

// serveBlueprintFolder answers POST /config/blueprints/folder {project, slug, path}:
// it associates a folder with a blueprint and answers {folder}.
func serveBlueprintFolder(w http.ResponseWriter, r *http.Request, projects *Projects) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", types[".json"])
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	var req struct {
		Project string `json:"project" yaml:"project"`
		Slug    string `json:"slug" yaml:"slug"`
		Path    string `json:"path" yaml:"path"`
	}
	if err := yaml.Unmarshal(body, &req); err != nil {
		badRequest(w, "bad request: "+err.Error())
		return
	}
	if !slugShape.MatchString(req.Project) || !slugShape.MatchString(req.Slug) {
		badRequest(w, "project and slug are required")
		return
	}
	folder, err := projects.SetFolder(req.Project, req.Slug, req.Path)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"folder": folder})
}

// ---------- blueprints ----------

// slugShape is what a blueprint file may be named. It comes from a URL and
// becomes a path, so it is checked rather than sanitized.
var slugShape = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

// blueprintRoute splits /bp/<project>/<slug>[/<verb>] (or the /bp-dev prefix) and
// answers it. The project is in the address because a blueprint's slug is only
// unique inside its folder, and because a page that is already open must keep
// pointing at its own project when the foreground changes.
func blueprintRoute(w http.ResponseWriter, r *http.Request, projects *Projects, cfg config, urlPath, prefix, mode string) {
	rest := strings.TrimPrefix(urlPath, prefix)
	projectID, rest, ok := strings.Cut(rest, "/")
	if !ok || !slugShape.MatchString(projectID) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	slug, verb, _ := strings.Cut(rest, "/")
	if !slugShape.MatchString(slug) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	entry, ok := projects.Get(projectID)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	reg := entry.prod
	if mode == ModeDev {
		reg = entry.dev
	}
	if reg == nil {
		errorPage(w, fmt.Errorf("project %q is not running", projectID))
		return
	}

	switch verb {
	case "":
		servePage(w, reg, projectID, slug)
	case "bp.js":
		// The page's channel: one script, window.bp. A page is told nothing else —
		// no address, no path; what it needs from ai or storage the runtime does
		// for it (see ai.go).
		w.Header().Set("Content-Type", types[".js"])
		w.Write(clientJS)
	case "events":
		serveEvents(w, r, reg, slug)
	case "op":
		serveOp(w, r, reg, slug)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

// servePage answers with the blueprint's page. It does not reload the file: the
// runtime was loaded at import (prod) or on a previous open (dev), and a change to
// the file arrives through the page's reload button, not through a page view.
func servePage(w http.ResponseWriter, reg *Registry, projectID, slug string) {
	rt, err := reg.Get(slug)
	if err != nil {
		errorPage(w, err)
		return
	}
	w.Header().Set("Content-Type", types[".html"])
	w.Write(withClient(rt.HTML(), baseOf(reg.mode, projectID, slug)))
}

// baseOf is where this blueprint's own routes live: the page script finds its
// address from the tag it was loaded by, so the prefix has to be the real one.
func baseOf(mode, projectID, slug string) string {
	if mode == ModeDev {
		return "/bp-dev/" + projectID + "/" + slug
	}
	return "/bp/" + projectID + "/" + slug
}

// serveEvents is the page's side of the bus: one SSE stream, open for as long as
// the page is.
func serveEvents(w http.ResponseWriter, r *http.Request, reg *Registry, slug string) {
	rt, err := reg.Get(slug)
	if err != nil {
		errorPage(w, err)
		return
	}
	client, err := rt.Subscribe()
	if err != nil {
		http.Error(w, err.Error(), http.StatusGone)
		return
	}
	defer rt.Unsubscribe(client)
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": blueprint events\n\n")
	flusher.Flush()

	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, open := <-client.Messages():
			if !open {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-keepAlive.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// serveOp answers one request from the page: emit, watch, unwatch, sql, or reload.
func serveOp(w http.ResponseWriter, r *http.Request, reg *Registry, slug string) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rt, err := reg.Get(slug)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	answer, err := rt.Op(body)
	w.Header().Set("Content-Type", types[".json"])
	if err != nil {
		// A reload that could not parse the file is not a bad request: the file is
		// broken, and the old runtime is still the one serving this page.
		var bad reloadFailed
		if errors.As(err, &bad) {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]any{"error": bad.Error()})
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(answer)
}

// withClient is the page a browser gets: the blueprint's own document, with the
// channel script attached as early as the document allows. Early matters: it is a
// blocking classic script, so a page's own inline script can use `bp` without
// waiting, and a blueprint never has to think about load order.
//
// Everything backend was cut out when the page was parsed, so a blueprint's sql
// and scripts are not in the source the page downloads.
func withClient(html []byte, base string) []byte {
	tag := []byte("<script src=\"" + base + "/bp.js\"></script>\n")
	at := 0
	if low := strings.ToLower(string(html)); strings.HasPrefix(low, "<!doctype") {
		if i := strings.IndexByte(low, '>'); i >= 0 {
			at = i + 1
		}
	}
	out := make([]byte, 0, len(html)+len(tag))
	out = append(out, html[:at]...)
	out = append(out, tag...)
	return append(out, html[at:]...)
}

// blueprintIndex lists what can be opened, in the foreground project. The list is
// per project on purpose: the switcher in the corner decides which one this is.
func blueprintIndex(w http.ResponseWriter, projects *Projects, mode string) {
	w.Header().Set("Content-Type", types[".html"])

	list, front := projects.Snapshot()
	var entry *project
	if front != "" {
		entry, _ = projects.Get(front)
	}

	var b strings.Builder
	b.WriteString("<!doctype html><title>blueprints</title>")
	b.WriteString(`<style>
body{font:14px/1.6 -apple-system,system-ui,sans-serif;margin:48px auto;max-width:640px;color:#222}
h1{font-size:18px;font-weight:600;margin:0 0 6px}
p.sub{color:#777;margin:0 0 20px}
a{color:#0b6bcb;text-decoration:none}a:hover{text-decoration:underline}
li{margin:6px 0}code{color:#777;font-size:12px}
</style>`)
	if mode == ModeDev {
		b.WriteString("<h1>blueprints · dev</h1>")
	} else {
		b.WriteString("<h1>blueprints</h1>")
	}

	if entry == nil {
		b.WriteString("<p class=sub>no project imported yet — pick a folder on the engineer page</p>")
		w.Write([]byte(b.String()))
		return
	}
	fmt.Fprintf(&b, "<p class=sub><b>%s</b> <code>%s</code>", htmlEscape(entry.ID), htmlEscape(entry.Path))
	if len(list) > 1 {
		fmt.Fprintf(&b, " — %d projects imported, the switcher in the corner changes which one this lists", len(list))
	}
	b.WriteString("</p>")

	reg := entry.prod
	if mode == ModeDev {
		reg = entry.dev
	}
	if reg == nil {
		b.WriteString("<p><code>this project could not be opened</code></p>")
		w.Write([]byte(b.String()))
		return
	}

	files, err := reg.Files()
	if err != nil {
		errorPage(w, err)
		return
	}
	if mode == ModeDev {
		b.WriteString("<p class=sub>dev runs against its own database and starts only when opened</p>")
	}
	if len(files) == 0 {
		b.WriteString("<p><code>no .html files in this folder yet</code></p>")
	} else {
		b.WriteString("<ul>")
		prefix := baseOf(mode, entry.ID, "")
		prefix = strings.TrimSuffix(prefix, "/") + "/"
		for _, f := range files {
			fmt.Fprintf(&b, "<li><a href=\"%s%s\">%s</a> <code>%s</code></li>", prefix, f.Slug, htmlEscape(f.Title), f.Slug)
		}
		b.WriteString("</ul>")
	}
	w.Write([]byte(b.String()))
}

func errorPage(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", types[".html"])
	w.WriteHeader(http.StatusInternalServerError)
	fmt.Fprintf(w, `<!doctype html><title>blueprint</title>
<style>body{font:14px/1.6 -apple-system,system-ui,sans-serif;margin:48px auto;max-width:760px;color:#222}
pre{background:#f6f6f6;padding:16px;border-radius:6px;white-space:pre-wrap;word-break:break-word}</style>
<h1>this blueprint could not be loaded</h1><pre>%s</pre>`, htmlEscape(err.Error()))
}

func htmlEscape(s string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return replacer.Replace(s)
}

// ---------- files ----------

// contentType is the type a served file is sent as, by its extension.
func contentType(file string) string {
	if t, ok := types[filepath.Ext(file)]; ok {
		return t
	}
	return "application/octet-stream"
}
