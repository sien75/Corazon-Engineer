// Package log is the log service: the sqlite-backed record store (call /
// observe / conversation) behind the log HTTP API.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-log` subcommand:
//
//	engineer serve-log --bind <host> --port <n> --home <data dir>
//
// Every flag is required and there is no fallback. A leaf service does not get
// to guess its own address or where its data lives: the launcher owns both
// decisions and passes them down. A default here silently binds a port nobody
// asked for — which has already written test data into a real project.
//
// The root is the engineer home, not a project: sessions of every project, the
// project board and the workspace row live in one database, because the program
// runs anywhere and the projects it serves are data it remembers.
package log

import (
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"

	"engineer/log/internal/server"
	"engineer/log/internal/store"
)

const usage = "usage: engineer serve-log --bind <host> --port <n> --home <data dir>"

// Serve runs the log service until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	fs := flag.NewFlagSet("serve-log", flag.ExitOnError)
	bind := fs.String("bind", "", "listen host — required")
	port := fs.Int("port", 0, "listen port — required")
	home := fs.String("home", "", "engineer home directory (data, not a project) — required")
	_ = fs.Parse(argv)

	if *bind == "" || *port == 0 || *home == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	st, err := store.Open(*home)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open store: %v\n", err)
		os.Exit(1)
	}
	defer st.Close()

	addr := net.JoinHostPort(*bind, strconv.Itoa(*port))
	srv := server.New(st)
	fmt.Printf("engineer log: storing in %s/engineer.db, serving on %s\n", *home, addr)
	if err := srv.Listen(addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
