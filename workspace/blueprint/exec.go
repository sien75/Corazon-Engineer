package blueprint

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// scriptTimeout bounds one script. A blueprint may legitimately fetch or build
// something slow; a hung script must still not hold the store's one connection
// for the rest of the session.
const scriptTimeout = 10 * time.Minute

// jsHarness is how a `blueprint/js` block becomes a program: the block is an ES
// module with a default export, and the harness hands it the input, calls it, and
// writes what it returns. A blueprint script is never a program with argv — it is
// one function, so every language has the same shape and flows never parse
// command lines.
const jsHarness = `import { pathToFileURL } from "node:url";
const file = process.argv[2];
const mod = await import(pathToFileURL(file).href);
const fn = mod.default ?? mod.run;
if (typeof fn !== "function") {
  console.error("blueprint: a blueprint/js script needs a default export, e.g. export default async (input) => output");
  process.exit(1);
}
const input = JSON.parse(process.env.BP_INPUT ?? "null");
const out = await fn(input);
if (out !== undefined) process.stdout.write(JSON.stringify(out));
`

// interpreterOf maps a script's `type` to the program that runs it. Anything not
// listed is taken as a command name itself: a machine with `deno` or `ruby` gets
// it for free, and an unknown name fails with the shell's own "command not found"
// rather than a list of ours.
func interpreterOf(kind string) (cmd, ext string) {
	switch kind {
	case "js", "mjs", "cjs", "ts":
		return "bun", ".mjs"
	case "sh", "shell":
		return "sh", ".sh"
	case "bash", "zsh":
		return kind, ".sh"
	case "py", "python", "python3":
		return "python3", ".py"
	default:
		return kind, ".txt"
	}
}

// execScript runs one script block with one JSON input and returns what it wrote
// as JSON. That is the whole contract for every language: JSON on stdin (and in
// BP_INPUT), JSON on stdout, a non-zero exit for failure, stderr for anything the
// page should see while it runs.
func (rt *Runtime) execScript(s Script, input any) (any, error) {
	kind := strings.ToLower(strings.TrimSpace(s.Kind))
	if kind == "" {
		return nil, fmt.Errorf("script %q has no type — write <script type=\"blueprint/js\" id=%q>", s.ID, s.ID)
	}

	payload := []byte("null")
	if input != nil {
		b, err := json.Marshal(input)
		if err != nil {
			return nil, fmt.Errorf("script %q: its input is not JSON: %w", s.ID, err)
		}
		payload = b
	}

	cmdName, ext := interpreterOf(kind)
	f, err := os.CreateTemp(rt.workDir, s.ID+"-*"+ext)
	if err != nil {
		return nil, err
	}
	file := f.Name()
	defer os.Remove(file)
	if _, err := f.WriteString(s.Code); err != nil {
		f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), scriptTimeout)
	defer cancel()

	var cmd *exec.Cmd
	if cmdName == "bun" {
		harness, err := rt.harnessPath()
		if err != nil {
			return nil, err
		}
		cmd = exec.CommandContext(ctx, cmdName, harness, file)
	} else {
		cmd = exec.CommandContext(ctx, cmdName, file)
	}
	// A script runs in the blueprint's own work directory, never in whatever
	// folder the service happens to have been started from.
	cmd.Dir = rt.workDir
	cmd.Env = append(os.Environ(),
		"BP_INPUT="+string(payload),
		"BP_BLUEPRINT="+rt.page.ID,
		"BP_SCRIPT="+s.ID,
		"BP_SCRIPT_FILE="+file,
	)
	cmd.Stdin = bytes.NewReader(payload)

	var out bytes.Buffer
	cmd.Stdout = &out
	stderr := &lineWriter{rt: rt, id: s.ID}
	cmd.Stderr = stderr

	runErr := cmd.Run()
	stderr.flush()
	if runErr != nil {
		return nil, fmt.Errorf("script %q (%s): %v%s", s.ID, kind, runErr, stderr.suffix())
	}

	text := strings.TrimSpace(out.String())
	if text == "" {
		return nil, nil
	}
	var v any
	if err := json.Unmarshal([]byte(text), &v); err != nil {
		// Not JSON: the text is the output. A `sh` step that prints one word is
		// still useful, and demanding JSON from it would buy nothing.
		return text, nil
	}
	return v, nil
}

func (rt *Runtime) harnessPath() (string, error) {
	path := filepath.Join(rt.workDir, "harness.mjs")
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	if err := os.WriteFile(path, []byte(jsHarness), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// lineWriter turns a script's stderr into bus events, line by line, while the
// script is still running: it is the only way a page sees progress before a step
// returns.
type lineWriter struct {
	rt   *Runtime
	id   string
	mu   sync.Mutex
	buf  []byte
	last string
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf = append(w.buf, p...)
	for {
		i := bytes.IndexByte(w.buf, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimRight(string(w.buf[:i]), "\r")
		w.buf = w.buf[i+1:]
		w.emit(line)
	}
	return len(p), nil
}

func (w *lineWriter) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.buf) > 0 {
		w.emit(strings.TrimRight(string(w.buf), "\r\n"))
		w.buf = nil
	}
}

func (w *lineWriter) emit(line string) {
	if line == "" {
		return
	}
	w.last = line
	w.rt.pushEvent(Event{
		Type:   "log",
		Source: "script:" + w.id,
		Data:   map[string]any{"message": line, "script": w.id},
		Time:   now(),
	})
}

// suffix is the last stderr line, appended to the failure message: a script that
// exits 1 after printing why has said everything a reader needs.
func (w *lineWriter) suffix() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.last == "" {
		return ""
	}
	return ": " + w.last
}