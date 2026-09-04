package server

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"corazon/ai/internal/ai"

	"gopkg.in/yaml.v3"
)

type Server struct {
	mux *http.ServeMux
	ai  *ai.Store
}

func New(store *ai.Store) *Server {
	s := &Server{mux: http.NewServeMux(), ai: store}
	s.mux.HandleFunc("POST /ai/new", s.handleAINew)
	s.mux.HandleFunc("POST /ai/ask", s.handleAIAsk)
	s.mux.HandleFunc("POST /ai/stream", s.handleAIStream)
	s.mux.HandleFunc("POST /ai/approval", s.handleAIApproval)
	s.mux.HandleFunc("POST /ai/delete", s.handleAIDelete)
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

// The ai API speaks YAML on the wire (application/yaml), like static / log.
// JSON request bodies still parse, since JSON is a subset of YAML.

func writeYAML(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(status)
	data, err := yaml.Marshal(v)
	if err != nil {
		return
	}
	_, _ = w.Write(data)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeYAML(w, status, map[string]interface{}{
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

// ---------- AI ----------

func (s *Server) handleAINew(w http.ResponseWriter, r *http.Request) {
	sess := s.ai.New()
	writeYAML(w, http.StatusOK, map[string]interface{}{"sessionId": sess.ID})
}

func (s *Server) handleAIAsk(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID     string `yaml:"id"`
		Prompt string `yaml:"prompt"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "prompt missing or empty")
		return
	}
	sess, ok := s.ai.Get(req.ID)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "session not found")
		return
	}
	s.ai.Ask(sess, req.Prompt)
	writeYAML(w, http.StatusOK, map[string]interface{}{"sessionId": sess.ID})
}

func (s *Server) handleAIStream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `yaml:"id"`
	}
	if !decode(w, r, &req) {
		return
	}
	sess, ok := s.ai.Get(req.ID)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "session not found")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "internal", "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush() // send headers immediately so the connection establishes at once

	backlog, ch := s.ai.Subscribe(sess)
	send := func(ev ai.Event) bool {
		data, err := yaml.Marshal(ev)
		if err != nil {
			return ev.Done
		}
		// SSE carries multi-line yaml as one "data:" line per yaml line;
		// the client joins them back before parsing (per SSE spec)
		for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
			fmt.Fprintf(w, "data: %s\n", line)
		}
		fmt.Fprint(w, "\n")
		flusher.Flush()
		return ev.Done
	}
	// Replay the whole backlog without early-returning on a done event:
	// a done in the backlog belongs to an earlier turn; new turns append after it.
	for _, ev := range backlog {
		send(ev)
	}
	for {
		select {
		case <-r.Context().Done():
			return
		case ev := <-ch:
			if send(ev) {
				return
			}
		}
	}
}

func (s *Server) handleAIApproval(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID         string `yaml:"id"`
		ApprovalID string `yaml:"approvalId"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.ApprovalID == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "approvalId missing")
		return
	}
	sess, ok := s.ai.Get(req.ID)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "session or approvalId not found")
		return
	}
	if err := s.ai.Approve(sess, req.ApprovalID); err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "session or approvalId not found")
		return
	}
	writeYAML(w, http.StatusOK, map[string]interface{}{
		"sessionId":  sess.ID,
		"approvalId": req.ApprovalID,
		"granted":    true,
	})
}

func (s *Server) handleAIDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `yaml:"id"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.ID == "" {
		writeErr(w, http.StatusBadRequest, "bad_request", "bad request")
		return
	}
	if err := s.ai.Delete(req.ID); err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "session not found")
		return
	}
	writeYAML(w, http.StatusOK, map[string]interface{}{"sessionId": req.ID})
}
