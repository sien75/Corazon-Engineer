package server

import (
	"bytes"
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
	projects *projectPaths
	mux      *http.ServeMux
	broker   *Broker
}

// New builds the service around log, not around a project directory: which tree
// a request means is decided per request, by the projectId it carries.
func New(logBase string) *Server {
	s := &Server{projects: newProjectPaths(logBase), mux: http.NewServeMux(), broker: NewBroker()}
	s.mux.HandleFunc("POST /static/query", s.handleSchemaQuery)
	s.mux.HandleFunc("POST /static/query-detail", s.handleSchemaQueryDetail)
	s.mux.HandleFunc("POST /static/stream", s.handleEvent)
	return s
}

func (s *Server) Listen(addr string) error {
	go s.watch()
	return http.ListenAndServe(addr, cors(s.mux))
}

// projectPaths turns the projectId a request carries into the folder it names.
// Projects are data in log's home database, so this service has no root of its
// own: it serves whichever project it is asked about. The answer is remembered
// briefly — a page load is a handful of requests — and re-read soon enough that
// adding or removing a project needs no restart.
type projectPaths struct {
	logBase string
	mu      sync.Mutex
	seen    map[string]cachedPath
	list    []projectDir
	at      time.Time
}

type projectDir struct{ id, path string }

type cachedPath struct {
	path string
	at   time.Time
}

// projectPathTTL is how long a resolved project is trusted.
const projectPathTTL = 5 * time.Second

func newProjectPaths(logBase string) *projectPaths {
	return &projectPaths{logBase: logBase, seen: map[string]cachedPath{}}
}

// all is the project board, as the file watcher needs it.
func (p *projectPaths) all() ([]projectDir, error) {
	p.mu.Lock()
	list, at := p.list, p.at
	p.mu.Unlock()
	if list != nil && time.Since(at) < projectPathTTL {
		return list, nil
	}
	var res struct {
		Projects []struct {
			ProjectID string `yaml:"projectId"`
			Path      string `yaml:"path"`
		} `yaml:"projects"`
	}
	if _, err := logCall(p.logBase, "/log/project/list", map[string]string{}, &res); err != nil {
		return nil, err
	}
	out := make([]projectDir, 0, len(res.Projects))
	for _, item := range res.Projects {
		out = append(out, projectDir{id: item.ProjectID, path: item.Path})
	}
	p.mu.Lock()
	p.list = out
	p.at = time.Now()
	p.mu.Unlock()
	return out, nil
}

// dir resolves one project id to its folder. A 404 from log means the id names
// no project; the caller turns that into its own 404.
func (p *projectPaths) dir(projectID string) (string, int, error) {
	projectID = strings.TrimSpace(projectID)
	p.mu.Lock()
	entry, ok := p.seen[projectID]
	p.mu.Unlock()
	if ok && time.Since(entry.at) < projectPathTTL {
		return entry.path, http.StatusOK, nil
	}
	var res struct {
		Path string `yaml:"path"`
	}
	status, err := logCall(p.logBase, "/log/project/get", map[string]string{"projectId": projectID}, &res)
	if err != nil {
		return "", status, err
	}
	if strings.TrimSpace(res.Path) == "" {
		return "", http.StatusNotFound, fmt.Errorf("project %s has no path", projectID)
	}
	p.mu.Lock()
	p.seen[projectID] = cachedPath{path: res.Path, at: time.Now()}
	p.mu.Unlock()
	return res.Path, http.StatusOK, nil
}

// logCall POSTs a yaml body to log and decodes the yaml answer. The status is
// returned as well, so a caller can tell "no such project" from "log is down".
func logCall(base, path string, body interface{}, out interface{}) (int, error) {
	data, err := marshalYAML(body)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(base, "/")+path, bytes.NewReader(data))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/yaml")
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return res.StatusCode, err
	}
	if res.StatusCode != http.StatusOK {
		return res.StatusCode, fmt.Errorf("log %s → HTTP %d", path, res.StatusCode)
	}
	if out != nil {
		if err := yaml.Unmarshal(raw, out); err != nil {
			return res.StatusCode, fmt.Errorf("log %s: %v", path, err)
		}
	}
	return res.StatusCode, nil
}

// root is the request's project directory, or the reason there is none: the
// caller writes the error and stops.
func (s *Server) root(w http.ResponseWriter, projectID string) (string, bool) {
	if strings.TrimSpace(projectID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "projectId missing")
		return "", false
	}
	path, status, err := s.projects.dir(projectID)
	if status == http.StatusNotFound {
		writeErr(w, http.StatusNotFound, "not_found", "no project "+projectID)
		return "", false
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", "cannot resolve project: "+err.Error())
		return "", false
	}
	return path, true
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

// marshalYAML encodes with a 2-space indent. yaml.v3's default indent of 4
// emits an invalid block scalar (wrong indentation indicator) for multi-line
// strings whose first line starts with whitespace.
func marshalYAML(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeYAMLResp(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(status)
	data, err := marshalYAML(v)
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
		"contracts":   schema.ListEntries(root, "contracts"),
		"development": schema.ListEntries(root, "development"),
		"docs":        schema.ListEntries(root, "docs"),
		"notes":       schema.ListEntries(root, "notes"),
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
	if !containsStr(schema.ObjectTypes, req.Type) {
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
	default: // how-to, development, docs, notes — raw text
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
// moves), so the project list is re-read each tick. A tick where log cannot be
// read is skipped rather than diffed against an empty board — that would publish
// a remove for every file in every project.
func (s *Server) watch() {
	const interval = 1 * time.Second
	prev := map[string]fileStamp{}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		projects, err := s.projects.all()
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

// snapshot maps every content file of every project (projectId + relative path)
// to its size + mod time. A project whose folder is gone simply contributes
// nothing, which reads as "its files were removed" — the honest answer.
func (s *Server) snapshot(projects []projectDir) map[string]fileStamp {
	out := map[string]fileStamp{}
	for _, p := range projects {
		for _, dir := range schema.TypeDirs {
			for _, rel := range schema.ListEntries(p.path, dir) {
				info, err := os.Stat(filepath.Join(p.path, filepath.FromSlash(rel)))
				if err != nil {
					continue
				}
				out[p.id+"\x00"+rel] = fileStamp{size: info.Size(), mod: info.ModTime().UnixNano()}
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
	s.broker.Publish(SchemaEvent{
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
	root, _, err := s.projects.dir(projectID)
	if err != nil {
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

// ---------- broker ----------

type SchemaEvent struct {
	Kind      string
	ProjectID string
	Op        string
	Type      string
	ID        string
	File      string
	Content   interface{}
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
