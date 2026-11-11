package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Session is a conversation's identity and everything the shell needs to draw it
// as a tab: the id its records are keyed by, the role it runs as, the page it
// drives, and the name shown on the tab bar.
//
// There is no tab row and no tab id any more: a tab is one open session, so
// "tab" is a word for the container in the UI and nothing else. A session with no
// row is read as "sub": the table starts out backfilled from records, so older
// projects need no migration of their own.
type Session struct {
	SessionID string `yaml:"sessionId"`
	Kind      string `yaml:"kind"`
	// ProjectID is the project this conversation belongs to — the group it is
	// drawn under. "" means it belongs to none: main is the shell's own
	// conversation and is not part of any project.
	ProjectID string `yaml:"projectId"`
	// Blueprint is the slug of the page this conversation drives; "" for main and
	// for conversations that never had one. The web server resolves
	// /agent/<sessionId>/ through it — the database is the only place the mapping
	// lives, so a page is never inferred from the URL.
	Blueprint string `yaml:"blueprint"`
	// Title is the name the tab bar shows: the blueprint page's <title>, written by
	// ai when the session is made ("main" for the shell's own chat) and replaced by
	// the title it summarizes from the conversation on the first turn.
	// It is stored so a reload can draw the bar before anything is loaded; the shell
	// falls back to fetching the page for rows that predate it.
	Title string `yaml:"title"`
	// Model is the provider/model-id this session runs, chosen when it was made or
	// by a later `model` tool switch ("" means the role default in the engineer
	// home's models.yaml applies). It is a mirror of the choice, so a list can show
	// it without reading the records — the records stay the source of truth for
	// what a rebuilt agent actually runs.
	Model string `yaml:"model"`
	// ImageModel is the provider/model-id of the image-generation model chosen for
	// this session at creation or by a later `model` tool switch with slot=image
	// ("" means the role's `image` in models.yaml, or none). Image generation is
	// not implemented yet, so nothing consumes it — the choice is kept where a
	// rebuild and the future image tool can find it.
	ImageModel string `yaml:"imageModel"`
	CreatedAt  string `yaml:"createdAt"`
}

func (s Session) Body() map[string]interface{} {
	return map[string]interface{}{
		"sessionId":  s.SessionID,
		"kind":       s.Kind,
		"projectId":  s.ProjectID,
		"blueprint":  s.Blueprint,
		"title":      s.Title,
		"model":      s.Model,
		"imageModel": s.ImageModel,
		"createdAt":  s.CreatedAt,
	}
}

// Current is the workspace as the shell reads it: which sessions are open (in
// display order, main not among them) and which session the shell's own chat is.
// Both are columns on the session rows now — a workspace row of its own was a
// second place for the same truth. current/get still answers in this shape, so a
// client does not care where it is kept.
type Current struct {
	OpenSessions []string `yaml:"openSessions"`
	MainSession  string   `yaml:"mainSession,omitempty"`
	UpdatedAt    string   `yaml:"updatedAt"`
}

func (c Current) Body() map[string]interface{} {
	open := c.OpenSessions
	if open == nil {
		open = []string{}
	}
	return map[string]interface{}{
		"openSessions": open,
		"mainSession":  c.MainSession,
		"updatedAt":    c.UpdatedAt,
	}
}

