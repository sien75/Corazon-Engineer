// Package storage is the storage service: the engineer home's sqlite state —
// conversations (their messages and their session rows) — together with the
// read-only views of a folder's file tree (atoms / edges / contracts and the prose
// content beside them).
//
// One service, one process, one database. The two halves were separate services
// (log and static), and static had to ask log over HTTP for the folder every
// request meant, with a cache in front to keep a page load from costing a lookup
// per file. That is gone with the project board: a /static/* request carries the
// folder's own path.
//
// The wire keeps two prefixes: /log/* for the records and sessions, /static/* for
// a folder's files, because each path names the thing it acts on.
//
// It is not a program of its own. The engineer binary is a multi-call binary —
// one executable that the launcher also runs as each service, so that a machine
// which whitelists process execution sees as few distinct paths as possible.
// Serve is the entry point behind the `serve-storage` subcommand:
//
//	engineer serve-storage --bind <host> --port <n> --home <data dir>
//
// Every flag is required and there is no fallback. A leaf service does not get
// to guess its own address or where its data lives: the launcher owns both
// decisions and passes them down. A default here silently binds a port nobody
// asked for — which has already written test data into a real project.
//
// The root is the engineer home, not a project: conversations live in one
// database, because the program runs anywhere and a conversation's folder is an
// argument it was given, not a place it was started from.
package storage

import (
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"

	"engineer/storage/internal/server"
	"engineer/storage/internal/store"
)

const usage = "usage: engineer serve-storage --bind <host> --port <n> --home <data dir>"

// Serve runs the storage service until it is killed. argv is the argument list
// following the subcommand; on failure it prints to stderr and exits.
func Serve(argv []string) {
	fs := flag.NewFlagSet("serve-storage", flag.ExitOnError)
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
	fmt.Printf("engineer storage: storing in %s/engineer.db, serving records and project files on %s\n", *home, addr)
	if err := srv.Listen(addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
