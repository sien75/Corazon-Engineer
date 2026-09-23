package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"gopkg.in/yaml.v3"
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

func Open(root string) (*Store, error) {
	dir := filepath.Join(root, ".corazon")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "corazon.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS records (
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
		"CREATE INDEX IF NOT EXISTS idx_kind ON records(kind)",
		"CREATE INDEX IF NOT EXISTS idx_atom ON records(atom)",
		"CREATE INDEX IF NOT EXISTS idx_created ON records(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_session ON records(session_id)",
	} {
		if _, err := db.Exec(idx); err != nil {
			return nil, err
		}
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

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
	// load fine (json is valid yaml)
	payloadText, err := yaml.Marshal(payload)
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
	case "test":
		if rec.Atom != "" {
			return "test " + rec.Atom
		}
		return "test"
	case "telemetry":
		if rec.Atom != "" {
			return "telemetry " + rec.Atom
		}
		return "telemetry"
	case "conversation":
		if rec.SessionID != "" {
			return "conversation " + rec.SessionID
		}
		return "conversation"
	}
	return rec.Kind
}

// Query returns one page (pageSize=100) of records, newest first, plus hasMore.
func (s *Store) Query(kind, env, atom, sessionID, start, end string, pageNum int) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	where := []string{"1=1"}
	args := []interface{}{}
	if kind != "" {
		where = append(where, "kind = ?")
		args = append(args, kind)
	}
	if env != "" {
		where = append(where, "env = ?")
		args = append(args, env)
	}
	if atom != "" {
		where = append(where, "atom = ?")
		args = append(args, atom)
	}
	if sessionID != "" {
		where = append(where, "session_id = ?")
		args = append(args, sessionID)
	}
	if start != "" {
		where = append(where, "created_at >= ?")
		args = append(args, start)
	}
	if end != "" {
		where = append(where, "created_at <= ?")
		args = append(args, end)
	}
	rows, err := s.db.Query(`SELECT id, created_at, kind, env, atom, summary FROM records
		WHERE `+joinWhere(where)+` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		append(args, PageSize+1, (pageNum-1)*PageSize)...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := []map[string]interface{}{}
	for rows.Next() {
		var r struct {
			id, createdAt, kind string
			env, atom, summary  sql.NullString
		}
		if err := rows.Scan(&r.id, &r.createdAt, &r.kind, &r.env, &r.atom, &r.summary); err != nil {
			return nil, false, err
		}
		item := map[string]interface{}{
			"id":        r.id,
			"createdAt": r.createdAt,
			"kind":      r.kind,
			"summary":   r.summary.String,
		}
		if r.env.Valid && r.env.String != "" {
			item["env"] = r.env.String
		}
		if r.atom.Valid && r.atom.String != "" {
			item["atom"] = r.atom.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(items) > PageSize
	if hasMore {
		items = items[:PageSize]
	}
	return items, hasMore, nil
}

// Get returns a single record with full payload.
func (s *Store) Get(id string) (Record, error) {
	var r Record
	var env, atom, session sql.NullString
	var payload string
	err := s.db.QueryRow(`SELECT id, created_at, kind, env, atom, session_id, summary, payload
		FROM records WHERE id = ?`, id).Scan(&r.ID, &r.CreatedAt, &r.Kind, &env, &atom, &session, &r.Summary, &payload)
	if err != nil {
		return Record{}, err
	}
	r.Env, r.Atom, r.SessionID = env.String, atom.String, session.String
	if err := yaml.Unmarshal([]byte(payload), &r.Payload); err != nil {
		return Record{}, err
	}
	return r, nil
}

// ListSessions returns one page (pageSize=100) of ai conversation sessions,
// most recently active first, with message count and a preview of each
// session's latest message.
func (s *Store) ListSessions(pageNum int) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	rows, err := s.db.Query(`SELECT
		r.session_id,
		COUNT(*) AS msg_count,
		MIN(r.created_at) AS first_at,
		MAX(r.created_at) AS last_at,
		COALESCE(
			(SELECT r2.payload FROM records r2
				WHERE r2.kind = 'conversation' AND r2.session_id = r.session_id
					AND (r2.payload LIKE '%msgKind: user%' OR r2.payload LIKE '%role: user%')
				ORDER BY r2.rowid ASC LIMIT 1),
			(SELECT r3.payload FROM records r3
				WHERE r3.kind = 'conversation' AND r3.session_id = r.session_id
				ORDER BY r3.rowid ASC LIMIT 1)
		) AS preview_payload
		FROM records r
		WHERE r.kind = 'conversation' AND r.session_id IS NOT NULL AND r.session_id <> ''
		GROUP BY r.session_id
		ORDER BY last_at DESC, r.session_id DESC
		LIMIT ? OFFSET ?`,
		PageSize+1, (pageNum-1)*PageSize)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	sessions := []map[string]interface{}{}
	for rows.Next() {
		var sessionID, firstAt, lastAt string
		var count int
		var previewPayload sql.NullString
		if err := rows.Scan(&sessionID, &count, &firstAt, &lastAt, &previewPayload); err != nil {
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
			"sessionId": sessionID,
			"createdAt": firstAt,
			"lastAt":    lastAt,
			"count":     count,
			"preview":   preview,
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
			Seq     int                      `yaml:"seq"`
			Role    string                   `yaml:"role"`
			MsgKind string                   `yaml:"msgKind"`
			Content string                   `yaml:"content"`
			Raw     interface{}              `yaml:"raw"`
			Blocks  []map[string]interface{} `yaml:"blocks"`
		}
		if err := yaml.Unmarshal([]byte(payloadText), &p); err != nil {
			continue
		}
		role := p.Role
		if role == "" {
			role = p.MsgKind // legacy rows carry msgKind
		}
		msg := map[string]interface{}{
			"seq":       p.Seq,
			"role":      role,
			"content":   p.Content,
			"createdAt": createdAt,
		}
		if p.Raw != nil {
			msg["raw"] = p.Raw
		}
		if len(p.Blocks) > 0 {
			msg["blocks"] = p.Blocks
		}
		messages = append(messages, msg)
	}
	return messages, rows.Err()
}

// DeleteSession removes every conversation record belonging to a session and
// returns the number of deleted rows.
func (s *Store) DeleteSession(sessionID string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM records
		WHERE kind = 'conversation' AND session_id = ?`, sessionID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Search does a full-text-ish LIKE search across id/kind/summary/payload.
func (s *Store) Search(q string, pageNum int) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	like := "%" + q + "%"
	rows, err := s.db.Query(`SELECT id, created_at, kind, env, atom, summary FROM records
		WHERE id LIKE ? OR kind LIKE ? OR env LIKE ? OR atom LIKE ? OR summary LIKE ? OR payload LIKE ?
		ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		like, like, like, like, like, like, PageSize+1, (pageNum-1)*PageSize)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := []map[string]interface{}{}
	for rows.Next() {
		var r struct {
			id, createdAt, kind string
			env, atom, summary  sql.NullString
		}
		if err := rows.Scan(&r.id, &r.createdAt, &r.kind, &r.env, &r.atom, &r.summary); err != nil {
			return nil, false, err
		}
		item := map[string]interface{}{
			"id":        r.id,
			"createdAt": r.createdAt,
			"kind":      r.kind,
			"summary":   r.summary.String,
			"snippet":   r.summary.String,
		}
		if r.env.Valid && r.env.String != "" {
			item["env"] = r.env.String
		}
		if r.atom.Valid && r.atom.String != "" {
			item["atom"] = r.atom.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(items) > PageSize
	if hasMore {
		items = items[:PageSize]
	}
	return items, hasMore, nil
}

func joinWhere(conds []string) string {
	out := ""
	for i, c := range conds {
		if i > 0 {
			out += " AND "
		}
		out += c
	}
	return out
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
