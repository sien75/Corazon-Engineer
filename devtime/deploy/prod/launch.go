// Command corazon is the prod launcher shipped in the package. It starts the
// four packaged services (log, static, ai, web) on free ports, names the
// terminal "corazon", holds the foreground until Ctrl-C, then tears the whole
// stack down.
//
// It is a native binary on purpose: the terminal's foreground process is named
// "corazon" (not the shell running a start.sh script), so terminals that title
// tabs from the process name — VS Code, notably — show "corazon" with no
// configuration.
package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const usageText = "usage: corazon [start|status|version|uninstall [--purge]]"

// default ports; the launcher advances to the next free one on conflict
var defaultPorts = map[string]int{"web": 7500, "ai": 7501, "static": 7502, "log": 7503}

func main() {
	cmd := "start"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "", "start":
		launch()
	case "status":
		status()
	case "version":
		fmt.Println(versionName())
	case "uninstall":
		uninstall(len(os.Args) > 2 && os.Args[2] == "--purge")
	default:
		fmt.Fprintln(os.Stderr, usageText)
		os.Exit(1)
	}
}

// launch starts all four services in the foreground and returns when every one
// of them has exited (Ctrl-C included).
func launch() {
	root, err := os.Getwd()
	if err != nil {
		fatal(err)
	}
	binDir, pkg := selfDirs()

	d := filepath.Join(root, ".corazon")
	runDir := filepath.Join(d, "run")
	logDir := filepath.Join(d, "logs")
	mustMkdir(runDir)
	mustMkdir(logDir)

	// name the terminal/window/tab "corazon" for terminals that honor OSC titles
	if isTTY(os.Stdout) {
		fmt.Print("\033]0;corazon\007")
	}

	reclaim(runDir, root)

	ports := map[string]int{}
	used := map[int]bool{}
	for _, name := range []string{"web", "ai", "static", "log"} {
		p := pickPort(defaultPorts[name], used)
		used[p] = true
		ports[name] = p
	}
	base := "http://localhost"
	addr := func(name string) string { return ":" + strconv.Itoa(ports[name]) }

	specs := []*service{
		{name: "log", bin: filepath.Join(binDir, "corazon-log"),
			args: []string{"serve-log", "--root", root, "--addr", addr("log")}},
		{name: "static", bin: filepath.Join(binDir, "corazon-static"),
			args: []string{"serve-static", "--root", root, "--addr", addr("static")}},
		{name: "ai", bin: filepath.Join(binDir, "corazon-ai"),
			args: []string{"--root", root, "--addr", addr("ai"),
				"--agents", filepath.Join(pkg, "agents", "AGENTS.md"),
				"--log", base + addr("log"), "--static", base + addr("static")}},
		{name: "web", bin: filepath.Join(binDir, "corazon-web"),
			args: []string{strconv.Itoa(ports["web"]), "--root", filepath.Join(pkg, "web"),
				"--static", base + addr("static"), "--ai", base + addr("ai"), "--log", base + addr("log")}},
	}

	started := make([]*service, 0, len(specs))
	for _, s := range specs {
		s.pidPath = filepath.Join(runDir, s.name+".pid")
		s.logPath = filepath.Join(logDir, s.name+".log")
		if err := start(s); err != nil {
			killAll(started)
			removePids(runDir)
			fatal(fmt.Errorf("start %s: %w", s.name, err))
		}
		started = append(started, s)
	}

	fmt.Printf("corazon up — project: %s\n", root)
	fmt.Printf("  web     %s:%d\n", base, ports["web"])
	fmt.Printf("  ai      %s:%d\n", base, ports["ai"])
	fmt.Printf("  static  %s:%d\n", base, ports["static"])
	fmt.Printf("  log     %s:%d\n", base, ports["log"])
	fmt.Printf("logs: %s/    stop: Ctrl-C\n", logDir)

	// Hold the foreground until Ctrl-C (or until every service has exited).
	// Children share our process group, so Ctrl-C reaches them directly too;
	// the handler just makes sure a signal aimed at us alone (kill <pid>) also
	// brings the stack down.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	exited := make(chan struct{}, len(started))
	for _, s := range started {
		go func(s *service) {
			_ = s.cmd.Wait()
			exited <- struct{}{}
		}(s)
	}

	killed := false
	for remaining := len(started); remaining > 0; {
		select {
		case <-sigCh:
			if !killed {
				killed = true
				killAll(started)
			}
		case <-exited:
			remaining--
		}
	}
	removePids(runDir)
}

// status prints the per-service state of the current project.
func status() {
	root, err := os.Getwd()
	if err != nil {
		fatal(err)
	}
	runDir := filepath.Join(root, ".corazon", "run")
	for _, name := range []string{"log", "static", "ai", "web"} {
		pid, err := readPid(filepath.Join(runDir, name+".pid"))
		if err == nil && alive(pid) {
			fmt.Printf("%s: running (pid %d)\n", name, pid)
		} else {
			fmt.Printf("%s: stopped\n", name)
		}
	}
}

// versionName is the installed package dir of the running binary, e.g.
// "corazon-3a3eff8-darwin-arm64".
func versionName() string {
	_, pkg := selfDirs()
	return filepath.Base(pkg)
}

