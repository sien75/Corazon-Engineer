// Command engineer is the prod launcher shipped in the package. It starts the
// four packaged services (log, static, ai, web) on free ports, names the
// terminal "engineer", holds the foreground until Ctrl-C, then tears the whole
// stack down.
//
// It is a **multi-call binary**: log, static and web are not separate files but
// this same executable re-run with a `serve-log` / `serve-static` / `serve-web`
// subcommand. Only ai is a second file (`engineer-ai`). One executable path per
// service would mean one extra entry in every EDR/security-tool process
// whitelist (and one extra "allow this program?" prompt for every new user), so
// the three Go services share this one.
//
// The services listen on loopback by default and are reached at the addresses
// printed on startup. ENGINEER_BIND overrides the bind host — 0.0.0.0 to expose
// the stack to the whole network, or this machine's IP to expose one interface;
// the launcher then also prints an address another machine can use.
//
// It is a native binary on purpose: the terminal's foreground process is named
// "engineer" (not the shell running a start.sh script), so terminals that title
// tabs from the process name — VS Code, notably — show "engineer" with no
// configuration.
package main

import (
	"bytes"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"

	logsvc "engineer/log"
	staticsvc "engineer/static"
	websrv "engineer/web"
)

const usageText = "usage: engineer [start|status|version|uninstall [--purge]]"

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
	// Internal, not part of the user-facing CLI: the launcher starts the three Go
	// services by running this same binary again with one of these subcommands
	// (see the multi-call note at the top). Each Serve never returns.
	case "serve-log":
		logsvc.Serve(os.Args[2:])
	case "serve-static":
		staticsvc.Serve(os.Args[2:])
	case "serve-web":
		websrv.Serve(os.Args[2:])
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
	self, binDir, pkg := selfDirs()

	// The data home holds the database, the project board and uploads. It is not
	// a project: which folders the program works on is data in there, and the
	// folder it happens to start in is only a convenience (registered below when
	// it is an engineer project).
	data := dataHome()
	runDir := filepath.Join(data, "run")
	logDir := filepath.Join(data, "logs")
	mustMkdir(runDir)
	mustMkdir(logDir)

	// name the terminal/window/tab "engineer" for terminals that honor OSC titles
	if isTTY(os.Stdout) {
		fmt.Print("\033]0;engineer\007")
	}

	reclaim(runDir, self)

	// Nothing is migrated here, because there is nothing to migrate: the data home
	// is the only database this program reads. A `.engineer/engineer.db` left in
	// the folder from before the home existed is simply not part of the program.

	// Where the four services bind. Loopback by default, so a local tool is
	// not a service on the office network; ENGINEER_BIND opens the stack
	// deliberately (e.g. 0.0.0.0), which is the only way another machine can
	// reach it.
	bind := bindHost()
	ports := map[string]int{}
	used := map[int]bool{}
	for _, name := range []string{"web", "ai", "static", "log"} {
		p := pickPort(defaultPorts[name], used, bind)
		used[p] = true
		ports[name] = p
	}
	// Two different addresses per service: the one it listens on (bind host +
	// port, both passed down explicitly — a service never picks its own) and the
	// one everyone else reaches it by (url host — loopback reads as "localhost",
	// a wildcard bind as this machine's outward IP).
	host := urlHost(bind)
	svcURL := func(name string) string {
		return "http://" + net.JoinHostPort(host, strconv.Itoa(ports[name]))
	}

	specs := []*service{
		{name: "log", bin: self,
			args: []string{"serve-log", "--home", data,
				"--bind", bind, "--port", strconv.Itoa(ports["log"])}},
		{name: "static", bin: self,
			args: []string{"serve-static", "--log", svcURL("log"),
				"--bind", bind, "--port", strconv.Itoa(ports["static"])}},
		{name: "ai", bin: filepath.Join(binDir, "engineer-ai"),
			args: []string{"--home", data,
				"--bind", bind, "--port", strconv.Itoa(ports["ai"]),
				"--agents", filepath.Join(pkg, "agents"),
				"--log", svcURL("log"), "--static", svcURL("static")}},
		{name: "web", bin: self,
			args: []string{"serve-web",
				"--bind", bind, "--port", strconv.Itoa(ports["web"]),
				"--assets", filepath.Join(pkg, "web"),
				"--static", svcURL("static"), "--ai", svcURL("ai"), "--log", svcURL("log")}},
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

	// A folder the user started the program in is a project they mean to work on:
	// put it on the board (adding a folder that is already there keeps its
	// history). The page can add and remove others.
	if name := registerCwd(svcURL("log"), root); name != "" {
		fmt.Printf("engineer up — project: %s (%s)\n", name, root)
	} else {
		fmt.Printf("engineer up — data: %s\n", data)
	}
	fmt.Printf("  web     %s\n", svcURL("web"))
	fmt.Printf("  ai      %s\n", svcURL("ai"))
	fmt.Printf("  static  %s\n", svcURL("static"))
	fmt.Printf("  log     %s\n", svcURL("log"))
	if isWildcard(bind) {
		fmt.Printf("bind: %s — open to the whole network; reachable at %s\n", bind, urlHost(bind))
	} else {
		fmt.Printf("bind: %s\n", bind)
	}
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

// status prints the per-service state of the data home's instance.
func status() {
	runDir := filepath.Join(dataHome(), "run")
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
// "engineer-3a3eff8-darwin-arm64".
func versionName() string {
	_, _, pkg := selfDirs()
	return filepath.Base(pkg)
}

// uninstall removes the software and the command. Project folders are never
// touched; --purge also removes the data home (the project board and every
// conversation).
func uninstall(purge bool) {
	home := engineerHome()
	apps := filepath.Join(home, "apps")
	cur := filepath.Join(apps, "current")
	if _, err := os.Readlink(cur); err != nil {
		fmt.Fprintln(os.Stderr, "engineer: not installed")
		os.Exit(1)
	}

	// stop every running service of the installed version, across projects
	if realCur, err := filepath.EvalSymlinks(cur); err == nil {
		killMatching(filepath.Join(realCur, "bin", "engineer"))
	}
	_ = os.RemoveAll(apps)
	_ = os.RemoveAll(filepath.Join(home, "bin"))
	_ = os.Remove("/usr/local/bin/engineer")

	if purge {
		_ = os.RemoveAll(home)
		fmt.Println("engineer uninstalled (purged)")
	} else {
		fmt.Println("engineer uninstalled")
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

// reclaim stops a previous instance of THIS install (recorded pids, then any
// stray service started from this install's own binary) so we reuse its ports
// instead of advancing past them. Another install's stack is never touched.
func reclaim(runDir, self string) {
	for _, name := range []string{"web", "ai", "static", "log"} {
		pf := filepath.Join(runDir, name+".pid")
		if pid, err := readPid(pf); err == nil {
			_ = syscall.Kill(pid, syscall.SIGTERM)
		}
		_ = os.Remove(pf)
	}
	killMatching(self)
	time.Sleep(time.Second)
}

// --- ports ---------------------------------------------------------------

// bindHost is the host the services listen on. Loopback by default — the stack
// is a local tool; ENGINEER_BIND is the opt-in that exposes it, e.g.
// ENGINEER_BIND=0.0.0.0 for the whole network or =<this machine's IP> for one
// interface.
func bindHost() string {
	if h := os.Getenv("ENGINEER_BIND"); h != "" {
		return h
	}
	return "127.0.0.1"
}

// isWildcard reports whether a bind host means "every interface".
func isWildcard(h string) bool { return h == "" || h == "0.0.0.0" || h == "::" }

// isLoopback reports whether a bind host is this machine itself — such a bind
// is reached as "localhost" from here, and from nowhere else.
func isLoopback(h string) bool {
	return h == "localhost" || h == "::1" || strings.HasPrefix(h, "127.")
}

// urlHost is the host the services address each other by, and the one the web
// UI hands to the browser. Loopback stays "localhost"; a wildcard bind needs
// this machine's outward IPv4 instead, or a browser on another machine would
// be told to call its own localhost.
func urlHost(bind string) string {
	switch {
	case isLoopback(bind):
		return "localhost"
	case isWildcard(bind):
		if ip := outwardIPv4(); ip != "" {
			return ip
		}
		return "localhost"
	default:
		return bind
	}
}

// probeHost is what to dial when asking whether a port is taken: a wildcard
// address is not dialable, so probe loopback.
func probeHost(bind string) string {
	if isWildcard(bind) {
		return "127.0.0.1"
	}
	return bind
}

// outwardIPv4 returns the first global unicast IPv4 on an up, non-loopback
// interface — the address another machine on the same network would use. Empty
// when the machine is offline.
func outwardIPv4() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			if ip := ipnet.IP.To4(); ip != nil && ip.IsGlobalUnicast() {
				return ip.String()
			}
		}
	}
	return ""
}

// pickPort returns the first port >= p that is free and not already chosen.
func pickPort(p int, used map[int]bool, bind string) int {
	for {
		if !used[p] && portFree(p, bind) {
			return p
		}
		p++
	}
}

func portFree(p int, bind string) bool {
	l, err := net.Listen("tcp", net.JoinHostPort(bind, strconv.Itoa(p)))
	if err != nil {
		return false
	}
	_ = l.Close()

	// The bind test alone is not enough. A listener that set SO_REUSEPORT —
	// Bun's servers do — still lets a second bind to the same port succeed on
	// macOS, so this probe would call an occupied port free; the launcher then
	// prints an address whose traffic goes to the other process. Ask the port
	// directly as well: if anything answers, it is taken.
	c, err := net.DialTimeout("tcp", net.JoinHostPort(probeHost(bind), strconv.Itoa(p)), 300*time.Millisecond)
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

// selfDirs returns this executable's resolved path, the directory holding the
// sibling service binaries (ai) and the package root holding web/, agents/,
// docs/. The resolved path matters twice over: the installed command is a
// symlink into apps/current, and the services are started by re-running this
// same file.
func selfDirs() (exe, binDir, pkgDir string) {
	self, err := os.Executable()
	if err != nil {
		fatal(err)
	}
	real, err := filepath.EvalSymlinks(self)
	if err != nil {
		fatal(err)
	}
	binDir = filepath.Dir(real)
	if filepath.Base(binDir) == "bin" {
		pkgDir = filepath.Dir(binDir)
	} else {
		pkgDir = binDir
	}
	return real, binDir, pkgDir
}

func engineerHome() string {
	if h := os.Getenv("ENGINEER_HOME"); h != "" {
		return h
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fatal(err)
	}
	return filepath.Join(home, ".engineer")
}

// dataHome is where the running program keeps its own data: the database, the
// project board, uploads and the run/log directories. It sits next to the
// installed versions, never inside a project.
func dataHome() string {
	if d := os.Getenv("ENGINEER_DATA"); d != "" {
		return d
	}
	return filepath.Join(engineerHome(), "data")
}

// registerCwd puts the folder the program was started in on the board when it is
// an engineer project. It returns the project's name, or "" when this folder is
// not a project (the program runs anywhere — starting it somewhere else is not an
// error, and the page is where projects are added).
func registerCwd(logURL, root string) string {
	if _, err := os.Stat(filepath.Join(root, "engineer.yaml")); err != nil {
		return ""
	}
	body, err := yaml.Marshal(map[string]string{"path": root, "name": projectName(root)})
	if err != nil {
		return ""
	}
	// log has just been started, not necessarily listening yet: retry briefly
	// rather than print a failure the user cannot act on.
	var lastErr error = fmt.Errorf("log not reachable")
	for attempt := 0; attempt < 30; attempt++ {
		res, err := http.Post(logURL+"/log/project/add", "application/yaml", bytes.NewReader(body))
		if err != nil {
			lastErr = err
			time.Sleep(100 * time.Millisecond)
			continue
		}
		status := res.StatusCode
		res.Body.Close()
		if status != http.StatusOK {
			lastErr = fmt.Errorf("HTTP %d", status)
			time.Sleep(100 * time.Millisecond)
			continue
		}
		return projectName(root)
	}
	fmt.Fprintf(os.Stderr, "engineer: could not register %s: %v\n", root, lastErr)
	return ""
}

// projectName is the display name out of the project marker, or the folder name.
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
	fmt.Fprintln(os.Stderr, "engineer:", err)
	os.Exit(1)
}
