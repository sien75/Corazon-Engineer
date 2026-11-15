// static.go is the project-tree half of the storage service: it reads the schema
// (atoms / edges / contracts) and the other content files out of a project folder
// and serves them over the /static/* routes.
//
// Which folder a request means is not an argument: it is the projectId the body
// carries, resolved through this process's own store. That is the whole point of
// storing records and files in one service — the project board is a table here, so
// resolving it is a query, not an HTTP call to another process with a cache in
// front of it.
//
// The service does not validate the tree: a malformed atom or a dangling edge is
// not its business. Writes go through the ai shell.

package server

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"engineer/storage/internal/schema"

	"gopkg.in/yaml.v3"
)

// projectDir resolves a project id to its folder. ok is false when the id names no
// project — the caller turns that into its own 404.
func (s *Server) projectDir(projectID string) (string, bool, error) {
	p, err := s.store.GetProject(projectID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	path := strings.TrimSpace(p.Path)
	if path == "" {
		return "", false, nil
	}
	return path, true, nil
}

// root is the request's project directory, or the reason there is none: the
// caller writes the error and stops.
func (s *Server) root(w http.ResponseWriter, projectID string) (string, bool) {
	if strings.TrimSpace(projectID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "projectId missing")
		return "", false
	}
	path, ok, err := s.projectDir(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", "cannot resolve project: "+err.Error())
		return "", false
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "no project "+projectID)
		return "", false
	}
	return path, true
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
		ProjectID string `yaml:"projectId"`
	}
	if !decode(w, r, &req) {
		return
	}
	root, ok := s.root(w, req.ProjectID)
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
		Type      string `yaml:"type"`
		ID        string `yaml:"id"`
		ProjectID string `yaml:"projectId"`
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
	root, ok := s.root(w, req.ProjectID)
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

// watch polls the schema tree of every project on the board and publishes a
// schema event whenever a content file is added, changed or removed. Polling
// (rather than an inotify/kqueue library) keeps the service dependency-free and
// is robust to editors that swap files via rename and to files created inside
// new subdirectories.
//
// The board changes while it runs (a project is added, removed, or its folder
// moves), so the project list is re-read each tick — from the store, which is
// this process's own table. A tick where the store cannot be read is skipped
// rather than diffed against an empty board — that would publish a remove for
// every file in every project.
func (s *Server) watch() {
	const interval = 1 * time.Second
	prev := map[string]fileStamp{}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		projects, err := s.projects()
		if err != nil {
			continue
		}
		cur := s.snapshot(projects)
		for key, stamp := range cur {
			old, existed := prev[key]
			if !existed {
				s.publishSchema(projectOf(key), "add", relOf(key))
			} else if old != stamp {
				s.publishSchema(projectOf(key), "update", relOf(key))
			}
		}
		for key := range prev {
			if _, ok := cur[key]; !ok {
				s.publishSchema(projectOf(key), "remove", relOf(key))
			}
		}
		prev = cur
	}
}

// projects is the board, as the file watcher needs it: id and folder.
func (s *Server) projects() ([]struct{ ID, Path string }, error) {
	list, err := s.store.ListProjects()
	if err != nil {
		return nil, err
	}
	out := make([]struct{ ID, Path string }, 0, len(list))
	for _, p := range list {
		out = append(out, struct{ ID, Path string }{ID: p.ProjectID, Path: p.Path})
	}
	return out, nil
}

// snapshot maps every content file of every project (projectId + relative path)
// to its size + mod time. A project whose folder is gone simply contributes
// nothing, which reads as "its files were removed" — the honest answer.
func (s *Server) snapshot(projects []struct{ ID, Path string }) map[string]fileStamp {
	out := map[string]fileStamp{}
	for _, p := range projects {
		for _, dir := range schema.TypeDirs {
			for _, rel := range schema.ListEntries(p.Path, dir) {
				info, err := os.Stat(filepath.Join(p.Path, filepath.FromSlash(rel)))
				if err != nil {
					continue
				}
				out[p.ID+"\x00"+rel] = fileStamp{size: info.Size(), mod: info.ModTime().UnixNano()}
			}
		}
	}
	return out
}

func projectOf(key string) string {
	if i := strings.IndexByte(key, 0); i >= 0 {
		return key[:i]
	}
	return ""
}

func relOf(key string) string {
	if i := strings.IndexByte(key, 0); i >= 0 {
		return key[i+1:]
	}
	return key
}

// publishSchema emits one schema event for a changed content file.
func (s *Server) publishSchema(projectID, op, rel string) {
	typ := contentType(rel)
	if typ == "" {
		return
	}
	s.schema.Publish(SchemaEvent{
		Kind:      "schema",
		ProjectID: projectID,
		Op:        op,
		Type:      typ,
		ID:        rel,
		File:      rel,
		Content:   s.eventContent(projectID, typ, rel),
	})
}

// contentType maps a relative path to its object type via the registered type
// directories; the longest match wins, so two-segment dirs (.agents/skills)
// resolve correctly.
func contentType(rel string) string {
	return schema.TypeOf(rel)
}

// eventContent loads a changed file in the shape the stream contract declares:
// atoms / edges / contracts as parsed objects, prose types as raw text. A
// removed file yields nil.
func (s *Server) eventContent(projectID, typ, rel string) interface{} {
	root, ok, err := s.projectDir(projectID)
	if err != nil || !ok {
		return nil
	}
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

func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kinds     string `yaml:"kinds"`
		Edges     string `yaml:"edges"`
		ProjectID string `yaml:"projectId"` // optional: only this project's events
	}
	if !decode(w, r, &req) {
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

	sub := s.schema.Subscribe()
	defer s.schema.Unsubscribe(sub)
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	seq := 0
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case ev := <-sub:
			if len(kinds) > 0 && !kinds[ev.Kind] {
				continue
			}
			if req.ProjectID != "" && ev.ProjectID != req.ProjectID {
				continue
			}
			seq++
			payload := map[string]interface{}{
				"seq":  seq,
				"ts":   time.Now().UTC().Format(time.RFC3339),
				"kind": ev.Kind,
				"payload": map[string]interface{}{
					"projectId": ev.ProjectID,
					"op":        ev.Op,
					"type":      ev.Type,
					"id":        ev.ID,
					"file":      ev.File,
					ev.Type:     ev.Content,
				},
			}
			data, err := marshalYAML(payload)
			if err != nil {
				continue
			}
			// SSE carries multi-line yaml as one "data:" line per yaml line;
			// the client joins them back before parsing (per SSE spec)
			for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
				fmt.Fprintf(w, "data: %s\n", line)
			}
			fmt.Fprint(w, "\n")
			flusher.Flush()
		}
	}
}

// ---------- schema broker ----------

// SchemaEvent is one change in a project's file tree.
type SchemaEvent struct {
	Kind      string
	ProjectID string
	Op        string
	Type      string
	ID        string
	File      string
	Content   interface{}
}

// schemaBroker fans file-tree changes out to the open /static/stream connections.
// It is the schema half of the service's two brokers (the record stream has its
// own, in server.go).
type schemaBroker struct {
	mu   sync.Mutex
	subs []chan SchemaEvent
}

func NewSchemaBroker() *schemaBroker { return &schemaBroker{} }

func (b *schemaBroker) Subscribe() chan SchemaEvent {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan SchemaEvent, 64)
	b.subs = append(b.subs, ch)
	return ch
}

func (b *schemaBroker) Unsubscribe(ch chan SchemaEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, s := range b.subs {
		if s == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *schemaBroker) Publish(ev SchemaEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}