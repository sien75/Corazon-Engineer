package store

import (
	"database/sql"
	"encoding/json"
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

// Current is the one row of workspace state: which sessions are open (in display
// order, main not among them) and which session the shell's own chat is. It is
// the single source of truth for both — a browser reload reads it back instead of
// restoring anything from local storage.
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
		`CREATE TABLE IF NOT EXISTS current (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			open_sessions TEXT NOT NULL,
			main_session TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL
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
		// A board written before groups existed gets the eye's column in place:
		// every project it holds was drawn in the titlebar, so visible is the
		// honest default.
		`ALTER TABLE projects ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`,
	} {
		if _, err := s.db.Exec(stmt); err != nil && !strings.Contains(err.Error(), "duplicate column name") {
			return err
		}
	}
	if _, err := s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_session_project ON sessions(project_id)`); err != nil {
		return err
	}
	// The workspace used to list tab ids and the current list was called open_tabs;
	// this is the one-way move to session ids. It runs before the old tab table is
	// dropped, because the mapping lives there.
	if err := s.migrateFromTabs(); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO current (id, open_sessions, main_session, updated_at)
		VALUES (1, '[]', '', ?)`, now); err != nil {
		return err
	}
	// Backfill: a project that predates this table has sessions only in records.
	_, err := s.db.Exec(`INSERT OR IGNORE INTO sessions (session_id, kind, created_at)
		SELECT session_id, 'sub', MIN(created_at) FROM records
		WHERE kind = 'conversation' AND session_id IS NOT NULL AND session_id <> ''
		GROUP BY session_id`)
	return err
}

// migrateFromTabs turns a database written before this change into the current
// shape, once:
//
//   - current.open_tabs (tab ids) is renamed to current.open_sessions;
//   - each open tab keeps exactly one of the sessions it held (the earliest) as
//     its open session — a tab that showed several panes cannot be one tab any
//     more, and the others stay reachable through the session list;
//   - the tabs table and sessions.tab_id go.
//
// A database that already has open_sessions is left alone, except for dropping a
// tabs table a previous run may have left behind.
func (s *Store) migrateFromTabs() error {
	renamed, err := s.hasColumn("current", "open_tabs")
	if err != nil {
		return err
	}
	if renamed {
		// A tab id list in a column that is going to hold session ids: read it
		// first, map it, then write the result into the renamed column.
		openTabs, err := s.legacyOpenTabs()
		if err != nil {
			return err
		}
		openSessions, err := s.legacySessionsOfTabs(openTabs)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`ALTER TABLE current RENAME COLUMN open_tabs TO open_sessions`); err != nil {
			return err
		}
		if err := s.writeOpenSessions(openSessions); err != nil {
			return err
		}
	}
	if _, err := s.db.Exec(`DROP TABLE IF EXISTS tabs`); err != nil {
		return err
	}
	hasTabID, err := s.hasColumn("sessions", "tab_id")
	if err != nil {
		return err
	}
	if hasTabID {
		if _, err := s.db.Exec(`ALTER TABLE sessions DROP COLUMN tab_id`); err != nil {
			return err
		}
	}
	return nil
}

// legacyOpenTabs reads the tab id list a pre-session-ids database kept.
func (s *Store) legacyOpenTabs() ([]string, error) {
	var raw string
	if err := s.db.QueryRow(`SELECT open_tabs FROM current WHERE id = 1`).Scan(&raw); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	var ids []string
	if raw == "" || json.Unmarshal([]byte(raw), &ids) != nil {
		return nil, nil
	}
	return ids, nil
}

// legacySessionsOfTabs maps each old tab id to the one session it keeps: the
// earliest bound to it. A tab with no session row is dropped — it had no
// conversation to put on screen.
func (s *Store) legacySessionsOfTabs(tabIDs []string) ([]string, error) {
	out := make([]string, 0, len(tabIDs))
	for _, tabID := range tabIDs {
		tabID = strings.TrimSpace(tabID)
		if tabID == "" {
			continue
		}
		var sessionID string
		err := s.db.QueryRow(`SELECT session_id FROM sessions WHERE tab_id = ?
			ORDER BY created_at ASC, session_id ASC LIMIT 1`, tabID).Scan(&sessionID)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			// The column is gone already (the migration ran before): nothing to map.
			if strings.Contains(err.Error(), "no such column") {
				return nil, nil
			}
			return nil, err
		}
		if !contains(out, sessionID) {
			out = append(out, sessionID)
		}
	}
	return out, nil
}

func contains(list []string, want string) bool {
	for _, have := range list {
		if have == want {
			return true
		}
	}
	return false
}

// writeOpenSessions replaces the stored open list during a migration.
func (s *Store) writeOpenSessions(sessionIDs []string) error {
	if sessionIDs == nil {
		sessionIDs = []string{}
	}
	data, err := json.Marshal(sessionIDs)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE current SET open_sessions = ?, updated_at = ? WHERE id = 1`,
		string(data), time.Now().UTC().Format(time.RFC3339))
	return err
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

// Current returns the workspace row.
func (s *Store) Current() (Current, error) {
	var out Current
	var openSessions string
	err := s.db.QueryRow(`SELECT open_sessions, main_session, updated_at FROM current WHERE id = 1`).
		Scan(&openSessions, &out.MainSession, &out.UpdatedAt)
	if err != nil {
		return Current{}, err
	}
	if openSessions == "" {
		openSessions = "[]"
	}
	if err := json.Unmarshal([]byte(openSessions), &out.OpenSessions); err != nil {
		out.OpenSessions = []string{}
	}
	if out.OpenSessions == nil {
		out.OpenSessions = []string{}
	}
	return out, nil
}

// PutCurrent replaces the workspace row: the open session ids (in display order)
// and the main session. It is the repair/reorder path; opening and closing a
// session has its own helpers below and does not need it.
func (s *Store) PutCurrent(openSessions []string, mainSession string) (Current, error) {
	if openSessions == nil {
		openSessions = []string{}
	}
	ids := make([]string, 0, len(openSessions))
	for _, id := range openSessions {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	data, err := json.Marshal(ids)
	if err != nil {
		return Current{}, err
	}
	_, err = s.db.Exec(`UPDATE current SET open_sessions = ?, main_session = ?, updated_at = ? WHERE id = 1`,
		string(data), strings.TrimSpace(mainSession), time.Now().UTC().Format(time.RFC3339))
	if err != nil {
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
