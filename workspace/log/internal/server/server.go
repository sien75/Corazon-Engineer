package server

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"corazon/log/internal/store"

	"gopkg.in/yaml.v3"
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

// The log API speaks YAML on the wire (application/yaml).

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
		Op        string          `yaml:"op"`
		Kind      string          `yaml:"kind"`
		Env       string          `yaml:"env"`
		Atom      string          `yaml:"atom"`
		SessionID string          `yaml:"sessionId"`
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
			data, err := yaml.Marshal(payload)
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
