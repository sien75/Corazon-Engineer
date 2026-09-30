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
//	engineer serve-web [port] [--bind <host>] [--root <dir>] [--static <url>] [--ai <url>] [--log <url>]
//
// --bind is the host the server listens on; it defaults to loopback, so the
// server is local-only unless the launcher was told to open the stack up
// (ENGINEER_BIND).
//
// --root defaults to the directory holding the binary. The three *-url flags
// are the runtime addresses the frontend should call; the launcher (which owns
// port selection) hands them down here and they are served back as /config.js.
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

// Serve runs the web file server until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	port := 7500
	bind := "127.0.0.1"
	root := ""
	rt := runtimeConfig{
		Static: "http://localhost:7502",
		AI:     "http://localhost:7501",
		Log:    "http://localhost:7503",
	}

	for i := 0; i < len(argv); i++ {
		switch {
		case argv[i] == "--bind" && i+1 < len(argv):
			i++
			bind = argv[i]
		case argv[i] == "--root" && i+1 < len(argv):
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
		case isDigits(argv[i]):
			port, _ = strconv.Atoi(argv[i])
		}
	}

	if root == "" {
		exe, err := os.Executable()
		if err != nil {
			log.Fatalf("engineer web: cannot locate the binary: %v", err)
		}
		root = filepath.Dir(exe)
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --root %q: %v", root, err)
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

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func handler(root string, rt runtimeConfig) http.Handler {
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

		file := filepath.Join(root, filepath.FromSlash(urlPath))
		if !strings.HasPrefix(file, root) {
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
