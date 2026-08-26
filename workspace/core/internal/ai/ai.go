package ai

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
)

type Event struct {
	Seq      int                    `json:"seq"`
	Kind     string                 `json:"kind"`
	Markdown string                 `json:"markdown,omitempty"`
	Approval map[string]interface{} `json:"approval,omitempty"`
	Done     bool                   `json:"done,omitempty"`
	Err      map[string]string      `json:"error,omitempty"`
}

type Session struct {
	ID        string
	events    []Event
	pending   map[string]bool // approvalId -> still pending
	listeners []chan Event
	done      bool
}

type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

func NewStore() *Store {
	return &Store{sessions: map[string]*Session{}}
}

var (
	ErrSessionNotFound  = errors.New("session not found")
	ErrApprovalNotFound = errors.New("approval not found")
)

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Store) New() *Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := &Session{ID: newID(), pending: map[string]bool{}}
	s.sessions[sess.ID] = sess
	return sess
}

func (s *Store) Get(id string) (*Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	return sess, ok
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sessions[id]; !ok {
		return ErrSessionNotFound
	}
	delete(s.sessions, id)
	return nil
}

// Ask queues the AI's answer events for a prompt and returns them.
func (s *Store) Ask(sess *Session, prompt string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.Contains(strings.ToLower(prompt), "approval") {
		approvalID := newID()
		sess.pending[approvalID] = true
		sess.appendLocked(Event{
			Kind: "approval",
			Approval: map[string]interface{}{
				"approvalId": approvalID,
				"title":      fmt.Sprintf("AI requests permission to run an operation for: %q", prompt),
			},
		})
		return
	}
	sess.appendLocked(Event{Kind: "markdown", Markdown: fmt.Sprintf("Corazon AI (dev stub) received your prompt:\n\n> %s", prompt)})
	sess.appendLocked(Event{Kind: "markdown", Done: true})
}

// Approve grants a pending approval and queues the follow-up events.
func (s *Store) Approve(sess *Session, approvalID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !sess.pending[approvalID] {
		return ErrApprovalNotFound
	}
	delete(sess.pending, approvalID)
	sess.appendLocked(Event{Kind: "markdown", Markdown: fmt.Sprintf("Approval `%s` granted. Operation executed.", approvalID)})
	sess.appendLocked(Event{Kind: "markdown", Done: true})
	return nil
}

func (sess *Session) appendLocked(ev Event) {
	ev.Seq = len(sess.events) + 1
	sess.events = append(sess.events, ev)
	for _, ch := range sess.listeners {
		select {
		case ch <- ev:
		default:
		}
	}
}

// Subscribe returns the backlog and a channel for new events.
func (s *Store) Subscribe(sess *Session) ([]Event, <-chan Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := make(chan Event, 64)
	sess.listeners = append(sess.listeners, ch)
	backlog := make([]Event, len(sess.events))
	copy(backlog, sess.events)
	return backlog, ch
}
