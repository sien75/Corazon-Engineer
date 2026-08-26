package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"corazon/core/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	switch os.Args[1] {
	case "serve":
		fs := flag.NewFlagSet("serve", flag.ExitOnError)
		addr := fs.String("addr", ":8080", "listen address")
		root := fs.String("root", "", "corazon project root (auto-detected from cwd if empty)")
		_ = fs.Parse(os.Args[2:])
		r := *root
		if r == "" {
			r = findRoot()
		}
		srv := server.New(r)
		fmt.Printf("corazon core: serving %s on %s\n", r, *addr)
		if err := srv.Listen(*addr); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: corazon serve [--addr :8080] [--root <project dir>]")
}

func findRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "corazon.yaml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			fmt.Fprintln(os.Stderr, "corazon.yaml not found in any parent directory")
			os.Exit(1)
		}
		dir = parent
	}
}
