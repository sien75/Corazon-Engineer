// Package static is the static service: it reads the schema (atoms / edges /
// contracts) out of the project tree and serves it over the static HTTP API.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-static` subcommand:
//
//	engineer serve-static [--addr 127.0.0.1:7502] [--root <project dir>]
package static

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"engineer/static/internal/server"
)

// Serve runs the static service until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	fs := flag.NewFlagSet("serve-static", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:7502", "listen address (address the launcher chose; loopback by default)")
	root := fs.String("root", "", "engineer project root (auto-detected from cwd if empty)")
	_ = fs.Parse(argv)
	r := *root
	if r == "" {
		r = findRoot()
	}
	srv := server.New(r)
	fmt.Printf("engineer static: serving schema for %s on %s\n", r, *addr)
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
