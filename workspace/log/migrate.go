package log

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"engineer/log/internal/store"
)

const migrateUsage = "usage: engineer migrate --home <data dir> --project <project dir> [--from <old .engineer dir>]"

// Migrate moves a project's old data into the engineer home and puts that
// project on the board.
//
// Before the home existed, every project kept its own database under
// `<project>/.engineer/engineer.db`. This is the one-way move: when the home has
// no database yet and `--from` names an old one, its files are copied over; then
// the project is registered and every sub session still without a project is
// assigned to it — those conversations belong to this folder, and after the move
// nothing else would claim them.
//
// It is repeatable. The first run copies the database; every later run merges
// whatever the old instance wrote since (rows matched by id, nothing
// overwritten), which is what keeps the home current while the previous build is
// still running against the old file. Only Engineer's own data is migrated this
// way — another project starts from an empty history by design.
func Migrate(argv []string) {
	fs := flag.NewFlagSet("migrate", flag.ExitOnError)
	home := fs.String("home", "", "engineer home directory — required")
	project := fs.String("project", "", "project directory to register — required")
	from := fs.String("from", "", "old .engineer directory to copy the database from")
	_ = fs.Parse(argv)

	if *home == "" || *project == "" {
		fmt.Fprintln(os.Stderr, migrateUsage)
		os.Exit(2)
	}
	if err := migrate(*home, *project, *from); err != nil {
		fmt.Fprintf(os.Stderr, "engineer migrate: %v\n", err)
		os.Exit(1)
	}
}

func migrate(home, project, from string) error {
	abs, err := filepath.Abs(project)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(home, 0o755); err != nil {
		return err
	}
	target := filepath.Join(home, "engineer.db")
	fromDB := ""
	if from != "" {
		src := filepath.Join(from, "engineer.db")
		if _, err := os.Stat(src); err == nil {
			fromDB = src
		}
		if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
			if err := copyDatabase(from, home); err != nil {
				return err
			}
			// The copy made the home a picture of the old database; there is
			// nothing left to merge.
			fromDB = ""
		}
	}

	st, err := store.Open(home)
	if err != nil {
		return err
	}
	defer st.Close()

	name := projectName(abs)
	p, err := st.AddProject(abs, name)
	if err != nil {
		return err
	}
	if fromDB != "" {
		recs, sess, err := st.MergeDatabase(fromDB)
		if err != nil {
			return err
		}
		fmt.Printf("engineer migrate: merged %d new record(s), %d new session(s) from %s\n",
			recs, sess, fromDB)
	}
	moved, err := st.AssignOrphanSessions(p.ProjectID)
	if err != nil {
		return err
	}
	fmt.Printf("engineer migrate: %s → %s (%s), %d session(s) assigned\n",
		abs, home, p.ProjectID, moved)
	return nil
}

// copyDatabase copies the three files sqlite keeps for a WAL database. The
// launcher runs this before any service starts, so nothing is writing them.
func copyDatabase(fromDir, toDir string) error {
	copied := 0
	for _, suffix := range []string{"", "-wal", "-shm"} {
		src := filepath.Join(fromDir, "engineer.db"+suffix)
		in, err := os.Open(src)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		dst := filepath.Join(toDir, "engineer.db"+suffix)
		out, err := os.Create(dst)
		if err != nil {
			in.Close()
			return err
		}
		_, err = io.Copy(out, in)
		in.Close()
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
		copied++
	}
	if copied == 0 {
		return fmt.Errorf("no engineer.db under %s", fromDir)
	}
	return nil
}

// projectName reads the display name out of the project marker, falling back to
// the directory name. The same reading happens in the web server when a project
// is added from the page; a folder with no usable marker still gets a name.
func projectName(dir string) string {
	if data, err := os.ReadFile(filepath.Join(dir, "engineer.yaml")); err == nil {
		var doc struct {
			Project string `yaml:"project"`
		}
		if yaml.Unmarshal(data, &doc) == nil {
			if name := strings.TrimSpace(doc.Project); name != "" {
				return name
			}
		}
	}
	return filepath.Base(dir)
}
