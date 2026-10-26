package server

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"engineer/log/internal/store"

	"gopkg.in/yaml.v3"
)

type Server struct {
	store  *store.Store
	mux    *http.ServeMux
	broker *Broker
}

func New(st *store.Store) *Server {
	s := &Server{store: st, mux: http.NewServeMux(), broker: NewBroker()}
	s.mux.HandleFunc("POST /log/list", s.handleList)
	s.mux.HandleFunc("POST /log/delete", s.handleDelete)
	s.mux.HandleFunc("POST /log/session/messages", s.handleSessionDetail)
	s.mux.HandleFunc("POST /log/query", s.handleQuery)
	s.mux.HandleFunc("POST /log/query-detail", s.handleQueryDetail)
	s.mux.HandleFunc("POST /log/search", s.handleSearch)
	s.mux.HandleFunc("POST /log/mutation", s.handleMutation)
	s.mux.HandleFunc("POST /log/session/on", s.handleSessionOn)
	s.mux.HandleFunc("POST /log/session/off", s.handleSessionOff)
	s.mux.HandleFunc("POST /log/session/upsert", s.handleSessionUpsert)
	s.mux.HandleFunc("POST /log/session/detail", s.handleSessionGet)
	s.mux.HandleFunc("POST /log/project/list", s.handleProjectList)
	s.mux.HandleFunc("POST /log/project/get", s.handleProjectGet)
	s.mux.HandleFunc("POST /log/project/add", s.handleProjectAdd)
	s.mux.HandleFunc("POST /log/project/remove", s.handleProjectRemove)
	s.mux.HandleFunc("POST /log/project/visible", s.handleProjectVisible)
	s.mux.HandleFunc("POST /log/current/get", s.handleCurrentGet)
	s.mux.HandleFunc("POST /log/current/put", s.handleCurrentPut)
	s.mux.HandleFunc("POST /log/stream", s.handleStream)
	return s
}

func (s *Server) Listen(addr string) error {
	return http.ListenAndServe(addr, cors(s.mux))
}

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

// The log API speaks YAML on the wire (application/yaml).

// marshalYAML encodes with a 2-space indent. yaml.v3's default indent of 4
// emits an invalid block scalar (wrong indentation indicator) for multi-line
// strings whose first line starts with whitespace, which corrupts payloads and
// makes session-detail unreadable.
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

