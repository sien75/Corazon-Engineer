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
//	engineer serve-web --bind <host> --port <n> --assets <dir> --blueprints <dir> --static <url> --ai <url> --log <url> [--agents <dir>]
//
// Every flag is required and there is no fallback. The launcher owns the bind
// host (loopback unless ENGINEER_BIND opened the stack up), the port and the
// three runtime addresses; the frontend only ever reaches a service through the
// URLs served back as /config.js, so an invented default would point the page
// at a port nobody chose.
//
// --blueprints is the blueprint tree (.agents/blueprints): /agent/<sessionId>/
// serves one directory out of it, chosen by asking log which blueprint that
// session was made from. A page is not copied per agent, so every agent of one
// blueprint shares it — an edit reaches all of them on reload.
//
// --assets is the directory holding the frontend files (index.html, app.js,
// style.css). It is deliberately not called --root: the other three services
// take --root meaning the user's project, which is a different thing entirely.
//
// --agents is optional and legacy: the per-agent copies
// (`<project>/.engineer/agents/<sessionId>/`) that older projects made before a
// blueprint stopped being copied. A session with no blueprint in log is served
// from there while the copy exists; nothing writes it any more.
//
// The path is a session id, not a slug, because a session is more than its page
// — it has the conversation. /agent/… is where the page's directory is, and the
// session is what the user is talking to.
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
	"--blueprints <dir> --static <url> --ai <url> --log <url>"

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
	blueprints := ""
	// agents is optional: the per-agent copies projects had before blueprints
	// stopped being copied. Nothing writes it any more; serving it keeps agents
	// made under the old rule working.
	agents := ""
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
		case argv[i] == "--blueprints" && i+1 < len(argv):
			i++
			blueprints = argv[i]
		case argv[i] == "--agents" && i+1 < len(argv):
			i++
			agents = argv[i]
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

	if bind == "" || port == 0 || root == "" || blueprints == "" || rt.Static == "" || rt.AI == "" || rt.Log == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --assets %q: %v", root, err)
	}
	// The blueprint root is allowed to be missing — a project with no blueprints
	// has no `.agents/blueprints/` at all, and a request under /agent/… is then a
	// 404 — but it is still resolved, so the traversal guard compares like with
	// like.
	blueprintsAbs, err := filepath.Abs(blueprints)
	if err != nil {
		log.Fatalf("engineer web: bad --blueprints %q: %v", blueprints, err)
	}
	legacyAbs := ""
	if agents != "" {
		legacyAbs, err = filepath.Abs(agents)
		if err != nil {
			log.Fatalf("engineer web: bad --agents %q: %v", agents, err)
		}
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
	if err := http.Serve(ln, handler(abs, blueprintsAbs, legacyAbs, rt)); err != nil {
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

// sessionPages turns a session id into the blueprint slug whose directory is its
// page. The mapping is written once, by ai, when the session is created; log owns
// it, and this remembers the answer briefly so a page's burst of asset requests
// costs one lookup instead of one per file. Short-lived on purpose: deleting a
// conversation removes its log row, and the page must stop being served without
// waiting for the process to restart.
type sessionPages struct {
	logBase string
	mu      sync.Mutex
	seen    map[string]cachedSlug
}

type cachedSlug struct {
	slug string
	at   time.Time
}

// slugTTL is how long a resolved mapping is trusted. A page load is a handful of
// requests in a few milliseconds; anything older asks log again.
const slugTTL = 5 * time.Second

// sessionMeta is the part of log's session row this server reads.
type sessionMeta struct {
	SessionID string `yaml:"sessionId"`
	Kind      string `yaml:"kind"`
	Blueprint string `yaml:"blueprint"`
}

// slugFor asks log which blueprint this session was made from. "" means "this
// session has no page" (an unknown id, or main). An error means log could not
// answer — the caller turns that into a 502 instead of guessing a directory.
func (p *sessionPages) slugFor(sessionID string) (string, error) {
	p.mu.Lock()
	entry, ok := p.seen[sessionID]
	p.mu.Unlock()
	if ok && time.Since(entry.at) < slugTTL {
		return entry.slug, nil
	}

	body, err := json.Marshal(map[string]string{"sessionId": sessionID})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(p.logBase, "/")+"/log/session/detail",
		bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/yaml")
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return "", nil // no such session: not a page
	}
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("log /log/session/detail → HTTP %d", res.StatusCode)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	var meta sessionMeta
	if err := yaml.Unmarshal(raw, &meta); err != nil {
		return "", fmt.Errorf("log /log/session/detail: %v", err)
	}
	slug := strings.TrimSpace(meta.Blueprint)
	// The row is written from a request body, so the path it becomes is checked
	// here too: a slug that could escape the blueprint root is no page at all.
	if slug != "" && !blueprintSlug.MatchString(slug) {
		return "", nil
	}
	p.mu.Lock()
	p.seen[sessionID] = cachedSlug{slug: slug, at: time.Now()}
	p.mu.Unlock()
	return slug, nil
}

func handler(root, blueprints, legacyAgents string, rt runtimeConfig) http.Handler {
	index := filepath.Join(root, "index.html")
	pages := &sessionPages{logBase: rt.Log, seen: map[string]cachedSlug{}}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This is a local tool: its files change when the tool or the project does,
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

		// Two roots: /agent/<sessionId>/… is the blueprint the session was made
		// from, everything else the app's own assets. The session id is resolved
		// through log, never treated as a directory name: the URL carries the
		// conversation, not the class.
		base := root
		rel := urlPath
		if strings.HasPrefix(urlPath, agentPrefix) {
			rest := strings.TrimPrefix(urlPath, agentPrefix)
			slash := strings.Index(rest, "/")
			if slash < 0 {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			sessionID, tail := rest[:slash], rest[slash:]
			slug, err := pages.slugFor(sessionID)
			if err != nil {
				// Never fall back to the shell here: the shell drawn inside the
				// page's own frame would hide the cause, and a page that cannot be
				// resolved is not a page.
				http.Error(w, "engineer web: cannot resolve session: "+err.Error(), http.StatusBadGateway)
				return
			}
			if slug == "" {
				// Older sessions have no blueprint in log: their page is the copy
				// that was made for them. Serve it while it is there (the prefix
				// guard below still applies to whatever the id turns into).
				if legacyAgents == "" {
					w.WriteHeader(http.StatusNotFound)
					return
				}
				base = legacyAgents
				rel = "/" + sessionID + tail
			} else {
				base = blueprints
				rel = "/" + slug + tail
			}
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

func contentType(file string) string {
	if t, ok := types[filepath.Ext(file)]; ok {
		return t
	}
	return "application/octet-stream"
}