// hasColumn reports whether a table has a column. It is how a database written by
// an older build is recognised before it is migrated.
func (s *Store) hasColumn(table, column string) (bool, error) {
	rows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, kind string
		var notNull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &kind, &notNull, &dflt, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// hasTable reports whether a table exists. It is how a database written by an
// older build is recognised before it is migrated.
func (s *Store) hasTable(table string) (bool, error) {
	var name string
	err := s.db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) createWorkspaceTables() error {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			kind TEXT NOT NULL DEFAULT 'sub',
			project_id TEXT NOT NULL DEFAULT '',
			blueprint TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			image_model TEXT NOT NULL DEFAULT '',
			open_index INTEGER NOT NULL DEFAULT -1,
			is_main INTEGER NOT NULL DEFAULT 0,
			touched_at TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS projects (
			project_id TEXT PRIMARY KEY,
			path TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			removed_at TEXT NOT NULL DEFAULT '',
			visible INTEGER NOT NULL DEFAULT 1
		)`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	// A database that predates a column gets it in place: pages are resolved
	// through blueprint and the tab bar draws title, so every project started
	// before those must not fall over. "duplicate column name" is the
	// already-migrated case.
	for _, stmt := range []string{
		`ALTER TABLE sessions ADD COLUMN blueprint TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN title TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN model TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN image_model TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`,
		// The workspace used to be a row of its own; what it held belongs on the
		// session: where it sits on the tab bar, whether it is main, and when it
		// last took part in a workspace change (which is what current/updatedAt is).
		`ALTER TABLE sessions ADD COLUMN open_index INTEGER NOT NULL DEFAULT -1`,
		`ALTER TABLE sessions ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN touched_at TEXT NOT NULL DEFAULT ''`,
		// A board written before groups existed gets the eye's column in place:
		// every project it holds was drawn in the titlebar, so visible is the
		// honest default.
		`ALTER TABLE projects ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`,
	} {
		if _, err := s.db.Exec(stmt); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return err
		}
	}
	for _, stmt := range []string{
		`CREATE INDEX IF NOT EXISTS idx_session_project ON sessions(project_id)`,
		// One row per open position and one main at most: the pair of partial
		// indexes is what makes the derived workspace a single answer, not a list
		// that can disagree with itself.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_session_open ON sessions(open_index) WHERE open_index >= 0`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_session_main ON sessions(is_main) WHERE is_main = 1`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	// Backfill: a project that predates this table has sessions only in records.
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO sessions (session_id, kind, created_at)
		SELECT session_id, 'sub', MIN(created_at) FROM records
		WHERE kind = 'conversation' AND session_id IS NOT NULL AND session_id <> ''
		GROUP BY session_id`); err != nil {
		return err
	}
	return s.migrateFromCurrent()
}

