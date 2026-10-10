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
//	engineer serve-web --bind <host> --port <n> --assets <dir> --pages <dir> --static <url> --ai <url> --log <url>
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
// --pages is the second root, and the reason this server is multi-root: the
// project's blueprints (`<project>/.agents/blueprints`) are served under
// `/pages/…`, while everything else comes from --assets. A page tab lives at
// `/pages/<id>` (no trailing slash) — a directory on disk, so the lookup fails
// and the request falls through to the app shell, which is the SPA route the tab
// renders; the iframe that tab holds asks for `/pages/<id>/` and gets the
// blueprint itself. A server that only knew --assets could not tell those two
// apart, and the web root is not handed the whole project for it either.
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
	"--pages <dir> --static <url> --ai <url> --log <url>"

// pagesPrefix is the URL prefix --pages is mounted at.
const pagesPrefix = "/pages/"

// Serve runs the web file server until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	bind := ""
	port := 0
	root := ""
	pages := ""
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
		case argv[i] == "--pages" && i+1 < len(argv):
			i++
			pages = argv[i]
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

	if bind == "" || port == 0 || root == "" || pages == "" || rt.Static == "" || rt.AI == "" || rt.Log == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --assets %q: %v", root, err)
	}
	// The blueprint root is allowed to be missing — a project with no blueprints
	// yields the shell for every /pages/… request, which is what an empty
	// launcher should show — but it is still resolved, so the traversal guard
	// compares like with like.
	pagesAbs, err := filepath.Abs(pages)
	if err != nil {
		log.Fatalf("engineer web: bad --pages %q: %v", pages, err)
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
	if err := http.Serve(ln, handler(abs, pagesAbs, rt)); err != nil {
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

func handler(root, pages string, rt runtimeConfig) http.Handler {
	index := filepath.Join(root, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		// Two roots: /pages/… is the project's blueprints, everything else the
		// app's own assets. The path is not rewritten — `/pages/<id>` (no
		// trailing slash) stays a directory, so it is never served and falls
		// through to the shell, where the SPA route renders that page in a tab.
		base := root
		rel := urlPath
		if strings.HasPrefix(urlPath, pagesPrefix) {
			base = pages
			rel = "/" + strings.TrimPrefix(urlPath, pagesPrefix)
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
