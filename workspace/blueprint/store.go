package blueprint

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

// Store is one blueprint's sqlite file. A blueprint is filed under its identity,
// never under a path: deleting and re-adding the file with the same id finds the
// same data, and two blueprints cannot reach each other's tables because they do
// not share a database at all.
//
// The store is the only writer of it: a flow's `sql` step and the page's
// `bp.sql` both come through here, which is why this process knows a table
// changed and can push it to the page.
type Store struct {
	db   *sql.DB
	path string

	mu   sync.Mutex
	hook func() // called after a write commits; the runtime turns it into change pushes
}

// openStore opens (or creates) the sqlite file for one blueprint identity in one
// mode and runs the blueprint's own CREATE statements. A blueprint keeps its data:
// the statements it writes must therefore be idempotent (`CREATE TABLE IF NOT
// EXISTS`), and nothing here drops or recreates a table.
//
// The mode is part of the file name, and that is the whole of the dev / prod
// split: working on a blueprint never writes the rows the user is using, and they
// are the same file read twice, so nothing else has to know which mode it is in.
func openStore(home, id, mode string) (*Store, error) {
	dir := filepath.Join(home, "blueprints")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, id+"."+mode+".sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// One connection: sqlite has a single writer, and serializing here keeps
	// "somebody wrote" from racing the change push.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db, path: path}, nil
}

// Apply runs the blueprint's schema blocks. It is called once per load, before
// any flow can run.
func (s *Store) Apply(blocks []string) error {
	for _, block := range blocks {
		if _, err := s.db.Exec(block); err != nil {
			return fmt.Errorf("sql block rejected: %w", err)
		}
	}
	return nil
}

// afterWrite registers the hook that turns a write into change pushes. Every
// write goes through Exec, so this is the one place a page learns about it.
func (s *Store) afterWrite(fn func()) {
	s.mu.Lock()
	s.hook = fn
	s.mu.Unlock()
}

// Exec runs one statement and, when it changed the database, tells the runtime.
func (s *Store) Exec(stmt string, params any) error {
	args := argsOf(params)
	if _, err := s.db.Exec(stmt, args...); err != nil {
		return err
	}
	if !isRead(stmt) {
		s.fire()
	}
	return nil
}

// Query runs one statement and returns its rows as objects, the shape a page
// consumes and the shape a step passes on.
func (s *Store) Query(stmt string, params any) ([]map[string]any, error) {
	return queryRows(s.db, stmt, params)
}

// Rows returns a whole table, in rowid order when it has one. This is what a
// watch pushes: the page always redraws from a full answer, never from a diff.
func (s *Store) Rows(table string) ([]map[string]any, error) {
	if !tableShape.MatchString(table) {
		return nil, fmt.Errorf("not a table name: %q", table)
	}
	return queryRows(s.db, "SELECT * FROM `"+table+"`", nil)
}

func (s *Store) fire() {
	s.mu.Lock()
	hook := s.hook
	s.mu.Unlock()
	if hook != nil {
		hook()
	}
}

func (s *Store) Close() error { return s.db.Close() }

// ---------- sql helpers ----------

// isRead decides whether a statement can change the database. It is a prefix
// test, not a sql parser: the only cost of guessing "write" on a read is one
// extra change push, and the cost of guessing the other way is a page that never
// updates.
func isRead(stmt string) bool {
	s := strings.ToLower(strings.TrimSpace(stmt))
	for _, prefix := range []string{"select", "pragma", "explain", "with"} {
		if strings.HasPrefix(s, prefix) {
			return true
		}
	}
	return false
}

// argsOf binds `:name` parameters (a map) or positional ones (a list). Both
// spellings reach a blueprint: a flow's `with` map names its parameters, a
// page's bp.sql may pass either.
func argsOf(params any) []any {
	switch p := params.(type) {
	case nil:
		return nil
	case []any:
		return p
	case map[any]any:
		m := make(map[string]any, len(p))
		for k, v := range p {
			m[fmt.Sprint(k)] = v
		}
		return namedOf(m)
	case map[string]any:
		return namedOf(p)
	}
	return nil
}

func namedOf(params map[string]any) []any {
	if len(params) == 0 {
		return nil
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]any, 0, len(keys))
	for _, k := range keys {
		out = append(out, sql.Named(k, params[k]))
	}
	return out
}

func queryRows(db *sql.DB, stmt string, params any) ([]map[string]any, error) {
	rows, err := db.Query(stmt, argsOf(params)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make(map[string]any, len(cols))
		for i, c := range cols {
			row[c] = jsonable(vals[i])
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// jsonable converts what the driver hands back into something encoding/json
// writes: blobs are text unless they are not valid utf-8, in which case base64 is
// no more useful to a page than an empty string — so text it is, byte for byte.
func jsonable(v any) any {
	switch x := v.(type) {
	case []byte:
		return string(x)
	case nil:
		return nil
	default:
		return x
	}
}
