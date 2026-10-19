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

// Tab is one tab's layout state: a pane tree stored as text. Unlike Record it is
// state, not a stream — one row per tab, overwritten in place. The tree is
// opaque here: log stores and returns it without interpreting its structure.
type Tab struct {
	TabID  string      `yaml:"tabId"`
	Title  string      `yaml:"title"`
	Layout interface{} `yaml:"layout"`
	// CreatedAt is the first write; UpdatedAt is the layout's last write; LastAt is
	// the last activity of any kind — a layout write, or a message in one of the
	// conversations this tab shows. The launcher's recents order by LastAt.
	CreatedAt string `yaml:"createdAt"`
	UpdatedAt string `yaml:"updatedAt"`
	LastAt    string `yaml:"lastAt"`
}

func (t Tab) Body() map[string]interface{} {
	return map[string]interface{}{
		"tabId":     t.TabID,
		"title":     t.Title,
		"layout":    t.Layout,
		"createdAt": t.CreatedAt,
		"updatedAt": t.UpdatedAt,
		"lastAt":    t.LastAt,
	}
}

func Open(root string) (*Store, error) {
	dir := filepath.Join(root, ".engineer")
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
	// tabs is separate from records on purpose: a tab's layout is keyed state
	// (one row, overwritten in place), while records is an append-only stream
	// whose listing and search would otherwise be polluted by layout rows.
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS tabs (
		tab_id TEXT PRIMARY KEY,
		title TEXT NOT NULL DEFAULT '',
		layout TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		last_at TEXT NOT NULL DEFAULT ''
	)`); err != nil {
		return nil, err
	}
	// A database that predates title / last_at gets them in place, the same way
	// sessions got blueprint: state a running project must not fall over on.
	for _, stmt := range []string{
		`ALTER TABLE tabs ADD COLUMN title TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tabs ADD COLUMN last_at TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := db.Exec(stmt); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return nil, err
		}
	}
	// A tab written before last_at existed has only its layout write to go on, and
	// an empty string would sort it behind everything ever touched.
	if _, err := db.Exec(`UPDATE tabs SET last_at = updated_at WHERE last_at = ''`); err != nil {
		return nil, err
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
		COALESCE(s.kind, 'sub') AS kind,
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
		LEFT JOIN sessions s ON s.session_id = r.session_id
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
		var sessionID, firstAt, lastAt, kind string
		var count int
		var previewPayload sql.NullString
		if err := rows.Scan(&sessionID, &count, &firstAt, &lastAt, &kind, &previewPayload); err != nil {
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
			"kind":      kind,
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

// PutTab creates a tab or overwrites an existing one's layout and name, and
// returns the stored row. An empty tabID allocates one (t_<hex>); createdAt is
// kept from the first write while updatedAt and lastAt move.
func (s *Store) PutTab(tabID, title string, layout interface{}) (Tab, error) {
	if tabID == "" {
		tabID = "t_" + newID()
	}
	now := time.Now().UTC().Format(time.RFC3339)
	layoutText, err := marshalYAML(layout)
	if err != nil {
		return Tab{}, err
	}
	_, err = s.db.Exec(`INSERT INTO tabs (tab_id, title, layout, created_at, updated_at, last_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(tab_id) DO UPDATE SET
			title = excluded.title,
			layout = excluded.layout,
			updated_at = excluded.updated_at,
			last_at = excluded.last_at`,
		tabID, title, string(layoutText), now, now, now)
	if err != nil {
		return Tab{}, err
	}
	return s.GetTab(tabID)
}

// NewTab creates a tab with its first layout and puts it in the open list. A tab
// always holds something: there is no empty tab to hand out and fill later.
func (s *Store) NewTab(title string, layout interface{}, open bool) (Tab, error) {
	tab, err := s.PutTab("", title, layout)
	if err != nil {
		return Tab{}, err
	}
	if !open {
		return tab, nil
	}
	if err := s.AddOpenTab(tab.TabID); err != nil {
		return Tab{}, err
	}
	return tab, nil
}

// GetTab returns one tab; sql.ErrNoRows when it does not exist.
func (s *Store) GetTab(tabID string) (Tab, error) {
	var t Tab
	var layoutText string
	err := s.db.QueryRow(`SELECT tab_id, title, layout, created_at, updated_at, last_at
		FROM tabs WHERE tab_id = ?`, tabID).
		Scan(&t.TabID, &t.Title, &layoutText, &t.CreatedAt, &t.UpdatedAt, &t.LastAt)
	if err != nil {
		return Tab{}, err
	}
	if err := yaml.Unmarshal([]byte(layoutText), &t.Layout); err != nil {
		return Tab{}, err
	}
	return t, nil
}

// ListTabs returns one page (pageSize=100) of tabs, most recently active first.
func (s *Store) ListTabs(pageNum int) ([]Tab, bool, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	rows, err := s.db.Query(`SELECT tab_id, title, layout, created_at, updated_at, last_at FROM tabs
		ORDER BY last_at DESC, created_at DESC, tab_id DESC LIMIT ? OFFSET ?`,
		PageSize+1, (pageNum-1)*PageSize)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	tabs := []Tab{}
	for rows.Next() {
		var t Tab
		var layoutText string
		if err := rows.Scan(&t.TabID, &t.Title, &layoutText, &t.CreatedAt, &t.UpdatedAt, &t.LastAt); err != nil {
			return nil, false, err
		}
		if err := yaml.Unmarshal([]byte(layoutText), &t.Layout); err != nil {
			continue // an unreadable tree is one bad row, not a failed page
		}
		tabs = append(tabs, t)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(tabs) > PageSize
	if hasMore {
		tabs = tabs[:PageSize]
	}
	return tabs, hasMore, nil
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

// DeleteSession removes every conversation record belonging to a session, its
// session row, and (when it is the main one) the main-session pointer, and
// returns the number of deleted records.
func (s *Store) DeleteSession(sessionID string) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM records
		WHERE kind = 'conversation' AND session_id = ?`, sessionID)
	if err != nil {
		return 0, err
	}
	if _, err := s.db.Exec(`DELETE FROM sessions WHERE session_id = ?`, sessionID); err != nil {
		return 0, err
	}
	if _, err := s.db.Exec(`UPDATE current SET main_session = '', updated_at = ?
		WHERE id = 1 AND main_session = ?`, time.Now().UTC().Format(time.RFC3339), sessionID); err != nil {
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
