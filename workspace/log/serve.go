// Package log is the log service: the sqlite-backed record store (call /
// observe / conversation) behind the log HTTP API.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-log` subcommand:
//
//	engineer serve-log [--addr 127.0.0.1:7503] [--root <project dir>]
package log

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"engineer/log/internal/server"
	"engineer/log/internal/store"
)

// Serve runs the log service until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	fs := flag.NewFlagSet("serve-log", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:7503", "listen address (address the launcher chose; loopback by default)")
	root := fs.String("root", "", "engineer project root (auto-detected from cwd if empty)")
	_ = fs.Parse(argv)
	r := *root
	if r == "" {
		r = findRoot()
	}
	st, err := store.Open(r)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open store: %v\n", err)
		os.Exit(1)
	}
	defer st.Close()
	srv := server.New(st)
	fmt.Printf("engineer log: storing in %s/.engineer/engineer.db, serving on %s\n", r, *addr)
	if err := srv.Listen(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func findRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "engineer.yaml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			fmt.Fprintln(os.Stderr, "engineer.yaml not found in any parent directory")
			os.Exit(1)
		}
		dir = parent
	}
}
