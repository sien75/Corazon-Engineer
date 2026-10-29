// Package server is the web frontend's file server.
//
// Serves the assets in workspace/web and generates /config.js carrying the
// addresses the launcher picked. /config.js is an ES module: the frontend and
// every blueprint page read it with `import { ENGINEER } from "/config.js"`,
// so there is no global to race with.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-web` subcommand:
//
//	engineer serve-web --bind <host> --port <n> --assets <dir> --static <url> --ai <url> --log <url>
//
// Every flag is required and there is no fallback. The launcher owns the bind
// host (loopback unless ENGINEER_BIND opened the stack up), the port and the
// three runtime addresses; the frontend only ever reaches a service through the
// URLs served back as /config.js, so an invented default would point the page
// at a port nobody chose.
//
// --assets is the directory holding the frontend files (index.html, app.js,
// style.css). There is no project flag: which folders the program works on is
// data in log's home database, and a page is found through it.
//
// /agent/<sessionId>/ serves the blueprint directory of the project that session
// belongs to (log knows the session's project and blueprint; log's project row
// knows the folder). A page is not copied per agent, so every agent of one
// blueprint shares it — an edit reaches all of them on reload.
//
// The path is a session id, not a slug, because a session is more than its page
// — it has the conversation. /agent/… is where the page's directory is, and the
// session is what the user is talking to.
//
// /project/add is the one place a folder is admitted as a project: this service
// is what reads the disk, so the rule ("an engineer project has an
// engineer.yaml") lives here, in front of log's registry.
//
// `/agent/<sessionId>` with no trailing slash names a session, not a directory:
// a page is only ever addressed with the slash the iframe uses, and the
// slashless form is a 404 rather than a redirect.
package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Extension → content type, matching serve.js.
var types = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".json": "application/json",
	".md":   "text/markdown; charset=utf-8",
	".png":  "image/png",
	".svg":  "image/svg+xml",
}

// Field order matches what serve.js emitted (JSON.stringify of an object built
// as static, ai, log).
type runtimeConfig struct {
	Static string `json:"static"`
	AI     string `json:"ai"`
	Log    string `json:"log"`
}

const usage = "usage: engineer serve-web --bind <host> --port <n> --assets <dir> " +
	"--static <url> --ai <url> --log <url>"

// agentPrefix is the URL prefix pages are served under: /agent/<sessionId>/…
const agentPrefix = "/agent/"

// blueprintSlug is the only shape a slug may have. It arrives from log, but log's
// row is written from a request body — validating here is what keeps a bad row
// from becoming a path.
var blueprintSlug = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// Serve runs the web file server until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	bind := ""
	port := 0
	root := ""
	rt := runtimeConfig{}

	for i := 0; i < len(argv); i++ {
		switch {
		case argv[i] == "--bind" && i+1 < len(argv):
			i++
			bind = argv[i]
		case argv[i] == "--port" && i+1 < len(argv):
			i++
			port, _ = strconv.Atoi(argv[i])
		case argv[i] == "--assets" && i+1 < len(argv):
			i++
			root = argv[i]
		case argv[i] == "--static" && i+1 < len(argv):
			i++
			rt.Static = argv[i]
		case argv[i] == "--ai" && i+1 < len(argv):
			i++
			rt.AI = argv[i]
		case argv[i] == "--log" && i+1 < len(argv):
			i++
			rt.Log = argv[i]
		}
	}

	if bind == "" || port == 0 || root == "" || rt.Static == "" || rt.AI == "" || rt.Log == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --assets %q: %v", root, err)
	}

	addr := net.JoinHostPort(bind, strconv.Itoa(port))
	// Bind first, then announce: the banner must never claim a port we did not
	// get. A second instance on a taken port has to fail loudly here instead of
	// logging a URL that belongs to somebody else's process.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("engineer web: %v", err)
	}
	log.Printf("engineer web: http://%s:%d", displayHost(bind), port)
	if err := http.Serve(ln, handler(abs, rt)); err != nil {
		log.Fatalf("engineer web: %v", err)
	}
}

// displayHost is the host to show a human: a wildcard or loopback bind is
// reached as localhost.
func displayHost(bind string) string {
	if bind == "" || bind == "0.0.0.0" || bind == "::" || bind == "127.0.0.1" || bind == "::1" || bind == "localhost" {
		return "localhost"
	}
	return bind
}

