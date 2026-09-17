package server

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"corazon/static/internal/schema"

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
	s.mux.HandleFunc("POST /static/mutation", s.handleSchemaMutation)
	s.mux.HandleFunc("POST /static/search", s.handleSearch)
	s.mux.HandleFunc("POST /static/stream", s.handleEvent)
	return s
}

func (s *Server) Listen(addr string) error {
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
	var req struct {
		Env string `yaml:"env"`
	}
	if !decode(w, r, &req) {
		return
	}
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
	var runtimeEntries []string
	all := schema.ListEntries(s.root, "runtime")
	if req.Env != "" {
		if !containsStr(schema.RuntimeEnvs(s.root), req.Env) {
			writeErr(w, http.StatusNotFound, "not_found", "runtime env not found: "+req.Env)
			return
		}
		// runtime content is a plain file tree; env filter keeps only that env's
		// cookbooks/[env]/ and tests/[env]/ subtrees.
		for _, p := range all {
			if strings.HasPrefix(p, "runtime/cookbooks/"+req.Env+"/") ||
				strings.HasPrefix(p, "runtime/tests/"+req.Env+"/") {
				runtimeEntries = append(runtimeEntries, p)
			}
		}
	} else {
		runtimeEntries = all
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"atoms":     atoms,
		"edges":     edges,
		"runtime":   runtimeEntries,
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

// ---------- static-mutation ----------

func (s *Server) handleSchemaMutation(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if !decode(w, r, &req) {
		return
	}
	op, _ := req["op"].(string)
	objType, _ := req["type"].(string)
	id, _ := req["id"].(string)
	if !containsStr([]string{"add", "update", "remove"}, op) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid op: "+op)
		return
	}
	if !containsStr(schema.ObjectTypes, objType) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid type: "+objType)
		return
	}
	body, _ := req[objType].(map[string]interface{})
	rawStr, isRaw := req[objType].(string)
	// raw-content types take a string body
	rawType := objType == "runtime" || objType == "devtime" || objType == "docs" || objType == "notes"

	if op != "remove" {
		if isRaw != rawType {
			writeErr(w, http.StatusBadRequest, "bad_request", "field "+objType+" has wrong shape for its type")
			return
		}
		if !isRaw && body == nil {
			writeErr(w, http.StatusBadRequest, "bad_request", "missing field: "+objType)
			return
		}
		if !isRaw {
			if errs := schema.Validate(objType, body); len(errs) > 0 {
				writeYAMLResp(w, http.StatusUnprocessableEntity, map[string]interface{}{
					"error": map[string]interface{}{
						"code":    "validation_failed",
						"message": "content does not conform to the type's format conventions; file NOT written",
					},
					"errors": errs,
				})
				return
			}
		}
	}

	if id == "" && op == "add" {
		id = generateID(objType, body)
	}
	if id == "" || !strings.HasPrefix(id, schema.TypeDirs[objType]+"/") {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid id: "+id)
		return
	}
	path, err := s.safePath(id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	_, statErr := os.Stat(path)
	exists := statErr == nil

	switch op {
	case "add":
		if exists {
			writeErr(w, http.StatusBadRequest, "bad_request", "object already exists: "+id)
			return
		}
		if err := s.writeObject(objType, path, id, body, rawStr); err != nil {
			writeErr(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	case "update":
		if !exists {
			writeErr(w, http.StatusNotFound, "not_found", "object not found: "+id)
			return
		}
		if err := s.writeObject(objType, path, id, body, rawStr); err != nil {
			writeErr(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	case "remove":
		if !exists {
			writeErr(w, http.StatusNotFound, "not_found", "object not found: "+id)
			return
		}
		if err := os.Remove(path); err != nil {
			writeErr(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	}

	s.broker.Publish(SchemaEvent{
		Kind:    "schema",
		Op:      op,
		Type:    objType,
		ID:      id,
		File:    id,
		Content: req[objType],
	})
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"op": op, "type": objType, "id": id, "file": id,
	})
}

func generateID(objType string, body map[string]interface{}) string {
	dir := schema.TypeDirs[objType]
	name := "unnamed"
	if body != nil {
		if n, ok := body["name"].(string); ok && n != "" {
			name = n
		} else if n, ok := body["id"].(string); ok && n != "" {
			name = n
		}
	}
	ext := ".yaml"
	if objType == "runtime" || objType == "devtime" || objType == "docs" || objType == "notes" {
		ext = ".md"
	}
	return dir + "/" + name + ext
}

func (s *Server) writeObject(objType, path, id string, body map[string]interface{}, raw string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	switch objType {
	case "atom":
		return writeYAML(path, map[string]interface{}{"atoms": []interface{}{body}})
	case "edge":
		return writeYAML(path, map[string]interface{}{"edges": []interface{}{body}})
	case "contract":
		return writeYAML(path, body)
	default: // runtime, devtime, docs, notes — raw content
		return os.WriteFile(path, []byte(raw), 0o644)
	}
}

func writeYAML(path string, v interface{}) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// ---------- search ----------

var searchDirs = map[string]string{
	"atoms": "atom", "edges": "edge", "runtime": "runtime", "contracts": "contract",
	"devtime": "devtime", "docs": "docs", "notes": "notes",
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Q string `yaml:"q"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Q) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "q missing or empty")
		return
	}
	q := strings.ToLower(req.Q)
	type result struct {
		Type    string `yaml:"type"`
		File    string `yaml:"file"`
		Lines   [2]int `yaml:"lines"`
		Snippet string `yaml:"snippet"`
	}
	results := []result{}
	dirs := make([]string, 0, len(searchDirs))
	for d := range searchDirs {
		dirs = append(dirs, d)
	}
	sort.Strings(dirs)
	for _, dir := range dirs {
		for _, rel := range schema.ListEntries(s.root, dir) {
			if len(results) >= 50 {
				break
			}
			data, err := os.ReadFile(filepath.Join(s.root, filepath.FromSlash(rel)))
			if err != nil {
				continue
			}
			for i, line := range strings.Split(string(data), "\n") {
				if strings.Contains(strings.ToLower(line), q) {
					results = append(results, result{
						Type:    searchDirs[dir],
						File:    rel,
						Lines:   [2]int{i + 1, i + 1},
						Snippet: strings.TrimSpace(line),
					})
					if len(results) >= 50 {
						break
					}
				}
			}
		}
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"q": req.Q, "results": results})
}

// ---------- event (SSE) ----------

func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Env   string `yaml:"env"`
		Kinds string `yaml:"kinds"`
		Edges string `yaml:"edges"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Env == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "env missing")
		return
	}
	if !containsStr(schema.RuntimeEnvs(s.root), req.Env) {
		writeErr(w, http.StatusNotFound, "not_found", "env not found: "+req.Env)
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
				"seq":  seq,
				"env":  req.Env,
				"ts":   time.Now().UTC().Format(time.RFC3339),
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
