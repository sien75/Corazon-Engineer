package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"corazon/log/internal/store"
)

type Server struct {
	store  *store.Store
	mux    *http.ServeMux
	broker *Broker
}

func New(st *store.Store) *Server {
	s := &Server{store: st, mux: http.NewServeMux(), broker: NewBroker()}
	s.mux.HandleFunc("POST /log/query", s.handleQuery)
	s.mux.HandleFunc("POST /log/query-detail", s.handleQueryDetail)
	s.mux.HandleFunc("POST /log/search", s.handleSearch)
	s.mux.HandleFunc("POST /log/mutation", s.handleMutation)
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
		Op        string          `json:"op"`
		Kind      string          `json:"kind"`
		Env       string          `json:"env"`
		Atom      string          `json:"atom"`
		SessionID string          `json:"sessionId"`
		Payload   json.RawMessage `json:"payload"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Op != "add" {
		writeErr(w, http.StatusBadRequest, "bad_request", "op must be add")
		return
	}
	if !containsStr([]string{"call", "observe", "conversation"}, req.Kind) {
		writeErr(w, http.StatusBadRequest, "bad_request", "kind must be call | observe | conversation")
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
	writeJSON(w, http.StatusOK, map[string]interface{}{"id": rec.ID, "createdAt": rec.CreatedAt})
}

// ---------- log/query ----------

func (s *Server) handleQuery(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kind      string      `json:"kind"`
		Env       string      `json:"env"`
		Atom      string      `json:"atom"`
		SessionID string      `json:"sessionId"`
		Start     string      `json:"start"`
		End       string      `json:"end"`
		PageNum   interface{} `json:"pageNum"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Kind != "" && !containsStr([]string{"call", "observe", "conversation"}, req.Kind) {
		writeErr(w, http.StatusBadRequest, "bad_request", "kind must be call | observe | conversation")
		return
	}
	items, hasMore, err := s.store.Query(req.Kind, req.Env, req.Atom, req.SessionID, req.Start, req.End, pageNum(req.PageNum))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"records":  items,
		"pageNum":  pageNum(req.PageNum),
		"hasMore":  hasMore,
		"pageSize": store.PageSize,
	})
}

// ---------- log/query-detail ----------

func (s *Server) handleQueryDetail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
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
	writeJSON(w, http.StatusOK, rec)
}

// ---------- log/search ----------

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Q       string      `json:"q"`
		PageNum interface{} `json:"pageNum"`
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
	writeJSON(w, http.StatusOK, map[string]interface{}{
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
		Env   string `json:"env"`
		Kinds string `json:"kinds"`
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
			data := marshalNoEscape(payload)
			fmt.Fprintf(w, "data: %s\n\n", data)
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