// sessionPages turns a session id into the page it shows: the project the
// session belongs to, and the blueprint slug inside that project. The mapping is
// written once, by ai, when the session is created; log owns it, and this
// remembers the answer briefly so a page's burst of asset requests costs one
// lookup instead of one per file. Short-lived on purpose: deleting a
// conversation removes its log row, and the page must stop being served without
// waiting for the process to restart.
type sessionPages struct {
	logBase string
	mu      sync.Mutex
	seen    map[string]cachedPage
}

// page is one session's page: a directory inside a project's blueprint tree.
type page struct {
	projectID string
	slug      string
}

type cachedPage struct {
	page page
	at   time.Time
}

// slugTTL is how long a resolved mapping is trusted. A page load is a handful of
// requests in a few milliseconds; anything older asks log again.
const slugTTL = 5 * time.Second

// sessionMeta is the part of log's session row this server reads.
type sessionMeta struct {
	SessionID string `yaml:"sessionId"`
	Kind      string `yaml:"kind"`
	ProjectID string `yaml:"projectId"`
	Blueprint string `yaml:"blueprint"`
}

// pageFor asks log which project and blueprint this session was made from. A
// zero page means "this session has no page" (an unknown id, or main). An error
// means log could not answer — the caller turns that into a 502 instead of
// guessing a directory.
func (p *sessionPages) pageFor(sessionID string) (page, error) {
	p.mu.Lock()
	entry, ok := p.seen[sessionID]
	p.mu.Unlock()
	if ok && time.Since(entry.at) < slugTTL {
		return entry.page, nil
	}

	body, err := json.Marshal(map[string]string{"sessionId": sessionID})
	if err != nil {
		return page{}, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(p.logBase, "/")+"/log/session/detail",
		bytes.NewReader(body))
	if err != nil {
		return page{}, err
	}
	req.Header.Set("Content-Type", "application/yaml")
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return page{}, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return page{}, nil // no such session: not a page
	}
	if res.StatusCode != http.StatusOK {
		return page{}, fmt.Errorf("log /log/session/detail → HTTP %d", res.StatusCode)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return page{}, err
	}
	var meta sessionMeta
	if err := yaml.Unmarshal(raw, &meta); err != nil {
		return page{}, fmt.Errorf("log /log/session/detail: %v", err)
	}
	out := page{
		projectID: strings.TrimSpace(meta.ProjectID),
		slug:      strings.TrimSpace(meta.Blueprint),
	}
	// The row is written from a request body, so the path it becomes is checked
	// here too: a slug that could escape the blueprint directory is no page at
	// all.
	if out.projectID == "" || out.slug == "" || !blueprintSlug.MatchString(out.slug) {
		out = page{}
	}
	p.mu.Lock()
	p.seen[sessionID] = cachedPage{page: out, at: time.Now()}
	p.mu.Unlock()
	return out, nil
}

// projectPaths turns a project id into its folder. Projects are data in log's
// home database, so this server has no project directory of its own; the folder
// is remembered briefly, like a session's page.
type projectPaths struct {
	logBase string
	mu      sync.Mutex
	seen    map[string]projectPath
}

type projectPath struct {
	dir string
	at  time.Time
}

// dir resolves a project id to its folder. ok is false when the id names no
// project; an error means log could not answer.
func (p *projectPaths) dir(projectID string) (string, bool, error) {
	p.mu.Lock()
	entry, ok := p.seen[projectID]
	p.mu.Unlock()
	if ok && time.Since(entry.at) < slugTTL {
		return entry.dir, true, nil
	}
	body, err := json.Marshal(map[string]string{"projectId": projectID})
	if err != nil {
		return "", false, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(p.logBase, "/")+"/log/project/get",
		bytes.NewReader(body))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Content-Type", "application/yaml")
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", false, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return "", false, nil
	}
	if res.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("log /log/project/get → HTTP %d", res.StatusCode)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", false, err
	}
	var row struct {
		Path string `yaml:"path"`
	}
	if err := yaml.Unmarshal(raw, &row); err != nil {
		return "", false, fmt.Errorf("log /log/project/get: %v", err)
	}
	dir := strings.TrimSpace(row.Path)
	if dir == "" {
		return "", false, nil
	}
	p.mu.Lock()
	p.seen[projectID] = projectPath{dir: dir, at: time.Now()}
	p.mu.Unlock()
	return dir, true, nil
}