func pageNum(raw interface{}) int {
	switch v := raw.(type) {
	case float64:
		return int(v)
	case string:
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return 1
}

// ---------- log/mutation ----------

func (s *Server) handleMutation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Op        string      `yaml:"op"`
		Kind      string      `yaml:"kind"`
		Env       string      `yaml:"env"`
		Atom      string      `yaml:"atom"`
		SessionID string      `yaml:"sessionId"`
		Payload   interface{} `yaml:"payload"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Op != "add" {
		writeErr(w, http.StatusBadRequest, "bad_request", "op must be add")
		return
	}
	if !containsStr([]string{"test", "telemetry", "conversation"}, req.Kind) {
		writeErr(w, http.StatusBadRequest, "bad_request", "kind must be test | telemetry | conversation")
		return
	}
	rec := store.Record{
		Kind:      req.Kind,
		Env:       req.Env,
		Atom:      req.Atom,
		SessionID: req.SessionID,
		Payload:   req.Payload,
	}
	rec, err := s.store.Insert(rec)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	s.broker.Publish(rec)
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"id": rec.ID, "createdAt": rec.CreatedAt})
}

// ---------- log/session/on | log/session/off ----------
//
// The open list (the shell's tab bar) is workspace state, not a record. A tab is
// one open session, so opening and closing are operations on session ids — there
// is no tab row to create, and opening an id never invents anything.

// handleSessionOn puts existing sessions back on screen. An id with no session
// row is refused: the shell and main both take ids from a list, so an unknown one
// is a mistake, not a request to create.
func (s *Server) handleSessionOn(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionIDs []string `yaml:"sessionIds"`
		Index      *int     `yaml:"index"`
	}
	if !decode(w, r, &req) {
		return
	}
	if len(req.SessionIDs) == 0 {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionIds missing")
		return
	}
	for _, id := range req.SessionIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			writeErr(w, http.StatusBadRequest, "bad_request", "sessionIds missing")
			return
		}
		if _, err := s.store.GetSession(id); errors.Is(err, sql.ErrNoRows) {
			writeErr(w, http.StatusBadRequest, "bad_request", "no session "+id)
			return
		} else if err != nil {
			writeErr(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
	}
	index := -1
	if req.Index != nil {
		index = *req.Index
	}
	if err := s.store.AddOpenSessions(req.SessionIDs, index); err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	cur, err := s.store.Current()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"openSessions": cur.Body()["openSessions"]})
}

// handleSessionOff takes sessions off the open list. The records stay: a closed
// tab is a conversation you can put back with session/on.
func (s *Server) handleSessionOff(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionIDs []string `yaml:"sessionIds"`
	}
	if !decode(w, r, &req) {
		return
	}
	if len(req.SessionIDs) == 0 {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionIds missing")
		return
	}
	if err := s.store.RemoveOpenSessions(req.SessionIDs); err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	cur, err := s.store.Current()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"openSessions": cur.Body()["openSessions"]})
}

// ---------- sessions ----------
//
// A session's kind is workspace state, not a record: one row per conversation,
// read by ai to pick the spec and the tools, and by the shell to tell its own
// chat from a blueprint's.

func (s *Server) handleSessionUpsert(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `yaml:"sessionId"`
		Kind      string `yaml:"kind"`
		ProjectID string `yaml:"projectId"`
		Blueprint string `yaml:"blueprint"`
		Title     string `yaml:"title"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	// A project id becomes a lookup key for a folder in two other services, so a
	// malformed one is refused here rather than stored.
	if p := strings.TrimSpace(req.ProjectID); p != "" && !store.ValidProjectID(p) {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid projectId: "+p)
		return
	}
	sess, err := s.store.UpsertSession(req.SessionID, req.Kind, req.ProjectID, req.Blueprint, req.Title)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, sess)
}

func (s *Server) handleSessionGet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `yaml:"sessionId"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	sess, err := s.store.GetSession(req.SessionID)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "not_found", "session does not exist")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, sess)
}

// ---------- projects ----------
//
// The board of folders this engineer works on. It lives here because it is data:
// the program runs anywhere, and which projects it serves is a list it remembers,
// not the folder it was started in. The store does not touch the filesystem — the
// web server checks that a path really is an engineer project before it is added.

func (s *Server) handleProjectList(w http.ResponseWriter, r *http.Request) {
	var req struct{}
	if !decode(w, r, &req) {
		return
	}
	list, err := s.store.ListProjects()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	projects := make([]map[string]interface{}, 0, len(list))
	for _, p := range list {
		projects = append(projects, p.Body())
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"projects": projects})
}

func (s *Server) handleProjectGet(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `yaml:"projectId"`
	}
	if !decode(w, r, &req) {
		return
	}
	p, err := s.store.GetProject(req.ProjectID)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "not_found", "no project "+req.ProjectID)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, p)
}

func (s *Server) handleProjectAdd(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `yaml:"path"`
		Name string `yaml:"name"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Path) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "path missing")
		return
	}
	p, err := s.store.AddProject(req.Path, req.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, p)
}

func (s *Server) handleProjectRemove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `yaml:"projectId"`
	}
	if !decode(w, r, &req) {
		return
	}
	p, err := s.store.RemoveProject(req.ProjectID)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "not_found", "no project "+req.ProjectID)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, p)
}

