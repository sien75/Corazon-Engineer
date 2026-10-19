package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Session is a conversation's identity: the id its records and its agent copy are
// keyed by, and the kind the rest of the system reads it as. kind is "main" for
// the one conversation the shell itself hosts, "sub" for everything instantiated
// from a blueprint. A session with no row is read as "sub": the table starts out
// backfilled from records, so older projects need no migration of their own.
type Session struct {
	SessionID string `yaml:"sessionId"`
	Kind      string `yaml:"kind"`
	// Blueprint is the slug of the page this conversation drives; "" for main and
	// for conversations that never had one. The web server resolves
	// /agent/<sessionId>/ through it — the database is the only place the mapping
	// lives, so a page is never inferred from the URL.
	Blueprint string `yaml:"blueprint"`
	// TabID is the tab this conversation belongs to; "" when it belongs to none.
	// It is written once, by the tab's own write, and never changed afterwards: a
	// conversation is only reachable through its tab, so a tab that is deleted
	// takes its conversations with it.
	TabID     string `yaml:"tabId"`
	CreatedAt string `yaml:"createdAt"`
}

// Current is the one row of workspace state: which tabs are open (in display
// order) and which session the shell's own chat is. It is the single source of
// truth for both — a browser reload reads it back instead of restoring anything
// from local storage.
type Current struct {
	OpenTabs    []string `yaml:"openTabs"`
	MainSession string   `yaml:"mainSession,omitempty"`
	UpdatedAt   string   `yaml:"updatedAt"`
}

func (c Current) Body() map[string]interface{} {
	open := c.OpenTabs
	if open == nil {
		open = []string{}
	}
	return map[string]interface{}{
		"openTabs":    open,
		"mainSession": c.MainSession,
		"updatedAt":   c.UpdatedAt,
	}
}

func (s *Store) createWorkspaceTables() error {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			kind TEXT NOT NULL DEFAULT 'sub',
			blueprint TEXT NOT NULL DEFAULT '',
			tab_id TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS current (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			open_tabs TEXT NOT NULL,
			main_session TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL
		)`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	// A database that predates the blueprint column gets it in place: pages are
	// resolved through it, so every project started before this change must not
	// fall over. "duplicate column name" is the already-migrated case.
	if _, err := s.db.Exec(`ALTER TABLE sessions ADD COLUMN blueprint TEXT NOT NULL DEFAULT ''`); err != nil &&
		!strings.Contains(err.Error(), "duplicate column name") {
		return err
	}
	// The tab a conversation belongs to arrived with tabs-as-containers: a project
	// started before it keeps "belongs to none", which reads as "reachable only if
	// something still shows it".
	if _, err := s.db.Exec(`ALTER TABLE sessions ADD COLUMN tab_id TEXT NOT NULL DEFAULT ''`); err != nil &&
		!strings.Contains(err.Error(), "duplicate column name") {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO current (id, open_tabs, main_session, updated_at)
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

// UpsertSession stores a session's kind. An existing row keeps its createdAt; a
// blank kind means "sub".
func (s *Store) UpsertSession(sessionID, kind, blueprint string) (Session, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return Session{}, sql.ErrNoRows
	}
	if kind != "main" {
		kind = "sub"
	}
	// An empty blueprint on an existing row means "caller did not say", not
	// "forget it" — a resume/replay must not wipe the page a session drives.
	blueprint = strings.TrimSpace(blueprint)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO sessions (session_id, kind, blueprint, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			kind = excluded.kind,
			blueprint = CASE WHEN excluded.blueprint = '' THEN sessions.blueprint ELSE excluded.blueprint END`,
		sessionID, kind, blueprint, now)
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(sessionID)
}

// GetSession returns one session; sql.ErrNoRows when it does not exist.
func (s *Store) GetSession(sessionID string) (Session, error) {
	var out Session
	err := s.db.QueryRow(`SELECT session_id, kind, blueprint, tab_id, created_at FROM sessions WHERE session_id = ?`,
		sessionID).Scan(&out.SessionID, &out.Kind, &out.Blueprint, &out.TabID, &out.CreatedAt)
	return out, err
}

