package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Project is one folder the user opened in Engineer. It is data in the home
// database, not a command-line argument: the program runs anywhere, and the
// projects it works on are a list it remembers.
//
// Removal is soft. A removed project keeps its row (and its sessions) and only
// leaves the board — adding the same path again clears removed_at, so the
// conversations of that folder come back with the project they belong to.
//
// Visible is the titlebar's group: hiding a project keeps it on the board and
// keeps its sessions open, and only stops drawing its group. It is stored here
// so a reload (or another window) shows the same board.
type Project struct {
	ProjectID string `yaml:"projectId"`
	Path      string `yaml:"path"`
	Name      string `yaml:"name"`
	CreatedAt string `yaml:"createdAt"`
	UpdatedAt string `yaml:"updatedAt"`
	RemovedAt string `yaml:"removedAt,omitempty"`
	Visible   bool   `yaml:"visible"`
}

func (p Project) Body() map[string]interface{} {
	return map[string]interface{}{
		"projectId": p.ProjectID,
		"path":      p.Path,
		"name":      p.Name,
		"createdAt": p.CreatedAt,
		"updatedAt": p.UpdatedAt,
		"visible":   p.Visible,
	}
}

// projectIDPattern is the only shape an id may have. It arrives from a request
// body and becomes a lookup key (and a URL segment), so it is checked before use.
var projectIDPattern = regexp.MustCompile(`^p_[0-9a-f]{12}$`)

// ValidProjectID reports whether an id has the shape this store hands out.
func ValidProjectID(id string) bool { return projectIDPattern.MatchString(id) }

func newProjectID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "p_" + hex.EncodeToString(b)
}

// ListProjects returns the projects on the board, in the order they were added.
// A removed project is not on the board; its row is still there.
func (s *Store) ListProjects() ([]Project, error) {
	rows, err := s.db.Query(`SELECT project_id, path, name, created_at, updated_at, removed_at, visible
		FROM projects WHERE removed_at = '' ORDER BY created_at ASC, project_id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ProjectID, &p.Path, &p.Name, &p.CreatedAt, &p.UpdatedAt, &p.RemovedAt, &p.Visible); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetProject returns one project by id, removed or not — a session of a removed
// project still names it, and its page has to stay resolvable. sql.ErrNoRows
// when the id is unknown.
func (s *Store) GetProject(projectID string) (Project, error) {
	projectID = strings.TrimSpace(projectID)
	if !ValidProjectID(projectID) {
		return Project{}, sql.ErrNoRows
	}
	var p Project
	err := s.db.QueryRow(`SELECT project_id, path, name, created_at, updated_at, removed_at, visible
		FROM projects WHERE project_id = ?`, projectID).
		Scan(&p.ProjectID, &p.Path, &p.Name, &p.CreatedAt, &p.UpdatedAt, &p.RemovedAt, &p.Visible)
	return p, err
}

// AddProject registers a folder. The store does not look at the filesystem: the
// caller has already checked that the path is an engineer project, and the name
// is the caller's reading of engineer.yaml. A path already on record keeps its
// id — re-adding a folder puts the same project (and its history) back on the
// board instead of starting a second one.
func (s *Store) AddProject(path, name string) (Project, error) {
	path = strings.TrimSpace(path)
	if !filepath.IsAbs(path) {
		return Project{}, fmt.Errorf("path must be absolute, got %q", path)
	}
	path = filepath.Clean(path)
	name = strings.TrimSpace(name)
	if name == "" {
		// No name given: the folder name is what a user recognizes. The web server
		// reads engineer.yaml's `project:` before it gets here; this is the fallback
		// for a direct caller (and for the launcher's migration).
		name = filepath.Base(path)
	}
	now := time.Now().UTC().Format(time.RFC3339)

	var existing string
	err := s.db.QueryRow(`SELECT project_id FROM projects WHERE path = ?`, path).Scan(&existing)
	switch {
	case err == sql.ErrNoRows:
		existing = newProjectID()
		if _, err := s.db.Exec(`INSERT INTO projects (project_id, path, name, created_at, updated_at, removed_at, visible)
			VALUES (?, ?, ?, ?, ?, '', 1)`, existing, path, name, now, now); err != nil {
			return Project{}, err
		}
	case err != nil:
		return Project{}, err
	default:
		// Back on the board. An empty name keeps the stored one.
		if _, err := s.db.Exec(`UPDATE projects SET
				name = CASE WHEN ? = '' THEN name ELSE ? END,
				updated_at = ?, removed_at = ''
			WHERE project_id = ?`, name, name, now, existing); err != nil {
			return Project{}, err
		}
	}
	return s.GetProject(existing)
}

// RemoveProject takes a project off the board (soft: row, sessions and folder all
// stay). Removing one that is already off the board is a no-op.
func (s *Store) RemoveProject(projectID string) (Project, error) {
	p, err := s.GetProject(projectID)
	if err != nil {
		return Project{}, err
	}
	if p.RemovedAt != "" {
		return p, nil
	}
	if _, err := s.db.Exec(`UPDATE projects SET removed_at = ?, updated_at = ? WHERE project_id = ?`,
		time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), p.ProjectID); err != nil {
		return Project{}, err
	}
	return s.GetProject(projectID)
}

// SetProjectVisible shows or hides a project's group in the titlebar. It changes
// nothing about the project itself: the folder, the sessions and their open state
// are untouched — a hidden group that comes back shows the same tabs it had.
func (s *Store) SetProjectVisible(projectID string, visible bool) (Project, error) {
	p, err := s.GetProject(projectID)
	if err != nil {
		return Project{}, err
	}
	if _, err := s.db.Exec(`UPDATE projects SET visible = ?, updated_at = ? WHERE project_id = ?`,
		boolInt(visible), time.Now().UTC().Format(time.RFC3339), p.ProjectID); err != nil {
		return Project{}, err
	}
	return s.GetProject(projectID)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
