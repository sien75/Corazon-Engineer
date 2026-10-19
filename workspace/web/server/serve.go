// Package server is the web frontend's file server.
//
// Serves the assets in workspace/web and generates /config.js carrying the
// addresses the launcher picked. It replaces the Bun version (serve.js): same
// CLI, same behaviour, minus the ~60 MB embedded JS runtime the old one paid
// for a program with no JS in it.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-web` subcommand:
//
//	engineer serve-web --bind <host> --port <n> --assets <dir> --agents <dir> --static <url> --ai <url> --log <url>
//
// Every flag is required and there is no fallback. The launcher owns the bind
// host (loopback unless ENGINEER_BIND opened the stack up), the port and the
// three runtime addresses; the frontend only ever reaches a service through the
// URLs served back as /config.js, so an invented default would point the page
// at a port nobody chose.
//
// --assets is the directory holding the frontend files (index.html, app.js,
// style.css). It is deliberately not called --root: the other three services
// take --root meaning the user's project, which is a different thing entirely.
//
// --agents is the second root, and the reason this server is multi-root: the
// agents' own copies of their blueprints (`<project>/.engineer/agents`) are
// served under `/agent/…`, while everything else comes from --assets. The path is
// a session id, not a slug, because instantiating a blueprint copies it into
// `.engineer/agents/<sessionId>/` — so what is served is the agent's copy and the
// prototype directory is never exposed. `--pages` (the old blueprint root) is
// gone: nothing is served straight out of `.agents/blueprints` any more.
//
// `/agent/<sessionId>` with no trailing slash is a directory on disk, so the
// lookup fails and the request falls through to the app shell; the iframe a pane
// holds asks for `/agent/<sessionId>/` and gets that agent's index.html.
package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
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
	"--agents <dir> --static <url> --ai <url> --log <url>"

// agentsPrefix is the URL prefix --agents is mounted at.
const agentsPrefix = "/agent/"

// Serve runs the web file server until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	bind := ""
	port := 0
	root := ""
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

	if bind == "" || port == 0 || root == "" || agents == "" || rt.Static == "" || rt.AI == "" || rt.Log == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --assets %q: %v", root, err)
	}
	// The agents root is allowed to be missing — before the first agent exists
	// there is no `.engineer/agents/` at all, and a request under /agent/… then
	// falls through to the shell — but it is still resolved, so the traversal
	// guard compares like with like.
	agentsAbs, err := filepath.Abs(agents)
	if err != nil {
		log.Fatalf("engineer web: bad --agents %q: %v", agents, err)
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
	if err := http.Serve(ln, handler(abs, agentsAbs, rt)); err != nil {
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

func handler(root, agents string, rt runtimeConfig) http.Handler {
	index := filepath.Join(root, "index.html")

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
			fmt.Fprintf(w, "window.ENGINEER = %s;\n", body)
			return
		}

		// Two roots: /agent/… is the agents' own copies of their blueprints,
		// everything else the app's own assets. The path is not rewritten — so
		// `/agent/<sessionId>/` on disk is that agent's index.html, and
		// `/agent/<sessionId>` (no slash) stays a directory that is never served
		// and falls through to the shell.
		base := root
		rel := urlPath
		if strings.HasPrefix(urlPath, agentsPrefix) {
			base = agents
			rel = "/" + strings.TrimPrefix(urlPath, agentsPrefix)
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

		// Under /agent/ there is no SPA: the copy either has the file or it does
		// not. Falling back to the shell would draw the shell inside the page's
		// own frame (an agent whose copy is gone is not a route).
		if strings.HasPrefix(urlPath, agentsPrefix) {
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
