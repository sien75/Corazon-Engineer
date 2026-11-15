package server

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// The workspace stream: one event after every write that changes the workspace
// (which sessions exist, which are open, which is main, a session's name, which
// projects are on the board). The event carries no content — the shell re-reads
// the workspace itself — so a burst of writes may arrive as one event, and a
// subscriber that is slow loses nothing: the next read sees the final state.

type workspaceBroker struct {
	mu   sync.Mutex
	subs []chan time.Time
}

func (b *workspaceBroker) subscribe() chan time.Time {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan time.Time, 1)
	b.subs = append(b.subs, ch)
	return ch
}

func (b *workspaceBroker) unsubscribe(ch chan time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, c := range b.subs {
		if c == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *workspaceBroker) notify() {
	now := time.Now().UTC()
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, ch := range b.subs {
		select {
		case ch <- now:
		default: // an event is already waiting; it covers this change too
		}
	}
}

// workspaceChanged is called by a handler after a successful workspace write.
func (s *Server) workspaceChanged() { s.workspace.notify() }

func (s *Server) handleWorkspaceStream(w http.ResponseWriter, r *http.Request) {
	var req struct{}
	if !decode(w, r, &req) {
		return
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
	flusher.Flush()

	sub := s.workspace.subscribe()
	defer s.workspace.unsubscribe(sub)
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	seq := 0
	send := func(at time.Time) bool {
		seq++
		data, err := marshalYAML(map[string]interface{}{
			"seq":       seq,
			"updatedAt": at.Format(time.RFC3339),
		})
		if err != nil {
			return false
		}
		// SSE carries multi-line yaml as one "data:" line per yaml line
		for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
			fmt.Fprintf(w, "data: %s\n", line)
		}
		fmt.Fprint(w, "\n")
		flusher.Flush()
		return true
	}
	// The first event is sent at once: the subscriber reconciles with the
	// workspace as it is now, which covers whatever changed before it connected.
	send(time.Now().UTC())
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case at := <-sub:
			send(at)
		}
	}
}
