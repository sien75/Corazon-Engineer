// corazon web — the web frontend's file server.
//
// Serves the assets in workspace/web and generates /config.js carrying the
// addresses the launcher picked. It replaces the Bun version (serve.js): same
// CLI, same behaviour, minus the ~60 MB embedded JS runtime the old one paid
// for a program with no JS in it.
//
// args: [port] [--root <dir>] [--static <url>] [--ai <url>] [--log <url>]
//
// --root defaults to the directory holding this binary. The three *-url flags
// are the runtime addresses the frontend should call; the launcher (which owns
// port selection) hands them down here and they are served back as /config.js.
package main

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

func main() {
	port := 7500
	root := ""
	rt := runtimeConfig{
		Static: "http://localhost:7502",
		AI:     "http://localhost:7501",
		Log:    "http://localhost:7503",
	}

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--root" && i+1 < len(args):
			i++
			root = args[i]
		case args[i] == "--static" && i+1 < len(args):
			i++
			rt.Static = args[i]
		case args[i] == "--ai" && i+1 < len(args):
			i++
			rt.AI = args[i]
		case args[i] == "--log" && i+1 < len(args):
			i++
			rt.Log = args[i]
		case isDigits(args[i]):
			port, _ = strconv.Atoi(args[i])
		}
	}

	if root == "" {
		exe, err := os.Executable()
		if err != nil {
			log.Fatalf("corazon web: cannot locate the binary: %v", err)
		}
		root = filepath.Dir(exe)
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("corazon web: bad --root %q: %v", root, err)
	}

	addr := ":" + strconv.Itoa(port)
	// Bind first, then announce: the banner must never claim a port we did not
	// get. A second instance on a taken port has to fail loudly here instead of
	// logging a URL that belongs to somebody else's process.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("corazon web: %v", err)
	}
	log.Printf("corazon web: http://localhost:%d", port)
	if err := http.Serve(ln, handler(abs, rt)); err != nil {
		log.Fatalf("corazon web: %v", err)
	}
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
			fmt.Fprintf(w, "window.CORAZON = %s;\n", body)
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
