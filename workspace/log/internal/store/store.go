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

// Tab is gone: a tab is one open session, so there is no per-tab state to keep.
// What used to be a tab row (a pane tree, a name, a last-activity time) is now
// either the session's own row (kind / blueprint / title) or the open list in
// current (see workspace.go).

// Open opens the database under the engineer home directory. The home is the
// program's own data directory (not a project): sessions of every project, the
// project registry and the workspace row all live here, so which folder the
// program was started from says nothing about what it serves.
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
	// Three tables, one shape, one kind each: a conversation row is what the shell
	// replays, a test row is one run, a telemetry row is one observation. Keeping
	// them apart is what lets each be read, indexed and eventually pruned on its
	// own; the columns are identical so one reader can still span them.
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
	// sessions + current are the workspace side of the same database (see
	// workspace.go): what a conversation is, and what is open right now.
	if err := st.createWorkspaceTables(); err != nil {
		return nil, err
	}
	return st, nil
}

func (s *Store) Close() error { return s.db.Close() }

// recordTables is every table a record can live in.
var recordTables = []string{"records", "tests", "telemetries"}

// tableForKind is where a newly written record goes.
func tableForKind(kind string) string {
	switch kind {
	case "test":
		return "tests"
	case "telemetry":
		return "telemetries"
	default:
		return "records"
	}
}

// tablesForKind is where a kind is read from: its own table. A read that names
// no kind spans all three.
func tablesForKind(kind string) []string {
	switch kind {
	case "conversation":
		return []string{"records"}
	case "test":
		return []string{"tests"}
	case "telemetry":
		return []string{"telemetries"}
	default:
		return recordTables
	}
}

// recordSource is the one FROM a reader can use whatever the kind: the tables
// that may hold it, stacked.
func recordSource(kind string) string {
	parts := make([]string, 0, len(tablesForKind(kind)))
	for _, table := range tablesForKind(kind) {
		parts = append(parts, `SELECT id, created_at, kind, env, atom, session_id, summary, payload FROM `+table)
	}
	return "(" + strings.Join(parts, " UNION ALL ") + ")"
}

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
	_, err = s.db.Exec(`INSERT INTO `+tableForKind(rec.Kind)+` (id, created_at, kind, env, atom, session_id, summary, payload)
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
	rows, err := s.db.Query(`SELECT id, created_at, kind, env, atom, summary FROM `+recordSource(kind)+`
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

// Get returns a single record with full payload. kind narrows the search to one
// bucket ("" means any): a detail endpoint that names a bucket must not answer
// with a row from another one.
func (s *Store) Get(id, kind string) (Record, error) {
	var r Record
	var env, atom, session sql.NullString
	var payload string
	query := `SELECT id, created_at, kind, env, atom, session_id, summary, payload
		FROM ` + recordSource(kind) + ` WHERE id = ?`
	args := []interface{}{id}
	if kind != "" {
		query += ` AND kind = ?`
		args = append(args, kind)
	}
	err := s.db.QueryRow(query+" ORDER BY created_at DESC LIMIT 1", args...).
		Scan(&r.ID, &r.CreatedAt, &r.Kind, &env, &atom, &session, &r.Summary, &payload)
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
// ListSessions lists conversation sessions. projectID narrows it to one
// project's sessions ("" means every project, main included) — that is what a
// project launcher's recents are.
func (s *Store) ListSessions(pageNum int, projectID string) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	where := "1=1"
	args := []interface{}{}
	if p := strings.TrimSpace(projectID); p != "" {
		where = "s.project_id = ?"
		args = append(args, p)
	}
	rows, err := s.db.Query(`SELECT
		s.session_id,
		COUNT(r.id) AS msg_count,
		COALESCE(MIN(r.created_at), s.created_at) AS first_at,
		COALESCE(MAX(r.created_at), s.created_at) AS last_at,
		s.kind,
		s.blueprint,
		s.title,
		s.model,
		s.image_model,
		s.project_id,
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
		WHERE `+where+`
		GROUP BY s.session_id
		ORDER BY last_at DESC, s.session_id DESC
		LIMIT ? OFFSET ?`,
		append(args, PageSize+1, (pageNum-1)*PageSize)...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	sessions := []map[string]interface{}{}
	for rows.Next() {
		var sessionID, firstAt, lastAt, kind, blueprint, title, model, imageModel, projectID string
		var count int
		var previewPayload sql.NullString
		if err := rows.Scan(&sessionID, &count, &firstAt, &lastAt, &kind, &blueprint, &title, &model, &imageModel, &projectID, &previewPayload); err != nil {
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
			"kind":       kind,
			"projectId":  projectID,
			"blueprint":  blueprint,
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

// PutTab / NewTab / GetTab / ListTabs are gone with the tab table: a tab is one
// open session, so "create a tab" is "create a session" (ai's session-new) and
// "list tabs" is log/list over sessions.

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
// session row itself (which is what took it off the tab bar and out of main), and
// returns the number of deleted records. Doing all of it
// here is what keeps the workspace consistent whoever asks for the delete: an id
// left in the open list would draw a tab with nothing behind it.
func (s *Store) DeleteSession(sessionID string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM records
		WHERE kind = 'conversation' AND session_id = ?`, sessionID)
	if err != nil {
		return 0, err
	}
	if _, err := s.db.Exec(`DELETE FROM sessions WHERE session_id = ?`, sessionID); err != nil {
		return 0, err
	}
	// The row carried the workspace: its place on the tab bar and whether it was main.
	// Deleting it is what clears both, so there is no pointer left to repair.
	return res.RowsAffected()
}

// Search does a full-text-ish LIKE search across id/kind/summary/payload.
func (s *Store) Search(q string, pageNum int) ([]map[string]interface{}, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	like := "%" + q + "%"
	rows, err := s.db.Query(`SELECT id, created_at, kind, env, atom, summary FROM `+recordSource("")+`
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
