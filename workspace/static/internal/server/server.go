package server

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"engineer/static/internal/schema"

	"gopkg.in/yaml.v3"
)

type Server struct {
	root   string
	mux    *http.ServeMux
	broker *Broker
}

func New(root string) *Server {
	s := &Server{root: root, mux: http.NewServeMux(), broker: NewBroker()}
	s.mux.HandleFunc("POST /static/query", s.handleSchemaQuery)
	s.mux.HandleFunc("POST /static/query-detail", s.handleSchemaQueryDetail)
	s.mux.HandleFunc("POST /static/validate", s.handleValidate)
	s.mux.HandleFunc("POST /static/stream", s.handleEvent)
	return s
}

func (s *Server) Listen(addr string) error {
	go s.watch()
	return http.ListenAndServe(addr, cors(s.mux))
}

// cors allows browser frontends on any origin to call the atomic APIs.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- helpers ----------

// The static API speaks YAML on the wire (application/yaml).

func writeYAMLResp(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(status)
	data, err := yaml.Marshal(v)
	if err != nil {
		return
	}
	_, _ = w.Write(data)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeYAMLResp(w, status, map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
}

func decode(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	if r.Body == nil || r.ContentLength == 0 {
		return true
	}
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid body: "+err.Error())
		return false
	}
	if err := yaml.Unmarshal(data, v); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid yaml body: "+err.Error())
		return false
	}
	return true
}

// safePath resolves a relative id under root and rejects path escapes.
func (s *Server) safePath(id string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(id))
	if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return "", fmt.Errorf("invalid path %q", id)
	}
	for _, seg := range strings.Split(clean, string(filepath.Separator)) {
		if strings.HasPrefix(seg, ".") {
			return "", fmt.Errorf("invalid path %q: dot-prefixed entries are not content", id)
		}
	}
	return filepath.Join(s.root, clean), nil
}

// ---------- static-query ----------

func (s *Server) handleSchemaQuery(w http.ResponseWriter, r *http.Request) {
	atoms, err := schema.LoadAtoms(s.root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	edges, err := schema.LoadEdges(s.root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"atoms":     atoms,
		"edges":     edges,
		"runtime":   schema.ListEntries(s.root, "runtime"),
		"contracts": schema.ListEntries(s.root, "contracts"),
		"devtime":   schema.ListEntries(s.root, "devtime"),
		"docs":      schema.ListEntries(s.root, "docs"),
		"notes":     schema.ListEntries(s.root, "notes"),
	})
}

// ---------- static-query-detail ----------

func (s *Server) handleSchemaQueryDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string `yaml:"type"`
		ID   string `yaml:"id"`
	}
	if !decode(w, r, &req) {
		return
	}
	if !containsStr([]string{"runtime", "devtime", "contract", "docs", "notes"}, req.Type) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid type: "+req.Type)
		return
	}
	if req.ID == "" || !strings.HasPrefix(req.ID, schema.TypeDirs[req.Type]+"/") {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid id: "+req.ID)
		return
	}
	path, err := s.safePath(req.ID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	resp := map[string]interface{}{"type": req.Type, "id": req.ID}
	switch req.Type {
	case "contract":
		doc, err := schema.LoadContractFile(s.root, req.ID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "contract not found: "+req.ID)
			return
		}
		resp["contract"] = doc
	default: // runtime, devtime, docs, notes — raw text
		data, err := os.ReadFile(path)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "file not found: "+req.ID)
			return
		}
		resp[req.Type] = string(data)
	}
	writeYAMLResp(w, http.StatusOK, resp)
}

// ---------- static-validate ----------

// handleValidate validates the whole schema tree (atoms / edges / contracts)
// and returns every field-level error. Read-only; no side effects.
func (s *Server) handleValidate(w http.ResponseWriter, r *http.Request) {
	errs := schema.ValidateTree(s.root)
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"ok":     len(errs) == 0,
		"errors": errs,
	})
}

// ---------- file watcher (feeds static-stream) ----------

type fileStamp struct {
	size int64
	mod  int64
}

// watch polls the schema tree and publishes a schema event whenever a content
// file is added, changed or removed. Polling (rather than an inotify/kqueue
// library) keeps the service dependency-free and is robust to editors that swap
// files via rename and to files created inside new subdirectories.
func (s *Server) watch() {
	const interval = 1 * time.Second
	prev := s.snapshot()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		cur := s.snapshot()
		for rel, stamp := range cur {
			old, existed := prev[rel]
			if !existed {
				s.publishSchema("add", rel)
			} else if old != stamp {
				s.publishSchema("update", rel)
			}
		}
		for rel := range prev {
			if _, ok := cur[rel]; !ok {
				s.publishSchema("remove", rel)
			}
		}
		prev = cur
	}
}

// snapshot maps every content file (relative path) to its size + mod time.
func (s *Server) snapshot() map[string]fileStamp {
	out := map[string]fileStamp{}
	for _, dir := range schema.TypeDirs {
		for _, rel := range schema.ListEntries(s.root, dir) {
			info, err := os.Stat(filepath.Join(s.root, filepath.FromSlash(rel)))
			if err != nil {
				continue
			}
			out[rel] = fileStamp{size: info.Size(), mod: info.ModTime().UnixNano()}
		}
	}
	return out
}

// publishSchema emits one schema event for a changed content file.
func (s *Server) publishSchema(op, rel string) {
	typ := contentType(rel)
	if typ == "" {
		return
	}
	s.broker.Publish(SchemaEvent{
		Kind:    "schema",
		Op:      op,
		Type:    typ,
		ID:      rel,
		File:    rel,
		Content: s.eventContent(typ, rel),
	})
}

// contentType maps a relative path's leading directory to its object type.
func contentType(rel string) string {
	dir := rel
	if i := strings.IndexByte(rel, '/'); i >= 0 {
		dir = rel[:i]
	}
	for typ, d := range schema.TypeDirs {
		if d == dir {
			return typ
		}
	}
	return ""
}

// eventContent loads a changed file in the shape the stream contract declares:
// atoms / edges / contracts as parsed objects, prose types as raw text. A
// removed file yields nil.
func (s *Server) eventContent(typ, rel string) interface{} {
	data, err := os.ReadFile(filepath.Join(s.root, filepath.FromSlash(rel)))
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
		Kinds string `yaml:"kinds"`
		Edges string `yaml:"edges"`
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

	sub := s.broker.Subscribe()
	defer s.broker.Unsubscribe(sub)
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
			seq++
			payload := map[string]interface{}{
				"seq": seq,
				"ts":  time.Now().UTC().Format(time.RFC3339),
				"kind": ev.Kind,
				"payload": map[string]interface{}{
					"op":    ev.Op,
					"type":  ev.Type,
					"id":    ev.ID,
					"file":  ev.File,
					ev.Type: ev.Content,
				},
			}
			data, err := yaml.Marshal(payload)
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

// ---------- broker ----------

type SchemaEvent struct {
	Kind    string
	Op      string
	Type    string
	ID      string
	File    string
	Content interface{}
}

type Broker struct {
	mu   sync.Mutex
	subs []chan SchemaEvent
}

func NewBroker() *Broker { return &Broker{} }

func (b *Broker) Subscribe() chan SchemaEvent {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan SchemaEvent, 64)
	b.subs = append(b.subs, ch)
	return ch
}

func (b *Broker) Unsubscribe(ch chan SchemaEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, s := range b.subs {
		if s == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *Broker) Publish(ev SchemaEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