func handler(assets string, rt runtimeConfig) http.Handler {
	index := filepath.Join(assets, "index.html")
	pages := &sessionPages{logBase: rt.Log, seen: map[string]cachedPage{}}
	projects := &projectPaths{logBase: rt.Log, seen: map[string]projectPath{}}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This is a local tool: its files change when the tool or a project does,
		// and a cached app.js served next to a fresh index.html is a broken shell.
		// Never store anything the shell loads.
		w.Header().Set("Cache-Control", "no-store")

		// net/http has already percent-decoded the path.
		urlPath := r.URL.Path

		if urlPath == "/favicon.ico" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		if urlPath == "/config.js" {
			body, err := json.Marshal(rt)
			if err != nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", types[".js"])
			// An ES module, not a classic script: the addresses are exported, so a
			// page has to import them — nothing lands on window.
			fmt.Fprintf(w, "export const ENGINEER = %s;\nexport default ENGINEER;\n", body)
			return
		}

		// The ai service's image store, read through this origin. A page can use
		// `${ai}/blobs/…` because it reads /config.js; a markdown image written by
		// an agent cannot (it is text), and a dead host:port in a conversation
		// would rot the moment the launcher picked another port.
		if strings.HasPrefix(urlPath, blobsPrefix) {
			handleBlob(w, r, rt.AI)
			return
		}

		if urlPath == "/project/add" {
			if r.Method != http.MethodPost {
				// The route is a write, not a page: a GET must not look like a
				// missing path (the SPA fallback would answer it with the shell).
				w.Header().Set("Allow", http.MethodPost)
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			handleProjectAdd(w, r, rt.Log)
			return
		}

		// Two roots: /agent/<sessionId>/… is the blueprint the session was made
		// from, everything else the app's own assets. The session id is resolved
		// through log, never treated as a directory name: the URL carries the
		// conversation, not the class.
		base := assets
		rel := urlPath
		if strings.HasPrefix(urlPath, agentPrefix) {
			rest := strings.TrimPrefix(urlPath, agentPrefix)
			slash := strings.Index(rest, "/")
			if slash < 0 {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			sessionID, tail := rest[:slash], rest[slash:]
			pg, err := pages.pageFor(sessionID)
			if err != nil {
				// Never fall back to the shell here: the shell drawn inside the
				// page's own frame would hide the cause, and a page that cannot be
				// resolved is not a page.
				http.Error(w, "engineer web: cannot resolve session: "+err.Error(), http.StatusBadGateway)
				return
			}
			if pg.projectID == "" {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			dir, ok, err := projects.dir(pg.projectID)
			if err != nil {
				http.Error(w, "engineer web: cannot resolve project: "+err.Error(), http.StatusBadGateway)
				return
			}
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			base = filepath.Join(dir, ".agents", "blueprints")
			rel = "/" + pg.slug + tail
		}

		file := filepath.Join(base, filepath.FromSlash(rel))
		if !strings.HasPrefix(file, base) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if strings.HasSuffix(urlPath, "/") {
			file = filepath.Join(file, "index.html")
		}

		if data, err := os.ReadFile(file); err == nil {
			w.Header().Set("Content-Type", contentType(file))
			w.Write(data)
			return
		}

		// Under /agent/ there is no SPA: the blueprint either has the file or it
		// does not. Falling back to the shell would draw the shell inside the
		// page's own frame (a missing asset is not a route).
		if strings.HasPrefix(urlPath, agentPrefix) {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Anything not on disk falls back to the app shell (SPA routing).
		html, err := os.ReadFile(index)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", types[".html"])
		w.Write(html)
	})
}

// ---------- blobs ----------

// blobsPrefix mirrors the ai service's image store on this origin.
const blobsPrefix = "/blobs/"

// blobName is the only shape a blob request may have: one content address,
// exactly as ai-blobs defines it — 64 hex, no extension, no second segment. The
// path arrives from a URL, so it must not become a way of reaching another
// endpoint of the ai service; and a shape the ai service would answer 404 must
// not look accepted here.
var blobName = regexp.MustCompile(`^[0-9a-f]{64}$`)

var blobsClient = &http.Client{Timeout: 15 * time.Second}

// handleBlob proxies one blob read to the ai service. It is a read only: storing
// a blob stays the ai service's business, and this server has no write route.
func handleBlob(w http.ResponseWriter, r *http.Request, aiBase string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodHead)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !blobName.MatchString(strings.TrimPrefix(r.URL.Path, blobsPrefix)) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	target := strings.TrimSuffix(aiBase, "/") + r.URL.Path
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, nil)
	if err != nil {
		http.Error(w, "engineer web: "+err.Error(), http.StatusInternalServerError)
		return
	}
	res, err := blobsClient.Do(req)
	if err != nil {
		http.Error(w, "engineer web: ai unreachable: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()

	// The bytes are the ai service's answer, so how to decode them is its call.
	// A blob is content addressed and never changes, which is why its cache
	// header outlives this server's blanket no-store.
	for _, h := range []string{"Content-Type", "Cache-Control"} {
		if v := res.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	if res.ContentLength >= 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(res.ContentLength, 10))
	}
	w.WriteHeader(res.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	io.Copy(w, res.Body)
}

func contentType(file string) string {
	if t, ok := types[filepath.Ext(file)]; ok {
		return t
	}
	return "application/octet-stream"
}

// ---------- project/add ----------
//
// The one place a folder becomes a project. web is the service that reads the
// disk, so the rule lives here: a folder is an engineer project when it holds an
// engineer.yaml. log stores the answer; a path already on record keeps its id,
// so re-adding a folder brings its conversations back instead of starting a
// second, empty project beside them.

func handleProjectAdd(w http.ResponseWriter, r *http.Request, logBase string) {
	var req struct {
		Path string `yaml:"path"`
	}
	if r.Body != nil {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			writeErrYAML(w, http.StatusBadRequest, "bad_request", "invalid body: "+err.Error())
			return
		}
		if len(raw) > 0 {
			if err := yaml.Unmarshal(raw, &req); err != nil {
				writeErrYAML(w, http.StatusBadRequest, "bad_request", "invalid yaml body: "+err.Error())
				return
			}
		}
	}
	path := strings.TrimSpace(req.Path)
	if path == "" {
		writeErrYAML(w, http.StatusBadRequest, "bad_request", "path missing")
		return
	}
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			writeErrYAML(w, http.StatusInternalServerError, "internal", "cannot expand ~: "+err.Error())
			return
		}
		path = filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(path, "~"), "/"))
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		writeErrYAML(w, http.StatusBadRequest, "bad_request", "bad path: "+err.Error())
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeErrYAML(w, http.StatusBadRequest, "bad_request", "no such folder: "+abs)
		return
	}
	if !info.IsDir() {
		writeErrYAML(w, http.StatusBadRequest, "bad_request", "not a folder: "+abs)
		return
	}
	if _, err := os.Stat(filepath.Join(abs, "engineer.yaml")); err != nil {
		writeErrYAML(w, http.StatusBadRequest, "bad_request",
			"not an engineer project (no engineer.yaml in "+abs+")")
		return
	}

	post, err := yaml.Marshal(map[string]string{"path": abs, "name": projectName(abs)})
	if err != nil {
		writeErrYAML(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	req2, err := http.NewRequest(http.MethodPost, strings.TrimRight(logBase, "/")+"/log/project/add",
		bytes.NewReader(post))
	if err != nil {
		writeErrYAML(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	req2.Header.Set("Content-Type", "application/yaml")
	res, err := (&http.Client{Timeout: 5 * time.Second}).Do(req2)
	if err != nil {
		writeErrYAML(w, http.StatusBadGateway, "internal", "log /log/project/add: "+err.Error())
		return
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		writeErrYAML(w, http.StatusBadGateway, "internal", "log /log/project/add: "+err.Error())
		return
	}
	if res.StatusCode != http.StatusOK {
		writeErrYAML(w, res.StatusCode, "internal", "log /log/project/add → HTTP "+strconv.Itoa(res.StatusCode)+": "+string(raw))
		return
	}
	w.Header().Set("Content-Type", "application/yaml")
	w.Write(raw)
}

// projectName reads the display name out of the project marker, falling back to
// the folder name. The migration does the same reading for the project it
// registers — the marker, not the path, is what a user recognizes.
func projectName(dir string) string {
	if data, err := os.ReadFile(filepath.Join(dir, "engineer.yaml")); err == nil {
		var doc struct {
			Project string `yaml:"project"`
		}
		if yaml.Unmarshal(data, &doc) == nil {
			if name := strings.TrimSpace(doc.Project); name != "" {
				return name
			}
		}
	}
	return filepath.Base(dir)
}

func writeErrYAML(w http.ResponseWriter, status int, code, msg string) {
	body, _ := yaml.Marshal(map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
