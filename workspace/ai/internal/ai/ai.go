package ai

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"corazon/ai/internal/tools"
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
	messages  []ChatMessage
	events    []Event
	pending   map[string]chan bool // approvalId -> grant result
	listeners []chan Event
	done      bool
}

type Store struct {
	mu         sync.Mutex
	sessions   map[string]*Session
	ds         *deepseekClient
	tools      []tools.Tool
	staticBase string
	logBase    string
	http       *http.Client
}

// NewStore creates a store. apiKey may be empty, in which case Ask falls back to the echo stub.
func NewStore(apiKey, staticBase, logBase string) *Store {
	var ds *deepseekClient
	if apiKey != "" {
		ds = newDeepseekClient(apiKey)
	}
	s := &Store{
		sessions:   map[string]*Session{},
		ds:         ds,
		staticBase: staticBase,
		logBase:    logBase,
		http:       &http.Client{Timeout: 60 * time.Second},
	}
	s.tools = []tools.Tool{
		{
			Name:        "cli",
			Description: "Execute a shell command to interact with external systems (connect endpoints, query otel / application logs, inspect infra). Follow the CLI safety rules: read-only commands may run directly; side-effectful commands require approval.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"command": map[string]interface{}{"type": "string", "description": "the shell command to run"},
				},
				"required": []interface{}{"command"},
			},
		},
	}
	if b, err := tools.BuiltinTools(); err == nil {
		s.tools = append(s.tools, b...)
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
	ds := s.ds
	s.mu.Unlock()

	if ds == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		sess.appendLocked(Event{Kind: "markdown", Markdown: fmt.Sprintf("Corazon AI (dev stub) received your prompt:\n\n> %s", prompt)})
		sess.appendLocked(Event{Kind: "markdown", Done: true})
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
	defer s.mu.Unlock()
	sess.messages = append(sess.messages, ChatMessage{Role: "assistant", Content: content})
	sess.appendLocked(Event{Kind: "markdown", Done: true})
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
	switch tc.Function.Name {
	case "static_mutation":
		return true
	case "cli":
		return !cliReadOnly(tc.Function.Arguments)
	}
	return false
}

func (s *Store) executeTool(tc ToolCall) string {
	base, path := s.toolTarget(tc.Function.Name)
	if base == "" {
		if tc.Function.Name == "cli" {
			return execCLI(tc.Function.Arguments)
		}
		return "unknown tool: " + tc.Function.Name
	}
	req, err := http.NewRequest(http.MethodPost, base+path, strings.NewReader(tc.Function.Arguments))
	if err != nil {
		return "error: " + err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return "error: " + err.Error()
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return fmt.Sprintf("[%d] %s", resp.StatusCode, string(data))
}

func (s *Store) toolTarget(name string) (base, path string) {
	switch name {
	case "static_query":
		return s.staticBase, "/static/query"
	case "static_query_detail":
		return s.staticBase, "/static/query-detail"
	case "static_search":
		return s.staticBase, "/static/search"
	case "static_mutation":
		return s.staticBase, "/static/mutation"
	case "log_query":
		return s.logBase, "/log/query"
	case "log_query_detail":
		return s.logBase, "/log/query-detail"
	case "log_search":
		return s.logBase, "/log/search"
	case "log_mutation":
		return s.logBase, "/log/mutation"
	}
	return "", ""
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
		for i := 1; i < len(fields); i++ {
			f := fields[i]
			switch {
			case f == "-X":
				if i+1 < len(fields) {
					m := strings.ToUpper(fields[i+1])
					if m != "GET" && m != "HEAD" {
						return false
					}
					i++
				}
			case f == "-d" || f == "--data" || f == "-F" || strings.HasPrefix(f, "--data-") || strings.HasPrefix(f, "-d"):
				return false
			}
		}
		return true
	case "psql":
		return strings.Contains(cmd, "SELECT")
	case "redis-cli":
		return len(fields) > 1 && containsStr([]string{"GET", "MGET", "SCAN", "TTL", "TYPE", "INFO", "KEYS", "HGETALL", "LRANGE"}, strings.ToUpper(fields[1]))
	case "sqlite3":
		return strings.Contains(cmd, "SELECT")
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
