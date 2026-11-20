package server

import (
	"bytes"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"engineer/storage/internal/store"

	"gopkg.in/yaml.v3"
)

// Server is the one storage service behind two route prefixes: /log/* for the
// records and sessions in sqlite, /static/* for the files of the folder a request
// names. Two views, one data home — the prefix says which kind of thing a call is
// about.

type Server struct {
	store *store.Store
	mux   *http.ServeMux
}

func New(st *store.Store) *Server {
	s := &Server{store: st, mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /log/session/list", s.handleSessionList)
	s.mux.HandleFunc("POST /log/session/detail", s.handleSessionGet)
	s.mux.HandleFunc("POST /log/session/upsert", s.handleSessionUpsert)
	s.mux.HandleFunc("POST /log/session/delete", s.handleSessionDelete)
	s.mux.HandleFunc("POST /log/session/messages", s.handleSessionMessages)
	s.mux.HandleFunc("POST /log/session/record/add", s.handleRecordAdd)
	// The tree's read-only views (static.go). The folder is the request's own
	// argument: this service keeps no board of projects.
	s.mux.HandleFunc("POST /static/query", s.handleSchemaQuery)
	s.mux.HandleFunc("POST /static/query-detail", s.handleSchemaQueryDetail)
	s.mux.HandleFunc("POST /static/stream", s.handleEvent)
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

// ---------- log/session/record/add ----------

func (s *Server) handleRecordAdd(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string      `yaml:"sessionId"`
		Payload   interface{} `yaml:"payload"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	rec, err := s.store.Insert(store.Record{
		Kind:      "conversation",
		SessionID: req.SessionID,
		Payload:   req.Payload,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, map[string]interface{}{"id": rec.ID, "createdAt": rec.CreatedAt})
}

// ---------- sessions ----------
//
// A session's row is what a resumed conversation is rebuilt from: the folder the
// agent works in, the text appended to its system prompt, its display name and the
// two models it runs.

func (s *Server) handleSessionUpsert(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string `yaml:"sessionId"`
		Cwd        string `yaml:"cwd"`
		System     string `yaml:"system"`
		Title      string `yaml:"title"`
		Model      string `yaml:"model"`
		ImageModel string `yaml:"imageModel"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "sessionId missing")
		return
	}
	sess, err := s.store.UpsertSession(req.SessionID, req.Cwd, req.System, req.Title, req.Model, req.ImageModel)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeYAMLResp(w, http.StatusOK, sess.Body())
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
	writeYAMLResp(w, http.StatusOK, sess.Body())
}

// ---------- log/session/list ----------

func (s *Server) handleSessionList(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PageNum interface{} `yaml:"pageNum"`
	}
	if !decode(w, r, &req) {
		return
	}
	sessions, hasMore, err := s.store.ListSessions(pageNum(req.PageNum))
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

// ---------- log/session/delete ----------

func (s *Server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
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

// ---------- log/session/messages ----------

func (s *Server) handleSessionMessages(w http.ResponseWriter, r *http.Request) {
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
