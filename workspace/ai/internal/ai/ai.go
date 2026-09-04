package ai

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"corazon/ai/internal/tools"

	"gopkg.in/yaml.v3"
)

type Event struct {
	Seq      int                    `yaml:"seq"`
	Kind     string                 `yaml:"kind"`
	Markdown string                 `yaml:"markdown,omitempty"`
	Approval map[string]interface{} `yaml:"approval,omitempty"`
	Done     bool                   `yaml:"done,omitempty"`
	Err      map[string]string      `yaml:"error,omitempty"`
}

type Session struct {
	ID        string
	messages  []ChatMessage
	events    []Event
	pending   map[string]chan bool // approvalId -> grant result
	listeners []chan Event
	done      bool
}

type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
	ds       *deepseekClient
	tools    []tools.Tool
	logBase  string // log service base url; empty = conversation recording off
	http     *http.Client
}

// NewStore creates a store. apiKey may be empty, in which case Ask falls back to the echo stub.
//
// The only tool exposed to the model is `cli`: internal atomic APIs (static /
// log) are plain HTTP interfaces listed in the system prompt, and the model
// reaches them with curl like any other network tool — no per-endpoint tools.
// Conversation records (kind=conversation), however, are written by this
// service itself to logBase — deterministically, without model involvement.
func NewStore(apiKey, logBase string) *Store {
	var ds *deepseekClient
	if apiKey != "" {
		ds = newDeepseekClient(apiKey)
	}
	s := &Store{
		sessions: map[string]*Session{},
		ds:       ds,
		logBase:  logBase,
		http:     &http.Client{Timeout: 10 * time.Second},
	}
	s.tools = []tools.Tool{
		{
			Name:        "cli",
			Description: "Execute a shell command to interact with external systems and internal HTTP APIs (curl the static / log services, connect endpoints, query otel / application logs, inspect infra). Follow the CLI safety rules: read-only commands may run directly; side-effectful commands require approval.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"command": map[string]interface{}{"type": "string", "description": "the shell command to run"},
				},
				"required": []interface{}{"command"},
			},
		},
	}
	return s
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
	sess := &Session{ID: newID(), pending: map[string]chan bool{}}
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

// Ask queues events for a prompt: the prompt is sent to DeepSeek and the reply
// (possibly after tool calls) streams back as markdown.
func (s *Store) Ask(sess *Session, prompt string) {
	s.mu.Lock()
	sess.messages = append(sess.messages, ChatMessage{Role: "user", Content: prompt})
	seq := len(sess.messages)
	ds := s.ds
	s.mu.Unlock()
	go s.record(sess.ID, seq, "user", prompt)

	if ds == nil {
		reply := fmt.Sprintf("Corazon AI (dev stub) received your prompt:\n\n> %s", prompt)
		s.mu.Lock()
		sess.messages = append(sess.messages, ChatMessage{Role: "assistant", Content: reply})
		sess.appendLocked(Event{Kind: "markdown", Markdown: reply})
		sess.appendLocked(Event{Kind: "markdown", Done: true})
		seq = len(sess.messages)
		s.mu.Unlock()
		go s.record(sess.ID, seq, "assistant", reply)
		return
	}
	go s.runTurn(sess)
}

func (s *Store) runTurn(sess *Session) {
	const maxRounds = 12
	for round := 0; round < maxRounds; round++ {
		messages := s.messagesFor(sess)
		result, err := s.ds.chatStream(context.Background(), messages, s.tools, func(delta string) {
			s.mu.Lock()
			sess.appendLocked(Event{Kind: "markdown", Markdown: delta})
			s.mu.Unlock()
		})
		if err != nil {
			s.emitError(sess, err)
			return
		}
		if len(result.ToolCalls) == 0 {
			s.finishTurn(sess, result.Content)
			return
		}
		s.mu.Lock()
		sess.messages = append(sess.messages, ChatMessage{Role: "assistant", ToolCalls: result.ToolCalls})
		s.mu.Unlock()
		for _, tc := range result.ToolCalls {
			if s.needsApproval(tc) {
				if !s.requestApproval(sess, tc) {
					s.appendTool(sess, tc, "operation denied by user")
					continue
				}
			}
			s.appendTool(sess, tc, s.executeTool(tc))
		}
	}
	s.emitError(sess, errors.New("too many tool rounds"))
}

func (s *Store) finishTurn(sess *Session, content string) {
	s.mu.Lock()
	sess.messages = append(sess.messages, ChatMessage{Role: "assistant", Content: content})
	sess.appendLocked(Event{Kind: "markdown", Done: true})
	seq := len(sess.messages)
	s.mu.Unlock()
	go s.record(sess.ID, seq, "assistant", content)
}

func (s *Store) messagesFor(sess *Session) []ChatMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]ChatMessage, 0, len(sess.messages)+1)
	out = append(out, ChatMessage{Role: "system", Content: SystemPrompt})
	out = append(out, sess.messages...)
	return out
}

