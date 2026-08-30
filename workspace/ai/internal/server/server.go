package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"corazon/ai/internal/ai"
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

// ---------- AI ----------

func (s *Server) handleAINew(w http.ResponseWriter, r *http.Request) {
	sess := s.ai.New()
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessionId": sess.ID})
}

func (s *Server) handleAIAsk(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID     string `json:"id"`
		Prompt string `json:"prompt"`
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
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessionId": sess.ID})
}

func (s *Server) handleAIStream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
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

	backlog, ch := s.ai.Subscribe(sess)
	send := func(ev ai.Event) bool {
		var sb strings.Builder
		enc := json.NewEncoder(&sb)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(ev)
		fmt.Fprintf(w, "data: %s\n\n", strings.TrimRight(sb.String(), "\n"))
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
		ID         string `json:"id"`
		ApprovalID string `json:"approvalId"`
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
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"sessionId":  sess.ID,
		"approvalId": req.ApprovalID,
		"granted":    true,
	})
}

func (s *Server) handleAIDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
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
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessionId": req.ID})
}
