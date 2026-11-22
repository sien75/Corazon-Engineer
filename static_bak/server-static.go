// static.go is the file-tree half of the storage service: it reads the schema
// (atoms / edges / contracts) and the other content files out of a folder and
// serves them over the /static/* routes.
//
// Which folder a request means is the absolute `path` its body carries. The
// service keeps no board of projects: there is no id to resolve, nothing to look
// up, and no other process to ask.
//
// The service does not validate the tree: a malformed atom or a dangling edge is
// not its business. Writes go through the ai shell.

package server

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"engineer/storage/internal/schema"

	"gopkg.in/yaml.v3"
)

// root is the request's folder, or the reason there is none: the caller writes
// the error and stops. The path must be absolute (a relative one would name
// whatever folder the service happens to run in) and must exist.
func resolveRoot(w http.ResponseWriter, path string) (string, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "path missing")
		return "", false
	}
	if !filepath.IsAbs(path) {
		writeErr(w, http.StatusBadRequest, "bad_request", "path must be absolute: "+path)
		return "", false
	}
	dir := filepath.Clean(path)
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		writeErr(w, http.StatusNotFound, "not_found", "no such folder "+path)
		return "", false
	}
	return dir, true
}

// safePath resolves a relative id under root and rejects path escapes. The id
// must sit under a registered type directory; only that leading directory may
// be dot-prefixed (.agents/skills, .engineer/suggested-skills, ...). Inside it,
// dot-prefixed entries are still not content.
func safePath(root, id string) (string, error) {
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(id)))
	if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("invalid path %q", id)
	}
	dir := schema.TypeDirOf(clean)
	if dir == "" {
		return "", fmt.Errorf("invalid path %q: not under a known type directory", id)
	}
	rest := strings.TrimPrefix(strings.TrimPrefix(clean, dir), "/")
	if rest == "" {
		return "", fmt.Errorf("invalid path %q", id)
	}
	for _, seg := range strings.Split(rest, "/") {
		if seg == "" || strings.HasPrefix(seg, ".") {
			return "", fmt.Errorf("invalid path %q: dot-prefixed entries are not content", id)
		}
	}
	return filepath.Join(root, filepath.FromSlash(clean)), nil
}

// ---------- static-query ----------

func (s *Server) handleSchemaQuery(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `yaml:"path"`
	}
	if !decode(w, r, &req) {
		return
	}
	root, ok := resolveRoot(w, req.Path)
	if !ok {
		return
	}
	atoms, err := schema.LoadAtoms(root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	edges, err := schema.LoadEdges(root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"atoms":       atoms,
		"edges":       edges,
		"how-to":      schema.ListEntries(root, "how-to"),
		"contracts":   schema.ListEntries(root, schema.TypeDirs["contract"]),
		"development": schema.ListEntries(root, "development"),
		"docs":        schema.ListEntries(root, schema.TypeDirs["docs"]),
		"humanwrite":  schema.ListEntries(root, schema.TypeDirs["humanwrite"]),
		"skills":      schema.ListEntries(root, schema.TypeDirs["skill"]),
		"blueprints":  schema.ListEntries(root, schema.TypeDirs["blueprint"]),
	})
}

// ---------- static-query-detail ----------

func (s *Server) handleSchemaQueryDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string `yaml:"type"`
		ID   string `yaml:"id"`
		Path string `yaml:"path"`
	}
	if !decode(w, r, &req) {
		return
	}
	if !containsStr(schema.LeafTypes, req.Type) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid type: "+req.Type)
		return
	}
	if req.ID == "" || !strings.HasPrefix(req.ID, schema.TypeDirs[req.Type]+"/") {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid id: "+req.ID)
		return
	}
	// The id must be the type it is asked for. Without this check a path that
	// traverses out of one type directory and into another (`.agents/blueprints/x/
	// ../skills/y/SKILL.md`) would be read and returned under the wrong type — the
	// file is inside the project either way, but the caller asked for a blueprint.
	// Compare on the *cleaned* path: TypeOf matches prefixes of the string it is
	// given, so `.agents/blueprints/../skills/x/SKILL.md` would still read as a
	// blueprint before cleaning.
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(req.ID)))
	if own := schema.TypeOf(clean); own != req.Type {
		writeErr(w, http.StatusBadRequest, "bad_request",
			fmt.Sprintf("invalid id %q: it is a %s file, not a %s", req.ID, own, req.Type))
		return
	}
	root, ok := resolveRoot(w, req.Path)
	if !ok {
		return
	}
	path, err := safePath(root, req.ID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	resp := map[string]interface{}{"type": req.Type, "id": req.ID}
	switch req.Type {
	case "contract":
		doc, err := schema.LoadContractFile(root, req.ID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "contract not found: "+req.ID)
			return
		}
		resp["contract"] = doc
	default: // how-to, development, docs, humanwrite — raw text
		data, err := os.ReadFile(path)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "file not found: "+req.ID)
			return
		}
		resp[req.Type] = string(data)
	}
	writeYAMLResp(w, http.StatusOK, resp)
}