func (s *Store) emitError(sess *Session, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess.appendLocked(Event{Kind: "error", Err: map[string]string{"code": "ai_error", "message": err.Error()}})
	sess.appendLocked(Event{Kind: "markdown", Done: true})
}

func (s *Store) appendTool(sess *Session, tc ToolCall, result string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess.messages = append(sess.messages, ChatMessage{Role: "tool", ToolCallID: tc.ID, Content: result})
}

// record writes a conversation record to the log service (fire-and-forget;
// logging must never block or break the chat flow).
func (s *Store) record(sessionID string, seq int, msgKind, content string) {
	if s.logBase == "" {
		return
	}
	body, err := yaml.Marshal(map[string]interface{}{
		"op": "add", "kind": "conversation", "sessionId": sessionID,
		"payload": map[string]interface{}{"seq": seq, "msgKind": msgKind, "content": content},
	})
	if err != nil {
		return
	}
	resp, err := s.http.Post(s.logBase+"/log/mutation", "application/yaml", bytes.NewReader(body))
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}

// Approve grants a pending approval; the waiting tool call resumes.
func (s *Store) Approve(sess *Session, approvalID string) error {
	s.mu.Lock()
	ch, ok := sess.pending[approvalID]
	if !ok {
		s.mu.Unlock()
		return ErrApprovalNotFound
	}
	delete(sess.pending, approvalID)
	s.mu.Unlock()
	ch <- true
	return nil
}

func (s *Store) requestApproval(sess *Session, tc ToolCall) bool {
	ch := make(chan bool)
	id := newID()
	s.mu.Lock()
	sess.pending[id] = ch
	sess.appendLocked(Event{
		Kind: "approval",
		Approval: map[string]interface{}{
			"approvalId": id,
			"title":      fmt.Sprintf("run %s(%s)", tc.Function.Name, tc.Function.Arguments),
		},
	})
	s.mu.Unlock()
	select {
	case granted := <-ch:
		return granted
	case <-time.After(5 * time.Minute):
		s.mu.Lock()
		delete(sess.pending, id)
		s.mu.Unlock()
		return false
	}
}

// needsApproval reports whether a tool call must be user-approved before running.
func (s *Store) needsApproval(tc ToolCall) bool {
	return tc.Function.Name == "cli" && !cliReadOnly(tc.Function.Arguments)
}

func (s *Store) executeTool(tc ToolCall) string {
	if tc.Function.Name != "cli" {
		return "unknown tool: " + tc.Function.Name
	}
	return execCLI(tc.Function.Arguments)
}

func execCLI(argsJSON string) string {
	var req struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &req); err != nil {
		return "error: invalid cli arguments: " + err.Error()
	}
	if strings.TrimSpace(req.Command) == "" {
		return "error: command missing"
	}
	out, err := exec.Command("sh", "-c", req.Command).CombinedOutput()
	if err != nil {
		return fmt.Sprintf("error: %v\n%s", err, string(out))
	}
	return string(out)
}

// cliReadOnly reports whether a CLI command is read-only and may run without approval.
func cliReadOnly(argsJSON string) bool {
	var req struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &req); err != nil {
		return false
	}
	cmd := strings.TrimSpace(req.Command)
	fields := strings.Fields(cmd)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "ls", "cat", "head", "tail", "grep", "wc", "echo", "pwd", "which", "find", "stat", "df", "free", "ps", "env", "date":
		return true
	case "git":
		return len(fields) > 1 && containsStr([]string{"status", "log", "show", "diff", "branch", "remote"}, fields[1])
	case "curl":
		readOnly := true
		for i := 1; i < len(fields); i++ {
			f := fields[i]
			switch {
			case f == "-X":
				if i+1 < len(fields) {
					m := strings.ToUpper(fields[i+1])
					if m != "GET" && m != "HEAD" {
						readOnly = false
					}
					i++
				}
			case f == "-d" || f == "--data" || f == "-F" || strings.HasPrefix(f, "--data-") || strings.HasPrefix(f, "-d"):
				readOnly = false
			}
		}
		if readOnly {
			return true
		}
		// internal HTTP APIs are POST-only; query/search endpoints are still
		// read-only by contract and may run without approval
		return internalReadOnly(cmd)
	case "psql":
		return strings.Contains(cmd, "SELECT")
	case "redis-cli":
		return len(fields) > 1 && containsStr([]string{"GET", "MGET", "SCAN", "TTL", "TYPE", "INFO", "KEYS", "HGETALL", "LRANGE"}, strings.ToUpper(fields[1]))
	case "sqlite3":
		return strings.Contains(cmd, "SELECT")
	}
	return false
}

// internalReadOnlyPaths are internal API endpoints that are read-only by
// contract, even though they are invoked via POST.
var internalReadOnlyPaths = []string{
	"/static/query", "/static/query-detail", "/static/search",
	"/log/query", "/log/query-detail", "/log/search",
}

func internalReadOnly(cmd string) bool {
	for _, p := range internalReadOnlyPaths {
		if strings.Contains(cmd, p) {
			return true
		}
	}
	return false
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
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