// handleProjectVisible shows or hides one project's group in the titlebar. It is
// the only thing hiding does: no session is opened or closed, so showing the
// group again brings back exactly the tabs it had.
func (s *Server) handleProjectVisible(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `yaml:"projectId"`
		Visible   *bool  `yaml:"visible"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Visible == nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "visible missing")
		return
	}
	p, err := s.store.SetProjectVisible(req.ProjectID, *req.Visible)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "not_found", "no project "+req.ProjectID)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, p)
}

// ---------- current ----------
//
// The workspace row: which sessions are open (in display order) and which session
// the shell's own chat is. The shell reads it on load instead of restoring
// anything from local storage.

func (s *Server) handleCurrentGet(w http.ResponseWriter, r *http.Request) {
	var req struct{}
	if !decode(w, r, &req) {
		return
	}
	cur, err := s.store.Current()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, cur.Body())
}

func (s *Server) handleCurrentPut(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OpenSessions []string `yaml:"openSessions"`
		MainSession  string   `yaml:"mainSession"`
	}
	if !decode(w, r, &req) {
		return
	}
	cur, err := s.store.PutCurrent(req.OpenSessions, req.MainSession)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, cur.Body())
}

// ---------- log/list ----------

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PageNum   interface{} `yaml:"pageNum"`
		ProjectID string      `yaml:"projectId"`
	}
	if !decode(w, r, &req) {
		return
	}
	sessions, hasMore, err := s.store.ListSessions(pageNum(req.PageNum), req.ProjectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
		"pageNum":  pageNum(req.PageNum),
		"hasMore":  hasMore,
		"pageSize": store.PageSize,
	})
}

// ---------- log/delete ----------

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `yaml:"sessionId"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	deleted, err := s.store.DeleteSession(req.SessionID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"sessionId": req.SessionID,
		"deleted":   deleted,
	})
}

// ---------- log/query ----------

func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kind      string      `yaml:"kind"`
		Env       string      `yaml:"env"`
		Atom      string      `yaml:"atom"`
		SessionID string      `yaml:"sessionId"`
		Start     string      `yaml:"start"`
		End       string      `yaml:"end"`
		PageNum   interface{} `yaml:"pageNum"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Kind != "" && !containsStr([]string{"test", "telemetry", "conversation"}, req.Kind) {
		writeErr(w, http.StatusBadRequest, "bad_request", "kind must be test | telemetry | conversation")
		return
	}
	items, hasMore, err := s.store.Query(req.Kind, req.Env, req.Atom, req.SessionID, req.Start, req.End, pageNum(req.PageNum))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"records":  items,
		"pageNum":  pageNum(req.PageNum),
		"hasMore":  hasMore,
		"pageSize": store.PageSize,
	})
}

// ---------- log/session/messages ----------

func (s *Server) handleSessionDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `yaml:"sessionId"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	messages, err := s.store.SessionMessages(req.SessionID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"sessionId": req.SessionID,
		"messages":  messages,
	})
}

// ---------- log/query-detail ----------

func (s *Server) handleQueryDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `yaml:"id"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.ID == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "id missing")
		return
	}
	rec, err := s.store.Get(req.ID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "record not found")
		return
	}
	writeYAMLResp(w, http.StatusOK, rec)
}

// ---------- log/search ----------

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Q       string      `yaml:"q"`
		PageNum interface{} `yaml:"pageNum"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Q) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "q missing or empty")
		return
	}
	items, hasMore, err := s.store.Search(req.Q, pageNum(req.PageNum))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{
		"q":        req.Q,
		"results":  items,
		"pageNum":  pageNum(req.PageNum),
		"hasMore":  hasMore,
		"pageSize": store.PageSize,
	})
}

// ---------- log/stream ----------

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Env   string `yaml:"env"`
		Kinds string `yaml:"kinds"`
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
		case rec := <-sub:
			if req.Env != "" && rec.Env != req.Env {
				continue
			}
			if len(kinds) > 0 && !kinds[rec.Kind] {
				continue
			}
			seq++
			payload := map[string]interface{}{
				"seq":    seq,
				"record": rec.ListItem(),
			}
			data, err := marshalYAML(payload)
			if err != nil {
				continue
			}
			// SSE carries multi-line yaml as one "data:" line per yaml line
			for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
				fmt.Fprintf(w, "data: %s\n", line)
			}
			fmt.Fprint(w, "\n")
			flusher.Flush()
		}
	}
}

// ---------- broker ----------

type Broker struct {
	mu   sync.Mutex
	subs []chan store.Record
}

func NewBroker() *Broker { return &Broker{} }

func (b *Broker) Subscribe() chan store.Record {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan store.Record, 64)
	b.subs = append(b.subs, ch)
	return ch
}

func (b *Broker) Unsubscribe(ch chan store.Record) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, s := range b.subs {
		if s == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *Broker) Publish(rec store.Record) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs {
		select {
		case ch <- rec:
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
