package store

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
	_ "modernc.org/sqlite"
)

const PageSize = 100

type Record struct {
	ID        string      `yaml:"id"`
	CreatedAt string      `yaml:"createdAt"`
	Kind      string      `yaml:"kind"`
	Env       string      `yaml:"env,omitempty"`
	Atom      string      `yaml:"atom,omitempty"`
	SessionID string      `yaml:"sessionId,omitempty"`
	Summary   string      `yaml:"summary"`
	Payload   interface{} `yaml:"payload"`
}

func (r Record) ListItem() map[string]interface{} {
	return map[string]interface{}{
		"id":        r.ID,
		"createdAt": r.CreatedAt,
		"kind":      r.Kind,
		"env":       emptyIfBlank(r.Env),
		"atom":      emptyIfBlank(r.Atom),
		"summary":   r.Summary,
	}
}

func emptyIfBlank(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

type Store struct {
	db *sql.DB
}

// Two things live in this database: a conversation's messages (records) and the
// conversation itself (sessions, see workspace.go).

// Open opens the database under the engineer home directory. The home is the
// program's own data directory: conversations live here, not in a project folder,
// so which folder the program was started from says nothing about what it serves.
func Open(home string) (*Store, error) {
	dir := home
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "engineer.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, err
	}
	// One table for the only records there are: a conversation's messages, in
	// arrival order, replayed by whoever asks for them.
	for _, table := range recordTables {
		if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ` + table + ` (
		id TEXT PRIMARY KEY,
		created_at TEXT NOT NULL,
		kind TEXT NOT NULL,
		env TEXT,
		atom TEXT,
		session_id TEXT,
		summary TEXT NOT NULL,
		payload TEXT NOT NULL
	)`); err != nil {
			return nil, err
		}
		for _, idx := range []string{
			`CREATE INDEX IF NOT EXISTS idx_` + table + `_kind ON ` + table + `(kind)`,
			`CREATE INDEX IF NOT EXISTS idx_` + table + `_created ON ` + table + `(created_at)`,
			`CREATE INDEX IF NOT EXISTS idx_` + table + `_atom ON ` + table + `(atom)`,
			`CREATE INDEX IF NOT EXISTS idx_` + table + `_session ON ` + table + `(session_id)`,
		} {
			if _, err := db.Exec(idx); err != nil {
				return nil, err
			}
		}
	}
	st := &Store{db: db}
	// sessions are the other side of the same database (see workspace.go): what a
	// conversation is — its folder, system text, name and models.
	if err := st.createWorkspaceTables(); err != nil {
		return nil, err
	}
	return st, nil
}

func (s *Store) Close() error { return s.db.Close() }

// recordTables is every table a record can live in — one, now that tests and
// telemetries are gone.
var recordTables = []string{"records"}

// Insert stores a record and returns it with assigned id / createdAt / summary.
func (s *Store) Insert(rec Record) (Record, error) {
	if rec.ID == "" {
		rec.ID = newID()
	}
	if rec.CreatedAt == "" {
		rec.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if rec.Summary == "" {
		rec.Summary = deriveSummary(rec)
	}
	payload := rec.Payload
	if payload == nil {
		payload = map[string]interface{}{}
	}
	// payload is stored as yaml text; existing rows holding json text still
	// load fine (json is valid yaml). Encode with a 2-space indent: yaml.v3's
	// default indent of 4 emits an invalid block scalar for multi-line strings
	// whose first line starts with whitespace, which would corrupt the row.
	payloadText, err := marshalYAML(payload)
	if err != nil {
		return rec, err
	}
	_, err = s.db.Exec(`INSERT INTO records (id, created_at, kind, env, atom, session_id, summary, payload)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID, rec.CreatedAt, rec.Kind, nullable(rec.Env), nullable(rec.Atom), nullable(rec.SessionID), rec.Summary, string(payloadText))
	return rec, err
}

func deriveSummary(rec Record) string {
	switch rec.Kind {
	case "conversation":
		if rec.SessionID != "" {
			return "conversation " + rec.SessionID
		}
		return "conversation"
	}
	return rec.Kind
}