// migrateFromCurrent moves the workspace row a database written before this
// change kept in `current` onto the session rows it pointed at, then drops the
// table: which sessions are open, in what order, and which one is main are
// properties of a session, not a row of their own. A database that has no
// `current` table is already in the new shape.
func (s *Store) migrateFromCurrent() error {
	has, err := s.hasTable("current")
	if err != nil || !has {
		return err
	}
	var openRaw, mainSession string
	if err := s.db.QueryRow(`SELECT open_sessions, main_session FROM current WHERE id = 1`).
		Scan(&openRaw, &mainSession); err != nil && !errors.Is(err, sql.ErrNoRows) {
		// An older build named the column open_tabs and held tab ids there. Those
		// ids are not sessions, so nothing can be mapped without the tab table —
		// the order is dropped and the conversations stay reachable by list.
		openRaw, mainSession = "", ""
	}
	var open []string
	if openRaw != "" {
		_ = json.Unmarshal([]byte(openRaw), &open)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for i, id := range open {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, err := s.db.Exec(`UPDATE sessions SET open_index = ?, touched_at = ? WHERE session_id = ?`,
			i, now, id); err != nil {
			return err
		}
	}
	if mainSession = strings.TrimSpace(mainSession); mainSession != "" {
		if _, err := s.db.Exec(`UPDATE sessions SET is_main = 1, touched_at = ? WHERE session_id = ?`,
			now, mainSession); err != nil {
			return err
		}
	}
	_, err = s.db.Exec(`DROP TABLE current`)
	return err
}

func contains(list []string, want string) bool {
	for _, have := range list {
		if have == want {
			return true
		}
	}
	return false
}

// UpsertSession stores a session's kind, project, blueprint, display name and
// the chat and image models it runs. An existing row keeps its createdAt, and an
// empty project / blueprint / title / model / imageModel keeps the stored value:
// a resume or a replay says nothing about them, so it must not wipe them.
func (s *Store) UpsertSession(sessionID, kind, projectID, blueprint, title, model, imageModel string) (Session, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return Session{}, sql.ErrNoRows
	}
	if kind != "main" {
		kind = "sub"
	}
	projectID = strings.TrimSpace(projectID)
	blueprint = strings.TrimSpace(blueprint)
	title = strings.TrimSpace(title)
	model = strings.TrimSpace(model)
	imageModel = strings.TrimSpace(imageModel)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO sessions (session_id, kind, project_id, blueprint, title, model, image_model, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			kind = excluded.kind,
			project_id = CASE WHEN excluded.project_id = '' THEN sessions.project_id ELSE excluded.project_id END,
			blueprint = CASE WHEN excluded.blueprint = '' THEN sessions.blueprint ELSE excluded.blueprint END,
			title = CASE WHEN excluded.title = '' THEN sessions.title ELSE excluded.title END,
			model = CASE WHEN excluded.model = '' THEN sessions.model ELSE excluded.model END,
			image_model = CASE WHEN excluded.image_model = '' THEN sessions.image_model ELSE excluded.image_model END`,
		sessionID, kind, projectID, blueprint, title, model, imageModel, now)
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(sessionID)
}

// GetSession returns one session; sql.ErrNoRows when it does not exist.
func (s *Store) GetSession(sessionID string) (Session, error) {
	var out Session
	err := s.db.QueryRow(`SELECT session_id, kind, project_id, blueprint, title, model, image_model, created_at FROM sessions WHERE session_id = ?`,
		sessionID).Scan(&out.SessionID, &out.Kind, &out.ProjectID, &out.Blueprint, &out.Title, &out.Model, &out.ImageModel, &out.CreatedAt)
	return out, err
}

// Current reads the workspace out of the session rows: the open ones in display
// order, and the one marked main. updatedAt is the latest change any of them took
// part in, so a client can tell a stale answer from a fresh one.
func (s *Store) Current() (Current, error) {
	out := Current{OpenSessions: []string{}}
	rows, err := s.db.Query(`SELECT session_id FROM sessions WHERE open_index >= 0
		ORDER BY open_index ASC`)
	if err != nil {
		return Current{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return Current{}, err
		}
		out.OpenSessions = append(out.OpenSessions, id)
	}
	if err := rows.Err(); err != nil {
		return Current{}, err
	}
	var mainSession sql.NullString
	if err := s.db.QueryRow(`SELECT session_id FROM sessions WHERE is_main = 1 LIMIT 1`).
		Scan(&mainSession); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Current{}, err
	}
	out.MainSession = mainSession.String
	var touched sql.NullString
	if err := s.db.QueryRow(`SELECT MAX(touched_at) FROM sessions`).Scan(&touched); err != nil {
		return Current{}, err
	}
	out.UpdatedAt = touched.String
	return out, nil
}

// PutCurrent replaces the workspace: the open session ids (in display order) and
// the main session. Both are columns on the session rows, so the whole thing is
// one transaction — writing the open list and the main pointer separately would
// leave a moment where a reload sees neither.
//
// An id with no session row is ignored rather than stored: there is nothing to
// draw behind it, which is exactly what the old open list could not express.
func (s *Store) PutCurrent(openSessions []string, mainSession string) (Current, error) {
	ids := make([]string, 0, len(openSessions))
	for _, id := range openSessions {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return Current{}, err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`UPDATE sessions SET open_index = -1, touched_at = ? WHERE open_index >= 0`, now); err != nil {
		return Current{}, err
	}
	seen := map[string]bool{}
	pos := 0
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if _, err := tx.Exec(`UPDATE sessions SET open_index = ?, touched_at = ? WHERE session_id = ?`,
			pos, now, id); err != nil {
			return Current{}, err
		}
		pos++
	}
	if _, err := tx.Exec(`UPDATE sessions SET is_main = 0, touched_at = ? WHERE is_main = 1`, now); err != nil {
		return Current{}, err
	}
	if main := strings.TrimSpace(mainSession); main != "" {
		if _, err := tx.Exec(`UPDATE sessions SET is_main = 1, touched_at = ? WHERE session_id = ?`,
			now, main); err != nil {
			return Current{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Current{}, err
	}
	return s.Current()
}

// AddOpenSessions appends session ids to the open list (idempotent). index places
// the first newly opened session; -1 appends. Already-open sessions keep their
// place.
func (s *Store) AddOpenSessions(sessionIDs []string, index int) error {
	cur, err := s.Current()
	if err != nil {
		return err
	}
	open := append([]string{}, cur.OpenSessions...)
	fresh := make([]string, 0, len(sessionIDs))
	for _, id := range sessionIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if contains(open, id) || contains(fresh, id) {
			continue
		}
		fresh = append(fresh, id)
	}
	if len(fresh) == 0 {
		return nil
	}
	if index < 0 || index > len(open) {
		_, err := s.PutCurrent(append(open, fresh...), cur.MainSession)
		return err
	}
	tail := open[index:]
	joined := make([]string, 0, len(open)+len(fresh))
	joined = append(joined, open[:index]...)
	joined = append(joined, fresh...)
	joined = append(joined, tail...)
	_, err = s.PutCurrent(joined, cur.MainSession)
	return err
}

// RemoveOpenSessions drops session ids from the open list, keeping their records.
func (s *Store) RemoveOpenSessions(sessionIDs []string) error {
	cur, err := s.Current()
	if err != nil {
		return err
	}
	drop := map[string]bool{}
	for _, id := range sessionIDs {
		drop[strings.TrimSpace(id)] = true
	}
	kept := make([]string, 0, len(cur.OpenSessions))
	for _, id := range cur.OpenSessions {
		if !drop[id] {
			kept = append(kept, id)
		}
	}
	if len(kept) == len(cur.OpenSessions) {
		return nil
	}
	_, err = s.PutCurrent(kept, cur.MainSession)
	return err
}
