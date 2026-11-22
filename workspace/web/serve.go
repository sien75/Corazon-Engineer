// Package web is the shell: the page the user opens, and nothing else.
//
// It serves the shell's own files (index.html, app.js, the chat element, the
// theme) and it forwards everything that belongs to a blueprint or to the
// projects to the blueprint service, which is the only service this one knows.
// That is the whole dependency rule of the split: web → blueprint, storage → its
// own database, ai → storage, blueprint → ai and storage. The shell page itself
// talks to ai and storage from the browser (the addresses come from /config.js);
// this process makes no such call. The one thing it reads on its own is the image
// store in the data home (/blobs/<sha256>): a picture is a file by a content
// address, and nobody has to be asked for it.
//
// It is not a program of its own: the engineer binary is a multi-call binary, and
// Serve is the entry point behind the `serve-web` subcommand:
//
//	engineer serve-web --bind <host> --port <n> --home <dir> --shell <dir>
//	                   --blueprint <url> --storage <url> --ai <url> --cwd <dir>
//
// Every flag is required and there is no fallback: a web server that invented an
// address would quietly point the page at a port nobody chose.
package web

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
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

const usage = "usage: engineer serve-web --bind <host> --port <n> --home <dir> --shell <dir> " +
	"--blueprint <url> --storage <url> --ai <url> --cwd <dir>"

type config struct {
	home      string // the data home: its uploads/ folder is the image store
	shell     string
	cwd       string
	storage   string
	ai        string
	blueprint string
}

// Serve runs the shell until it is killed. argv is the argument list following the
// subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	bind := ""
	port := 0
	cfg := config{}

	for i := 0; i < len(argv); i++ {
		next := func() string {
			if i+1 < len(argv) {
				i++
				return argv[i]
			}
			return ""
		}
		switch argv[i] {
		case "--bind":
			bind = next()
		case "--port":
			port, _ = strconv.Atoi(next())
		case "--home":
			cfg.home = next()
		case "--shell":
			cfg.shell = next()
		case "--blueprint":
			cfg.blueprint = next()
		case "--storage":
			cfg.storage = next()
		case "--ai":
			cfg.ai = next()
		case "--cwd":
			cfg.cwd = next()
		}
	}

	if bind == "" || port == 0 || cfg.home == "" || cfg.shell == "" || cfg.cwd == "" ||
		cfg.storage == "" || cfg.ai == "" || cfg.blueprint == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	shell, err := filepath.Abs(cfg.shell)
	if err != nil {
		log.Fatalf("engineer web: bad --shell %q: %v", cfg.shell, err)
	}
	if info, err := os.Stat(shell); err != nil || !info.IsDir() {
		log.Fatalf("engineer web: --shell is not a folder: %s", shell)
	}
	cfg.shell = shell
	cwd, err := filepath.Abs(cfg.cwd)
	if err != nil {
		log.Fatalf("engineer web: bad --cwd %q: %v", cfg.cwd, err)
	}
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		log.Fatalf("engineer web: --cwd is not a folder: %s", cwd)
	}
	cfg.cwd = cwd

	target, err := url.Parse(cfg.blueprint)
	if err != nil || target.Host == "" {
		log.Fatalf("engineer web: bad --blueprint %q: %v", cfg.blueprint, err)
	}

	addr := net.JoinHostPort(bind, strconv.Itoa(port))
	// Bind first, then announce: the banner must never claim a port we did not get.
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("engineer web: %v", err)
	}
	log.Printf("engineer web: http://%s:%d", displayHost(bind), port)
	if err := http.Serve(ln, handler(cfg, target)); err != nil {
		log.Fatalf("engineer web: %v", err)
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

func handler(cfg config, target *url.URL) http.Handler {
	index := filepath.Join(cfg.shell, "index.html")
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1 // streaming: a page and its events must not be buffered

	// blueprint handles these paths: the projects (one blueprints folder each) and
	// the blueprints of the front one, a blueprint's own page / events / op, its
	// client script, and the folder a blueprint with an ai node works in.
	blueprints := func(p string) bool {
		switch {
		case p == "/bp", p == "/bp-dev":
			return true
		case strings.HasPrefix(p, "/bp/"), strings.HasPrefix(p, "/bp-dev/"):
			return true
		case p == "/config/projects", p == "/config/projects/foreground", p == "/config/blueprints":
			return true
		case p == "/config/blueprints/folder":
			return true
		}
		return false
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// net/http has already percent-decoded the path.
		urlPath := r.URL.Path

		switch {
		case urlPath == "/favicon.ico":
			w.WriteHeader(http.StatusNotFound)
			return

		case urlPath == "/config.js":
			serveRuntimeConfig(w, cfg, target)
			return
		}

		if strings.HasPrefix(urlPath, blobsPrefix) {
			serveBlob(w, r, cfg.home)
			return
		}

		if blueprints(urlPath) {
			// A forwarded response carries its own headers: a blob's year-long
			// Cache-Control must not meet this shell's no-store on the way out.
			proxy.ServeHTTP(w, r)
			return
		}

		// The shell: the one page, at every other path. Its files change when the
		// tool does, and a cached app.js served next to a fresh index.html is a
		// broken shell.
		w.Header().Set("Cache-Control", "no-store")
		file := filepath.Join(cfg.shell, filepath.FromSlash(urlPath))
		if !strings.HasPrefix(file, cfg.shell) {
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

		html, err := os.ReadFile(index)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", types[".html"])
		w.Write(html)
	})
}

// blobsPrefix is the image store on this origin.
const blobsPrefix = "/blobs/"

// blobName is the only shape a blob request may have: one content address, 64 hex,
// no extension, no second segment.
var blobName = regexp.MustCompile(`^[0-9a-f]{64}$`)

var blobTypes = map[string]string{
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".webp": "image/webp", ".gif": "image/gif",
}

// serveBlob reads one picture out of <home>/uploads. The file is named
// <sha256>.<ext>, so the extension is looked up; a read only, there is no write
// route here.
func serveBlob(w http.ResponseWriter, r *http.Request, home string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodHead)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, blobsPrefix)
	if !blobName.MatchString(name) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	matches, _ := filepath.Glob(filepath.Join(home, "uploads", name+".*"))
	if len(matches) == 0 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	file := matches[0]
	ctype := blobTypes[strings.ToLower(filepath.Ext(file))]
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	// A blob never changes: its address is its content.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, file)
}