// uninstall removes the software and the command. Project .corazon/ dirs are
// never touched — they stay with their projects.
func uninstall(purge bool) {
	home := corazonHome()
	apps := filepath.Join(home, "apps")
	cur := filepath.Join(apps, "current")
	if _, err := os.Readlink(cur); err != nil {
		fmt.Fprintln(os.Stderr, "corazon: not installed")
		os.Exit(1)
	}

	// stop every running service of the installed version, across projects
	if realCur, err := filepath.EvalSymlinks(cur); err == nil {
		killMatching(filepath.Join(realCur, "bin", "corazon-"))
	}
	_ = os.RemoveAll(apps)
	_ = os.RemoveAll(filepath.Join(home, "bin"))
	_ = os.Remove("/usr/local/bin/corazon")

	if purge {
		_ = os.RemoveAll(home)
		fmt.Println("corazon uninstalled (purged)")
	} else {
		fmt.Println("corazon uninstalled")
	}
}

// --- services ------------------------------------------------------------

type service struct {
	name    string
	bin     string
	args    []string
	pidPath string
	logPath string
	cmd     *exec.Cmd
}

func start(s *service) error {
	f, err := os.OpenFile(s.logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()

	cmd := exec.Command(s.bin, s.args...)
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.Stdin = nil
	if err := cmd.Start(); err != nil {
		return err
	}
	s.cmd = cmd
	return os.WriteFile(s.pidPath, []byte(strconv.Itoa(cmd.Process.Pid)), 0o644)
}

func killAll(svcs []*service) {
	for _, s := range svcs {
		if s != nil && s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Signal(syscall.SIGTERM)
		}
	}
}

func removePids(runDir string) {
	for _, name := range []string{"web", "ai", "static", "log"} {
		_ = os.Remove(filepath.Join(runDir, name+".pid"))
	}
}

// reclaim stops a previous instance of THIS project (recorded pids, then any
// stray process started with --root pointing here) so we reuse its ports
// instead of advancing past them. Another project's stack is never touched.
func reclaim(runDir, root string) {
	for _, name := range []string{"web", "ai", "static", "log"} {
		pf := filepath.Join(runDir, name+".pid")
		if pid, err := readPid(pf); err == nil {
			_ = syscall.Kill(pid, syscall.SIGTERM)
		}
		_ = os.Remove(pf)
	}
	killMatching("root " + root)
	time.Sleep(time.Second)
}

// --- ports ---------------------------------------------------------------

// pickPort returns the first port >= p that is free and not already chosen.
func pickPort(p int, used map[int]bool) int {
	for {
		if !used[p] && portFree(p) {
			return p
		}
		p++
	}
}

func portFree(p int) bool {
	l, err := net.Listen("tcp", ":"+strconv.Itoa(p))
	if err != nil {
		return false
	}
	_ = l.Close()

	// The bind test alone is not enough. A listener that set SO_REUSEPORT —
	// Bun's servers do — still lets a second bind to the same port succeed on
	// macOS, so this probe would call an occupied port free; the launcher then
	// prints an address whose traffic goes to the other process. Ask the port
	// directly as well: if anything answers, it is taken.
	c, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(p), 300*time.Millisecond)
	if err == nil {
		_ = c.Close()
		return false
	}
	return true
}

// --- process helpers -----------------------------------------------------

type proc struct {
	pid int
	cmd string
}

func listProcesses() []proc {
	out, err := exec.Command("ps", "-ax", "-o", "pid=,command=").Output()
	if err != nil {
		return nil
	}
	var procs []proc
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		i := strings.IndexAny(line, " \t")
		if i < 0 {
			continue
		}
		pid, err := strconv.Atoi(line[:i])
		if err != nil {
			continue
		}
		procs = append(procs, proc{pid: pid, cmd: strings.TrimSpace(line[i+1:])})
	}
	return procs
}

// killMatching SIGTERMs every process whose command line contains needle,
// except ourselves.
func killMatching(needle string) {
	self := os.Getpid()
	for _, p := range listProcesses() {
		if p.pid != self && strings.Contains(p.cmd, needle) {
			_ = syscall.Kill(p.pid, syscall.SIGTERM)
		}
	}
}

func alive(pid int) bool {
	return syscall.Kill(pid, 0) == nil
}

func readPid(path string) (int, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(b)))
}

// --- paths / misc --------------------------------------------------------

// selfDirs returns the directory holding the sibling service binaries and the
// package root holding web/, agents/, docs/.
func selfDirs() (binDir, pkgDir string) {
	exe, err := os.Executable()
	if err != nil {
		fatal(err)
	}
	real, err := filepath.EvalSymlinks(exe)
	if err != nil {
		fatal(err)
	}
	binDir = filepath.Dir(real)
	if filepath.Base(binDir) == "bin" {
		pkgDir = filepath.Dir(binDir)
	} else {
		pkgDir = binDir
	}
	return binDir, pkgDir
}

func corazonHome() string {
	if h := os.Getenv("CORAZON_HOME"); h != "" {
		return h
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fatal(err)
	}
	return filepath.Join(home, ".corazon")
}

func isTTY(f *os.File) bool {
	fi, err := f.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}

func mustMkdir(dir string) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "corazon:", err)
	os.Exit(1)
}