// ---------- file watcher (feeds static-stream) ----------

type fileStamp struct {
	size int64
	mod  int64
}

// snapshot maps every content file of one folder (relative path) to its size and
// mod time. Polling (rather than an inotify/kqueue library) keeps the service
// dependency-free and is robust to editors that swap files via rename and to
// files created inside new subdirectories.
func snapshot(root string) map[string]fileStamp {
	out := map[string]fileStamp{}
	for _, dir := range schema.TypeDirs {
		for _, rel := range schema.ListEntries(root, dir) {
			info, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel)))
			if err != nil {
				continue
			}
			out[rel] = fileStamp{size: info.Size(), mod: info.ModTime().UnixNano()}
		}
	}
	return out
}

// eventContent loads a changed file in the shape the stream contract declares:
// atoms / edges / contracts as parsed objects, prose types as raw text. A
// removed file yields nil.
func eventContent(root, typ, rel string) interface{} {
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil
	}
	switch typ {
	case "atom", "edge":
		var doc map[string]interface{}
		if yaml.Unmarshal(data, &doc) != nil {
			return nil
		}
		if list, ok := doc[typ+"s"].([]interface{}); ok && len(list) > 0 {
			return list[0]
		}
		return nil
	case "contract":
		var doc map[string]interface{}
		if yaml.Unmarshal(data, &doc) != nil {
			return nil
		}
		return doc
	default:
		return string(data)
	}
}

// ---------- event (SSE) ----------

// handleEvent watches one folder for as long as the connection is open. The
// folder is the request's own `path`: there is no board to watch on the server's
// behalf, so a subscriber names what it wants and gets events for exactly that.
func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path  string `yaml:"path"`
		Kinds string `yaml:"kinds"`
		Edges string `yaml:"edges"`
	}
	if !decode(w, r, &req) {
		return
	}
	root, ok := resolveRoot(w, req.Path)
	if !ok {
		return
	}
	kinds := map[string]bool{}
	if req.Kinds != "" {
		for _, k := range strings.Split(req.Kinds, ",") {
			kinds[strings.TrimSpace(k)] = true
		}
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "internal", "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush() // send headers immediately so the connection establishes at once

	poll := time.NewTicker(1 * time.Second)
	defer poll.Stop()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	// The first tick only records the baseline: a subscriber is told what changed
	// while it listened, not what was already there.
	prev := snapshot(root)
	seq := 0
	send := func(op, typ, rel string) bool {
		seq++
		payload := map[string]interface{}{
			"seq":  seq,
			"ts":   time.Now().UTC().Format(time.RFC3339),
			"kind": "schema",
			"payload": map[string]interface{}{
				"op":   op,
				"type": typ,
				"id":   rel,
				"file": rel,
				typ:    eventContent(root, typ, rel),
			},
		}
		data, err := marshalYAML(payload)
		if err != nil {
			return true
		}
		// SSE carries multi-line yaml as one "data:" line per yaml line;
		// the client joins them back before parsing (per SSE spec)
		for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
			fmt.Fprintf(w, "data: %s\n", line)
		}
		fmt.Fprint(w, "\n")
		flusher.Flush()
		return true
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case <-poll.C:
			cur := snapshot(root)
			for rel, stamp := range cur {
				typ := schema.TypeOf(rel)
				if typ == "" || (len(kinds) > 0 && !kinds["schema"]) {
					continue
				}
				old, existed := prev[rel]
				switch {
				case !existed:
					send("add", typ, rel)
				case old != stamp:
					send("update", typ, rel)
				}
			}
			for rel := range prev {
				if _, still := cur[rel]; still {
					continue
				}
				typ := schema.TypeOf(rel)
				if typ == "" || (len(kinds) > 0 && !kinds["schema"]) {
					continue
				}
				send("remove", typ, rel)
			}
			prev = cur
		}
	}
}

func containsStr(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
