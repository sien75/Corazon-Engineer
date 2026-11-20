// Package web is the frontend's file server: it serves the app assets, generates
// /config.js carrying the addresses the launcher picked, mirrors the ai service's
// image store on this same origin, and hands every path that is not a file back to
// the app shell.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-web` subcommand:
//
//	engineer serve-web --bind <host> --port <n> --assets <dir> --cwd <dir>
//	                  --storage <url> --ai <url>
//
// Every flag is required and there is no fallback: an invented default silently
// binds a port nobody chose.
//
// The shell is one conversation and a theme switch. --cwd is the folder that
// conversation's agent works in — the page reads it from /config.js and passes it
// to /ai/new — and it is the only thing this server knows about where the work
// happens. There is no project board: a folder is an argument, not a record.
package web

import (
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
)

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

// The addresses and the folder a page needs to run one conversation. storage
// carries both prefixes — /log/* for records and sessions, /static/* for a
// folder's files — so there is one address, not two.
type runtimeConfig struct {
	Storage string `json:"storage"`
	AI      string `json:"ai"`
	Cwd     string `json:"cwd"`
}

const usage = "usage: engineer serve-web --bind <host> --port <n> --assets <dir> " +
	"--cwd <dir> --storage <url> --ai <url>"

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
		case argv[i] == "--cwd" && i+1 < len(argv):
			i++
			rt.Cwd = argv[i]
		case argv[i] == "--storage" && i+1 < len(argv):
			i++
			rt.Storage = argv[i]
		case argv[i] == "--ai" && i+1 < len(argv):
			i++
			rt.AI = argv[i]
		}
	}

	if bind == "" || port == 0 || root == "" || rt.Cwd == "" || rt.Storage == "" || rt.AI == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	abs, err := filepath.Abs(root)
	if err != nil {
		log.Fatalf("engineer web: bad --assets %q: %v", root, err)
	}
	cwd, err := filepath.Abs(rt.Cwd)
	if err != nil {
		log.Fatalf("engineer web: bad --cwd %q: %v", rt.Cwd, err)
	}
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		log.Fatalf("engineer web: --cwd is not a folder: %s", cwd)
	}
	rt.Cwd = cwd

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

func handler(assets string, rt runtimeConfig) http.Handler {
	index := filepath.Join(assets, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// This is a local tool: its files change when the tool does, and a cached
		// app.js served next to a fresh index.html is a broken shell. Never store
		// anything the shell loads.
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

		file := filepath.Join(assets, filepath.FromSlash(urlPath))
		if !strings.HasPrefix(file, assets) {
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

		// Anything not on disk is the app shell: the shell has one page, and every
		// path is it.
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

var blobsClient = &http.Client{}

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
