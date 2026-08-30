package server

import (
	"encoding/json"
	"fmt"
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

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
}

func decode(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	if r.Body == nil || r.ContentLength == 0 {
		return true
	}
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid json body: "+err.Error())
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
		Env string `json:"env"`
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
	if req.Env != "" {
		p := "runtime/" + req.Env + ".yaml"
		if _, err := os.Stat(filepath.Join(s.root, filepath.FromSlash(p))); err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "runtime env not found: "+req.Env)
			return
		}
		runtimeEntries = []string{p}
	} else {
		runtimeEntries = schema.ListEntries(s.root, "runtime")
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"atoms":     atoms,
		"edges":     edges,
		"runtime":   runtimeEntries,
		"contracts": schema.ListEntries(s.root, "contracts"),
		"devtime":   schema.ListEntries(s.root, "devtime"),
		"docs":      schema.ListEntries(s.root, "docs"),
		"notes":     schema.ListEntries(s.root, "notes"),
		"tests":     schema.ListEntries(s.root, "tests"),
	})
}

// ---------- static-query-detail ----------

func (s *Server) handleSchemaQueryDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	if !decode(w, r, &req) {
		return
	}
	if !containsStr([]string{"runtime", "devtime", "contract", "test", "docs", "notes"}, req.Type) {
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
	case "runtime":
		env := strings.TrimSuffix(filepath.Base(req.ID), ".yaml")
		content, err := schema.LoadRuntimeEnv(s.root, env)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "runtime env not found: "+req.ID)
			return
		}
		resp["runtime"] = content
	case "contract":
		doc, err := schema.LoadContractFile(s.root, req.ID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "contract not found: "+req.ID)
			return
		}
		resp["contract"] = doc
	default: // devtime, test, docs, notes — raw text
		data, err := os.ReadFile(path)
		if err != nil {
			writeErr(w, http.StatusNotFound, "not_found", "file not found: "+req.ID)
			return
		}
		resp[req.Type] = string(data)
	}
	writeJSON(w, http.StatusOK, resp)
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

	if op != "remove" {
		if isRaw != (objType == "test" || objType == "devtime" || objType == "docs" || objType == "notes") {
			writeErr(w, http.StatusBadRequest, "bad_request", "field "+objType+" has wrong shape for its type")
			return
		}
		if !isRaw && body == nil {
			writeErr(w, http.StatusBadRequest, "bad_request", "missing field: "+objType)
			return
		}
		if !isRaw {
			if errs := schema.Validate(objType, body); len(errs) > 0 {
				writeJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
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
	writeJSON(w, http.StatusOK, map[string]interface{}{
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
	if objType == "test" || objType == "devtime" || objType == "docs" || objType == "notes" {
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
	case "runtime":
		env := strings.TrimSuffix(filepath.Base(id), ".yaml")
		return writeYAML(path, map[string]interface{}{"runtime": map[string]interface{}{env: body}})
	case "contract":
		return writeYAML(path, body)
	default: // test, devtime, docs, notes — raw content
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
	"tests": "test", "devtime": "devtime", "docs": "docs", "notes": "notes",
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Q string `json:"q"`
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
		Type    string `json:"type"`
		File    string `json:"file"`
		Lines   [2]int `json:"lines"`
		Snippet string `json:"snippet"`
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
	writeJSON(w, http.StatusOK, map[string]interface{}{"q": req.Q, "results": results})
}

// ---------- event (SSE) ----------

func (s *Server) handleEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Env   string `json:"env"`
		Kinds string `json:"kinds"`
		Edges string `json:"edges"`
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
			data := marshalNoEscape(payload)
			fmt.Fprintf(w, "data: %s\n\n", data)
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

func marshalNoEscape(v interface{}) string {
	var sb strings.Builder
	enc := json.NewEncoder(&sb)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimRight(sb.String(), "\n")
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