// BindSessions records that these conversations are shown by this tab. A binding
// is written once and never moved: a conversation already bound to another tab is
// an error that names that tab, because the caller should reopen it instead of
// putting a second copy on screen.
func (s *Store) BindSessions(tabID string, sessionIDs []string) error {
	for _, id := range sessionIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		var current string
		err := s.db.QueryRow(`SELECT tab_id FROM sessions WHERE session_id = ?`, id).Scan(&current)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			// A conversation with no row yet still gets one, so the binding has
			// somewhere to live; kind and blueprint are filled by ai's own upsert.
			if _, err := s.db.Exec(`INSERT INTO sessions (session_id, kind, blueprint, tab_id, created_at)
				VALUES (?, 'sub', '', ?, ?)`, id, tabID, time.Now().UTC().Format(time.RFC3339)); err != nil {
				return err
			}
			continue
		case err != nil:
			return err
		case current == tabID:
			continue // already this tab's
		case current != "":
			return fmt.Errorf("session %s already belongs to tab %s", id, current)
		}
		if _, err := s.db.Exec(`UPDATE sessions SET tab_id = ? WHERE session_id = ? AND tab_id = ''`, tabID, id); err != nil {
			return err
		}
	}
	return nil
}

// TouchSessionTab moves the lastAt of the tab a conversation belongs to. A record
// write is the only thing that makes a tab look recently used without its layout
// changing, so this is what keeps the launcher's order honest.
func (s *Store) TouchSessionTab(sessionID, at string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	_, err := s.db.Exec(`UPDATE tabs SET last_at = ? WHERE tab_id =
		(SELECT tab_id FROM sessions WHERE session_id = ?) AND last_at < ?`, at, sessionID, at)
	return err
}

// Current returns the workspace row.
func (s *Store) Current() (Current, error) {
	var out Current
	var openTabs string
	err := s.db.QueryRow(`SELECT open_tabs, main_session, updated_at FROM current WHERE id = 1`).
		Scan(&openTabs, &out.MainSession, &out.UpdatedAt)
	if err != nil {
		return Current{}, err
	}
	if openTabs == "" {
		openTabs = "[]"
	}
	if err := json.Unmarshal([]byte(openTabs), &out.OpenTabs); err != nil {
		out.OpenTabs = []string{}
	}
	if out.OpenTabs == nil {
		out.OpenTabs = []string{}
	}
	return out, nil
}

// PutCurrent replaces the workspace row: the open tab ids (in display order) and
// the main session. It is the repair/reorder path; opening and closing a tab has
// its own helpers below and does not need it.
func (s *Store) PutCurrent(openTabs []string, mainSession string) (Current, error) {
	if openTabs == nil {
		openTabs = []string{}
	}
	ids := make([]string, 0, len(openTabs))
	for _, id := range openTabs {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	data, err := json.Marshal(ids)
	if err != nil {
		return Current{}, err
	}
	_, err = s.db.Exec(`UPDATE current SET open_tabs = ?, main_session = ?, updated_at = ? WHERE id = 1`,
		string(data), strings.TrimSpace(mainSession), time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return Current{}, err
	}
	return s.Current()
}

// AddOpenTabs appends tab ids to the open list (idempotent). index places the
// first newly opened tab; -1 appends. Already-open tabs keep their place.
func (s *Store) AddOpenTabs(tabIDs []string, index int) error {
	cur, err := s.Current()
	if err != nil {
		return err
	}
	open := append([]string{}, cur.OpenTabs...)
	fresh := make([]string, 0, len(tabIDs))
	for _, id := range tabIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		seen := false
		for _, have := range open {
			if have == id {
				seen = true
				break
			}
		}
		for _, have := range fresh {
			if have == id {
				seen = true
				break
			}
		}
		if !seen {
			fresh = append(fresh, id)
		}
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

// RemoveOpenTabs drops tab ids from the open list, keeping their records.
func (s *Store) RemoveOpenTabs(tabIDs []string) error {
	cur, err := s.Current()
	if err != nil {
		return err
	}
	drop := map[string]bool{}
	for _, id := range tabIDs {
		drop[strings.TrimSpace(id)] = true
	}
	kept := make([]string, 0, len(cur.OpenTabs))
	for _, id := range cur.OpenTabs {
		if !drop[id] {
			kept = append(kept, id)
		}
	}
	if len(kept) == len(cur.OpenTabs) {
		return nil
	}
	_, err = s.PutCurrent(kept, cur.MainSession)
	return err
}

// AddOpenTab appends a tab id to the open list (idempotent).
func (s *Store) AddOpenTab(tabID string) error {
	return s.AddOpenTabs([]string{tabID}, -1)
}

// RemoveOpenTab drops a tab id from the open list, keeping the tab's record.
func (s *Store) RemoveOpenTab(tabID string) error {
	return s.RemoveOpenTabs([]string{tabID})
}

// DeleteTab removes a tab record and takes it out of the open list.
func (s *Store) DeleteTab(tabID string) error {
	if _, err := s.db.Exec(`DELETE FROM tabs WHERE tab_id = ?`, tabID); err != nil {
		return err
	}
	return s.RemoveOpenTab(tabID)
}
