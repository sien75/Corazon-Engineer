package blueprint

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// A project is one blueprints folder, imported once and then remembered. Several
// coexist: each has its own pair of runtimes (prod / dev), its own data, and its
// own blueprints, which is why a blueprint's address carries the project it
// belongs to.
//
// One is the foreground: the one the shell lists and the one /bp shows. Switching
// the foreground is a change of view and nothing else — every imported project
// runs, whether or not it is in front. Importing starts a project, removing it
// stops it.
type Project struct {
	ID   string `json:"id" yaml:"id"`
	Path string `json:"path" yaml:"path"`
}

// project is the live half: the folder's two registries and the directory its
// databases live in.
type project struct {
	Project
	data string // <home>/projects/<id>: this project's databases and scratch space
	prod *Registry
	dev  *Registry
}

// Projects is the machine's set of blueprints folders, and the one in front.
type Projects struct {
	mu         sync.Mutex
	home       string
	configPath string
	ai         string
	entries    map[string]*project
	order      []string
	foreground string
}

// projectConfig is <home>/config.yaml. `Blueprints` is the single folder the
// previous version remembered: it is read once, as one project, and then written
// back in the list form — there is no second code path for it.
type projectConfig struct {
	Projects   []Project `yaml:"projects"`
	Foreground string    `yaml:"foreground"`
	Blueprints string    `yaml:"blueprints,omitempty"` // only ever read: see OpenProjects
}

// OpenProjects reads the data home's config and starts every project in it. Prod
// runtimes come up now, without a page — that is what "imported" means.
func OpenProjects(home, ai string) (*Projects, error) {
	p := &Projects{
		home:       home,
		configPath: filepath.Join(home, "config.yaml"),
		ai:         ai,
		entries:    map[string]*project{},
	}

	var cfg projectConfig
	data, err := os.ReadFile(p.configPath)
	switch {
	case err == nil:
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("config %s: %w", p.configPath, err)
		}
	case !os.IsNotExist(err):
		return nil, fmt.Errorf("config %s: %w", p.configPath, err)
	}

	// The old single-folder config, read as one project.
	if len(cfg.Projects) == 0 && strings.TrimSpace(cfg.Blueprints) != "" {
		cfg.Projects = []Project{{ID: projectID("", cfg.Blueprints), Path: strings.TrimSpace(cfg.Blueprints)}}
		cfg.Blueprints = ""
	}

	for _, spec := range cfg.Projects {
		if strings.TrimSpace(spec.Path) == "" {
			continue
		}
		e, err := p.open(spec.ID, spec.Path)
		if err != nil {
			// A folder that has gone away does not stop the program: the project
			// stays in the list with its error, and its page says so.
			p.entries[spec.ID] = &project{Project: spec, data: p.dataDir(spec.ID)}
			p.order = append(p.order, spec.ID)
			continue
		}
		p.entries[e.ID] = e
		p.order = append(p.order, e.ID)
	}

	p.foreground = cfg.Foreground
	if _, ok := p.entries[p.foreground]; !ok {
		p.foreground = ""
		if len(p.order) > 0 {
			p.foreground = p.order[0]
		}
	}

	// Start prod for every project: imported is running.
	for _, id := range p.order {
		if e := p.entries[id]; e != nil && e.prod != nil {
			if err := e.prod.LoadAll(); err != nil {
				// One broken blueprint has its own error page; it is not a reason
				// to keep the rest from running.
				fmt.Fprintf(os.Stderr, "engineer blueprint: project %s: %v\n", id, err)
			}
		}
	}

	if cfg.Blueprints != "" || cfg.Foreground == "" && len(p.order) > 0 {
		if err := p.write(); err != nil {
			return nil, err
		}
	}
	return p, nil
}

// open makes one project live: its two registries, from its folder and its own
// data directory.
func (p *Projects) open(id, path string) (*project, error) {
	path = filepath.Clean(path)
	if info, err := os.Stat(path); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("%s is not a folder", path)
	}
	e := &project{Project: Project{ID: id, Path: path}, data: p.dataDir(id)}
	if err := os.MkdirAll(e.data, 0o755); err != nil {
		return nil, err
	}
	opts := Options{Data: e.data, Blueprints: path, AI: p.ai}
	e.prod = NewRegistry(opts, ModeProd, id)
	e.dev = NewRegistry(opts, ModeDev, id)
	return e, nil
}

func (p *Projects) dataDir(id string) string { return filepath.Join(p.home, "projects", id) }

// Snapshot is the list the UI draws: every project in order, and which one is in
// front.
func (p *Projects) Snapshot() ([]Project, string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]Project, 0, len(p.order))
	for _, id := range p.order {
		if e := p.entries[id]; e != nil {
			out = append(out, e.Project)
		}
	}
	return out, p.foreground
}

// Get is a project's registries, by id.
func (p *Projects) Get(id string) (*project, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, ok := p.entries[id]
	return e, ok
}

