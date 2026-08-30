package main

//go:generate go run ./cmd/gen

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"corazon/ai/internal/ai"
	"corazon/ai/internal/server"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "serve-ai" {
		usage()
		os.Exit(1)
	}
	fs := flag.NewFlagSet("serve-ai", flag.ExitOnError)
	addr := fs.String("addr", ":7501", "listen address")
	root := fs.String("root", "", "corazon project root (auto-detected from cwd if empty)")
	staticBase := fs.String("static", "http://localhost:7502", "static service base url")
	logBase := fs.String("log", "http://localhost:7503", "log service base url")
	_ = fs.Parse(os.Args[2:])
	r := *root
	if r == "" {
		r = findRoot()
	}
	creds := ai.LoadCredentials(r)
	key := creds[ai.KeyDeepSeek]
	if key == "" {
		fmt.Fprintln(os.Stderr, "warning: DEEPSEEK_API_KEY not found in "+r+"/"+ai.CredentialsPath+"; ai falls back to echo stub")
	}
	srv := server.New(ai.NewStore(key, *staticBase, *logBase))
	fmt.Printf("corazon ai: serving on %s (static=%s log=%s)\n", *addr, *staticBase, *logBase)
	if err := srv.Listen(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: corazon serve-ai [--addr :7501] [--root <project dir>]")
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
