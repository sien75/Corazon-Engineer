package blueprint

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
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
	file, err := rt.writeScriptFile(s.ID, s.Code, ext)
	if err != nil {
		return nil, err
	}
	defer os.Remove(file)

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
	// A script works in the blueprints folder — that is the world a blueprint
	// lives in, and it is where a script's relative paths and its agent's cwd
	// point. The script file itself and the bun harness stay in the runtime's own
	// scratch directory: the blueprints folder belongs to the user, and it may be
	// under git.
	cmd.Dir = rt.opts.Blueprints
	cmd.Env = rt.scriptEnv(s.ID, file, string(payload))
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

// writeScriptFile puts one script block on disk, where its interpreter can run
// it: in the runtime's scratch directory, never in the blueprints folder.
func (rt *Runtime) writeScriptFile(id, code, ext string) (string, error) {
	f, err := os.CreateTemp(rt.workDir, id+"-*"+ext)
	if err != nil {
		return "", err
	}
	file := f.Name()
	if _, err := f.WriteString(code); err != nil {
		f.Close()
		os.Remove(file)
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(file)
		return "", err
	}
	return file, nil
}

// scriptEnv is everything a script is told about where it is: its input, its
// blueprint, its own name and file, and the ai service's address (BP_AI), so a
// blueprint can hold a conversation without the runtime holding one for it.
func (rt *Runtime) scriptEnv(id, file, input string) []string {
	env := append(os.Environ(),
		"BP_INPUT="+input,
		"BP_BLUEPRINT="+rt.page.ID,
		"BP_SCRIPT="+id,
		"BP_SCRIPT_FILE="+file,
		"BP_MODE="+rt.mode,
	)
	if rt.opts.AI != "" {
		env = append(env, "BP_AI="+rt.opts.AI)
	}
	return env
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

// ---------- the init script ----------

// initEvent is what an init script writes on stdout, one per line: an event for
// the bus. Only the init script is read this way — every other script's stdout is
// its one JSON answer, and a script that wants something to happen says so in the
// flow instead.
type initEvent struct {
	Emit string `json:"emit"`
	Data any    `json:"data"`
}

// initProcess is the blueprint's one long-lived script. It runs for as long as the
// runtime does — no timeout — which is how a blueprint listens to something
// outside itself: whatever the script is reading, it turns into events.
type initProcess struct {
	cmd      *exec.Cmd
	done     chan struct{}
	killOnce sync.Once
}

// kill ends the script and everything it started. The script is its own process
// group, so a `sh` init that spawned a watcher does not leave it behind.
func (p *initProcess) kill() {
	p.killOnce.Do(func() {
		if p.cmd.Process != nil {
			_ = syscall.Kill(-p.cmd.Process.Pid, syscall.SIGKILL)
			_ = p.cmd.Process.Kill()
		}
	})
	<-p.done
}

// startInit launches the blueprint's init script, if it has one. It is started
// after the schema has been applied, so a script that reads a table finds it.
func (rt *Runtime) startInit() error {
	if rt.page.Init == nil {
		return nil
	}
	s := *rt.page.Init
	kind := strings.ToLower(strings.TrimSpace(s.Kind))
	cmdName, ext := interpreterOf(kind)

	file, err := rt.writeScriptFile("init", s.Code, ext)
	if err != nil {
		return fmt.Errorf("init: %w", err)
	}

	var cmd *exec.Cmd
	if cmdName == "bun" {
		harness, err := rt.harnessPath()
		if err != nil {
			os.Remove(file)
			return fmt.Errorf("init: %w", err)
		}
		cmd = exec.Command(cmdName, harness, file)
	} else {
		cmd = exec.Command(cmdName, file)
	}
	cmd.Dir = rt.opts.Blueprints
	cmd.Env = rt.scriptEnv("init", file, "null")
	cmd.Stdin = strings.NewReader("")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		os.Remove(file)
		return fmt.Errorf("init: %w", err)
	}
	stderr := &lineWriter{rt: rt, id: s.ID}
	cmd.Stderr = stderr

	if err := cmd.Start(); err != nil {
		os.Remove(file)
		return fmt.Errorf("init (%s): %w", kind, err)
	}

	p := &initProcess{cmd: cmd, done: make(chan struct{})}
	rt.mu.Lock()
	rt.init = p
	rt.mu.Unlock()

	go rt.readInit(p, stdout, stderr, file)
	return nil
}

// readInit turns the init script's stdout into bus events until it exits. A line
// that is not an event is a log line, not a failure: a script that prints progress
// is doing what a script is supposed to do.
func (rt *Runtime) readInit(p *initProcess, stdout interface{ Read([]byte) (int, error) }, stderr *lineWriter, file string) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var ev initEvent
		if err := json.Unmarshal([]byte(line), &ev); err == nil && ev.Emit != "" {
			rt.emit(Event{Type: ev.Emit, Source: "init", Data: ev.Data}, 0)
			continue
		}
		rt.pushEvent(Event{
			Type:   "log",
			Source: "script:init",
			Data:   map[string]any{"message": line, "script": "init"},
		})
	}

	runErr := p.cmd.Wait()
	stderr.flush()
	os.Remove(file)
	close(p.done)

	// A script that dies is worth one line and no restart: a reload is the way to
	// bring it back, and a loop that restarts a crashing script would hide why.
	rt.mu.Lock()
	closed := rt.closed
	rt.mu.Unlock()
	if closed {
		return
	}
	msg := "init script exited"
	if runErr != nil {
		msg = "init script exited: " + runErr.Error() + stderr.suffix()
	}
	rt.pushEvent(Event{
		Type:   "log",
		Source: "script:init",
		Data:   map[string]any{"message": msg, "script": "init"},
	})
}