// runtimeConfig is what the shell page needs: the addresses it calls, the folder
// its conversation works in, and the projects it switches between — which are
// blueprints' answer, asked for here because the page must not know that service
// exists.
type runtimeConfig struct {
	Storage    string `json:"storage"`
	AI         string `json:"ai"`
	Cwd        string `json:"cwd"`
	Projects   []any  `json:"projects"`
	Foreground string `json:"foreground"`
}

func serveRuntimeConfig(w http.ResponseWriter, cfg config, target *url.URL) {
	out := runtimeConfig{Storage: cfg.storage, AI: cfg.ai, Cwd: cfg.cwd, Projects: []any{}}

	// The project list is read fresh on every page load: it is the one thing the
	// user changes while a page is open.
	res, err := http.Get(strings.TrimSuffix(cfg.blueprint, "/") + "/config/projects")
	if err == nil {
		defer res.Body.Close()
		var body struct {
			Projects   []any  `json:"projects"`
			Foreground string `json:"foreground"`
		}
		if data, readErr := io.ReadAll(io.LimitReader(res.Body, 1<<20)); readErr == nil {
			if json.Unmarshal(data, &body) == nil {
				if body.Projects != nil {
					out.Projects = body.Projects
				}
				out.Foreground = body.Foreground
			}
		}
	} else {
		// The shell still draws without projects: the corner says so, and the
		// project dialog reports the real error when the user tries to add one.
		log.Printf("engineer web: blueprint unreachable for the project list: %v", err)
	}

	// The list must be read fresh: it is the one thing a user changes while a page
	// is open.
	w.Header().Set("Cache-Control", "no-store")
	body, err := json.Marshal(out)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", types[".js"])
	// An ES module, not a classic script: the addresses are exported, so a page has
	// to import them — nothing lands on window.
	fmt.Fprintf(w, "export const ENGINEER = %s;\nexport default ENGINEER;\n", body)
}

func contentType(file string) string {
	if t, ok := types[filepath.Ext(file)]; ok {
		return t
	}
	return "application/octet-stream"
}