// Add imports a folder. A folder already imported answers with what is there —
// importing twice is the same as once, not a second copy of everything. Importing
// starts the project: prod blueprints are loaded and their init scripts run.
func (p *Projects) Add(raw string) (Project, error) {
	path := expandPath(raw)
	if path == "" {
		return Project{}, fmt.Errorf("a folder path is required")
	}
	if !filepath.IsAbs(path) {
		return Project{}, fmt.Errorf("the folder must be an absolute path, got %q", raw)
	}
	path = filepath.Clean(path)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return Project{}, fmt.Errorf("cannot create %s: %w", path, err)
	}
	if info, err := os.Stat(path); err != nil || !info.IsDir() {
		return Project{}, fmt.Errorf("%s is not a folder", path)
	}

	p.mu.Lock()
	for _, id := range p.order {
		if e := p.entries[id]; e != nil && e.Path == path {
			spec := e.Project
			p.mu.Unlock()
			return spec, nil
		}
	}
	id := projectID(p.joined(), path)
	p.mu.Unlock()

	e, err := p.open(id, path)
	if err != nil {
		return Project{}, err
	}

	p.mu.Lock()
	p.entries[id] = e
	p.order = append(p.order, id)
	if p.foreground == "" {
		p.foreground = id
	}
	err = p.writeLocked()
	p.mu.Unlock()
	if err != nil {
		return Project{}, err
	}

	if err := e.prod.LoadAll(); err != nil {
		return e.Project, err
	}
	return e.Project, nil
}

// Remove stops a project and forgets it. Its files are left alone: the folder is
// the user's, and a database is data — deleting a project stops it running, it
// does not throw anything away.
func (p *Projects) Remove(id string) error {
	p.mu.Lock()
	e, ok := p.entries[id]
	if !ok {
		p.mu.Unlock()
		return fmt.Errorf("no project %q", id)
	}
	delete(p.entries, id)
	kept := p.order[:0]
	for _, other := range p.order {
		if other != id {
			kept = append(kept, other)
		}
	}
	p.order = kept
	if p.foreground == id {
		p.foreground = ""
		if len(p.order) > 0 {
			p.foreground = p.order[0]
		}
	}
	err := p.writeLocked()
	p.mu.Unlock()

	if e.prod != nil {
		e.prod.Shutdown()
	}
	if e.dev != nil {
		e.dev.Shutdown()
	}
	return err
}

// SetForeground brings a project to the front. Nothing is started or stopped: a
// project behind the front is still running.
func (p *Projects) SetForeground(id string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.entries[id]; !ok {
		return fmt.Errorf("no project %q", id)
	}
	p.foreground = id
	return p.writeLocked()
}

// Shutdown stops every project: the service is going away.
func (p *Projects) Shutdown() {
	p.mu.Lock()
	all := make([]*project, 0, len(p.entries))
	for _, e := range p.entries {
		all = append(all, e)
	}
	p.mu.Unlock()
	for _, e := range all {
		if e.prod != nil {
			e.prod.Shutdown()
		}
		if e.dev != nil {
			e.dev.Shutdown()
		}
	}
}

func (p *Projects) write() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.writeLocked()
}

// writeLocked writes the config: the projects in order, and the one in front.
func (p *Projects) writeLocked() error {
	cfg := projectConfig{Foreground: p.foreground}
	for _, id := range p.order {
		if e := p.entries[id]; e != nil {
			cfg.Projects = append(cfg.Projects, e.Project)
		}
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(p.configPath, data, 0o644)
}

// joined is the folders this list already has, for making a distinct id.
func (p *Projects) joined() string {
	ids := make([]string, 0, len(p.entries))
	for id := range p.entries {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return strings.Join(ids, " ")
}

// projectID is a project's name: its folder's name, made safe, and made distinct
// from the ones already there (notes, notes-2, …). It is an identity, so it does
// not change when the folder is renamed — a renamed folder is a new project, and
// the old one stays until the user removes it.
func projectID(joined, path string) string {
	base := strings.TrimSuffix(filepath.Base(filepath.Clean(path)), string(filepath.Separator))
	id := slugOf(base)
	if id == "" {
		id = "project"
	}
	taken := map[string]bool{}
	for _, f := range strings.Fields(joined) {
		taken[f] = true
	}
	if !taken[id] {
		return id
	}
	for n := 2; ; n++ {
		candidate := fmt.Sprintf("%s-%d", id, n)
		if !taken[candidate] {
			return candidate
		}
	}
}

// slugOf turns a folder name into something a URL and a directory can carry.
func slugOf(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		default:
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "-") {
				b.WriteByte('-')
			}
		}
	}
	out := strings.Trim(b.String(), "-._")
	if len(out) > 48 {
		out = out[:48]
	}
	return out
}

// expandPath turns the "~" a user may type into the home directory: the folder is
// typed, not picked from a dialog, and "~/blueprints" is what a person writes.
func expandPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "~" || strings.HasPrefix(p, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(p, "~"), "/"))
		}
	}
	return p
}