// ListSessions lists conversation sessions, most recently active first, with a
// message count and a preview of each session's first user message. There is no
// project to narrow it by: a session is a conversation.
func (s *Store) ListSessions(pageNum int) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	rows, err := s.db.Query(`SELECT
		s.session_id,
		COUNT(r.id) AS msg_count,
		COALESCE(MIN(r.created_at), s.created_at) AS first_at,
		COALESCE(MAX(r.created_at), s.created_at) AS last_at,
		s.cwd,
		s.title,
		s.model,
		s.image_model,
		COALESCE(
			(SELECT r2.payload FROM records r2
				WHERE r2.kind = 'conversation' AND r2.session_id = s.session_id
					AND r2.payload LIKE '%role: user%'
				ORDER BY r2.rowid ASC LIMIT 1),
			(SELECT r3.payload FROM records r3
				WHERE r3.kind = 'conversation' AND r3.session_id = s.session_id
				ORDER BY r3.rowid ASC LIMIT 1)
		) AS preview_payload
		FROM sessions s
		LEFT JOIN records r ON r.kind = 'conversation' AND r.session_id = s.session_id
		GROUP BY s.session_id
		ORDER BY last_at DESC, s.session_id DESC
		LIMIT ? OFFSET ?`,
		PageSize+1, (pageNum-1)*PageSize)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	sessions := []map[string]interface{}{}
	for rows.Next() {
		var sessionID, firstAt, lastAt, cwd, title, model, imageModel string
		var count int
		var previewPayload sql.NullString
		if err := rows.Scan(&sessionID, &count, &firstAt, &lastAt, &cwd, &title, &model, &imageModel, &previewPayload); err != nil {
			return nil, false, err
		}
		preview := ""
		if previewPayload.Valid {
			var p struct {
				Content string `yaml:"content"`
			}
			if err := yaml.Unmarshal([]byte(previewPayload.String), &p); err == nil {
				preview = snippet(p.Content, 120)
			}
		}
		sessions = append(sessions, map[string]interface{}{
			"sessionId":  sessionID,
			"cwd":        cwd,
			"title":      title,
			"model":      model,
			"imageModel": imageModel,
			"createdAt":  firstAt,
			"lastAt":     lastAt,
			"count":      count,
			"preview":    preview,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(sessions) > PageSize
	if hasMore {
		sessions = sessions[:PageSize]
	}
	return sessions, hasMore, nil
}

func snippet(s string, max int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// SessionMessages returns a conversation session's messages in insertion order
// (rowid), each carrying its per-session seq / role / content.
func (s *Store) SessionMessages(sessionID string) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(`SELECT created_at, payload FROM records
		WHERE kind = 'conversation' AND session_id = ?
		ORDER BY rowid ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	messages := []map[string]interface{}{}
	for rows.Next() {
		var createdAt, payloadText string
		if err := rows.Scan(&createdAt, &payloadText); err != nil {
			return nil, err
		}
		var p struct {
			Seq     int         `yaml:"seq"`
			Role    string      `yaml:"role"`
			Content string      `yaml:"content"`
			Raw     interface{} `yaml:"raw"`
		}
		if err := yaml.Unmarshal([]byte(payloadText), &p); err != nil {
			continue
		}
		msg := map[string]interface{}{
			"seq":       p.Seq,
			"role":      p.Role,
			"content":   p.Content,
			"createdAt": createdAt,
		}
		if p.Raw != nil {
			msg["raw"] = p.Raw
		}
		messages = append(messages, msg)
	}
	return messages, rows.Err()
}

// DeleteSession removes every conversation record belonging to a session and the
// session row itself, and returns the number of deleted records.
func (s *Store) DeleteSession(sessionID string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM records
		WHERE kind = 'conversation' AND session_id = ?`, sessionID)
	if err != nil {
		return 0, err
	}
	if _, err := s.db.Exec(`DELETE FROM sessions WHERE session_id = ?`, sessionID); err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// marshalYAML encodes with a 2-space indent. yaml.v3's default indent of 4
// emits an invalid block scalar (wrong indentation indicator) for multi-line
// strings whose first line starts with whitespace.
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

func nullable(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
