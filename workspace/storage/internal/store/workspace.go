package store

import (
	"database/sql"
	"strings"
	"time"
)

// Session is a conversation's row. A session is a plain conversation: the folder
// its agent works in, the text appended to its system prompt, its display name
// and the two models it runs. Nothing here says what the conversation is for —
// that belongs to whoever started it.
type Session struct {
	SessionID  string `yaml:"sessionId"`
	Cwd        string `yaml:"cwd"`
	System     string `yaml:"system"`
	Title      string `yaml:"title"`
	Model      string `yaml:"model"`
	ImageModel string `yaml:"imageModel"`
	CreatedAt  string `yaml:"createdAt"`
}

func (s Session) Body() map[string]interface{} {
	return map[string]interface{}{
		"sessionId":  s.SessionID,
		"cwd":        s.Cwd,
		"system":     s.System,
		"title":      s.Title,
		"model":      s.Model,
		"imageModel": s.ImageModel,
		"createdAt":  s.CreatedAt,
	}
}

func (s *Store) createWorkspaceTables() error {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			cwd TEXT NOT NULL DEFAULT '',
			system TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			image_model TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		)`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

// UpsertSession stores a session's folder, system text, display name and the
// chat / image models it runs. An existing row keeps its createdAt, and an empty
// folder / system / title / model / imageModel keeps the stored value: a resume
// or a replay says nothing about them, so it must not wipe them.
func (s *Store) UpsertSession(sessionID, cwd, system, title, model, imageModel string) (Session, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return Session{}, sql.ErrNoRows
	}
	cwd = strings.TrimSpace(cwd)
	title = strings.TrimSpace(title)
	model = strings.TrimSpace(model)
	imageModel = strings.TrimSpace(imageModel)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO sessions (session_id, cwd, system, title, model, image_model, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			cwd = CASE WHEN excluded.cwd = '' THEN sessions.cwd ELSE excluded.cwd END,
			system = CASE WHEN excluded.system = '' THEN sessions.system ELSE excluded.system END,
			title = CASE WHEN excluded.title = '' THEN sessions.title ELSE excluded.title END,
			model = CASE WHEN excluded.model = '' THEN sessions.model ELSE excluded.model END,
			image_model = CASE WHEN excluded.image_model = '' THEN sessions.image_model ELSE excluded.image_model END`,
		sessionID, cwd, system, title, model, imageModel, now)
	if err != nil {
		return Session{}, err
	}
	return s.GetSession(sessionID)
}

// GetSession returns one session; sql.ErrNoRows when it does not exist.
func (s *Store) GetSession(sessionID string) (Session, error) {
	var out Session
	err := s.db.QueryRow(`SELECT session_id, cwd, system, title, model, image_model, created_at
		FROM sessions WHERE session_id = ?`,
		sessionID).Scan(&out.SessionID, &out.Cwd, &out.System, &out.Title, &out.Model, &out.ImageModel, &out.CreatedAt)
	return out, err
}
