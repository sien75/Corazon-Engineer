package store

import (
	"database/sql"
	"fmt"
)

// MergeDatabase copies everything new from another engineer database into this
// one: rows are matched by primary key and an existing row is never overwritten,
// so running it twice is harmless. It is the repeatable half of the move to the
// home — the first migration copies the old database wholesale (store.Open on the
// home, then store.MigrateFrom copying the files), and this brings across
// whatever the old instance wrote afterwards.
//
// The other file is attached read-only in spirit: this only reads it. A table or
// column an older database does not have is read as its default, so a database
// written before `sessions.title` existed still merges.
//
// The workspace row (`current`) is deliberately not merged: it says which tabs are
// open *right now*, and two instances sharing one home would otherwise drag the
// open list back and forth. Sessions from the other database are still reachable
// (a project launcher's Recent), which is what a conversation needs.
func (s *Store) MergeDatabase(path string) (records int64, sessions int64, err error) {
	// Two processes may hold the file (a running instance plus this one): wait for
	// the write lock instead of failing on it.
	if _, err := s.db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		return 0, 0, err
	}
	if _, err := s.db.Exec(`ATTACH DATABASE ? AS old`, path); err != nil {
		return 0, 0, err
	}
	defer func() {
		if _, derr := s.db.Exec(`DETACH DATABASE old`); derr != nil && err == nil {
			err = derr
		}
	}()

	has := func(table, column string) (bool, error) {
		var one int
		err := s.db.QueryRow(fmt.Sprintf(
			`SELECT 1 FROM old.%s WHERE %s IS NOT NULL LIMIT 1`, table, column)).Scan(&one)
		switch {
		case err == sql.ErrNoRows:
			return true, nil // the column exists; the table is just empty
		case err != nil:
			return false, nil // "no such column" (or table): treat as absent
		}
		return true, nil
	}
	expr := func(table, column, fallback string) (string, error) {
		ok, err := has(table, column)
		if err != nil {
			return "", err
		}
		if ok {
			return column, nil
		}
		return fallback, nil
	}

	res, err := s.db.Exec(`INSERT OR IGNORE INTO records
			(id, created_at, kind, env, atom, session_id, summary, payload)
		SELECT id, created_at, kind,
			COALESCE(env, NULL), COALESCE(atom, NULL), COALESCE(session_id, NULL),
			summary, payload
		FROM old.records`)
	if err != nil {
		return 0, 0, err
	}
	records, _ = res.RowsAffected()

	blueprint, err := expr("sessions", "blueprint", "''")
	if err != nil {
		return records, 0, err
	}
	title, err := expr("sessions", "title", "''")
	if err != nil {
		return records, 0, err
	}
	res, err = s.db.Exec(fmt.Sprintf(`INSERT OR IGNORE INTO sessions
			(session_id, kind, project_id, blueprint, title, created_at)
		SELECT session_id, COALESCE(kind, 'sub'), '', COALESCE(%s, ''), COALESCE(%s, ''), created_at
		FROM old.sessions`, blueprint, title))
	if err != nil {
		return records, 0, err
	}
	sessions, _ = res.RowsAffected()
	return records, sessions, nil
}
