package blueprint

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// The spec an agent is given is this service's business, not ai's: ai carries
// whatever text a caller passes to /ai/new and reads none of it. A conversation
// is born here, so the four things an agent cannot discover by itself are
// appended to the spec — where the reference files are, where Engineer's own
// folder is, and the two service addresses it may call.
const specFile = "AGENTS.md"

// chatClient is one client for the ai service. A conversation is created on a
// human's click, so a hung ai must fail the request rather than hold it forever.
var chatClient = &http.Client{Timeout: 30 * time.Second}

// composeSystem builds the system text for one conversation: the spec as written,
// then the positions it refers to. ai appends its own material (a project's
// context, the skills list) after this, and the rule at the end says so.
func composeSystem(cfg config) (string, error) {
	spec, err := os.ReadFile(filepath.Join(cfg.agents, specFile))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filepath.Join(cfg.agents, specFile), err)
	}
	var b strings.Builder
	b.Write(bytes.TrimSpace(spec))
	b.WriteString("\n\n## Where things are\n\n")
	fmt.Fprintf(&b, "- **Reference files position**: %s — `blueprint.md` (how a blueprint is built) lives here.\n", cfg.agents)
	fmt.Fprintf(&b, "- **Home position**: %s — Engineer's own folder; its data, including `data/models.yaml`, is in `data/` under it.\n", cfg.engineerHome)
	b.WriteString("- **Runtime endpoints**: the services you may call.\n")
	fmt.Fprintf(&b, "  - storage: %s\n", cfg.rt.Storage)
	fmt.Fprintf(&b, "  - ai: %s\n", cfg.rt.AI)
	fmt.Fprintf(&b, "- **Working folder**: %s\n", cfg.rt.Cwd)
	return b.String(), nil
}

// serveChatSession raises the shell's conversation: POST /chat/session → {sessionId}.
// It composes the system text and hands cwd + system to ai, which knows nothing
// else about what the conversation is for.
func serveChatSession(w http.ResponseWriter, r *http.Request, cfg config) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	system, err := composeSystem(cfg)
	if err != nil {
		http.Error(w, "engineer blueprint: "+err.Error(), http.StatusInternalServerError)
		return
	}
	body, err := json.Marshal(map[string]string{"cwd": cfg.rt.Cwd, "system": system})
	if err != nil {
		http.Error(w, "engineer blueprint: "+err.Error(), http.StatusInternalServerError)
		return
	}
	target := strings.TrimSuffix(cfg.rt.AI, "/") + "/ai/new"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "engineer blueprint: "+err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := chatClient.Do(req)
	if err != nil {
		http.Error(w, "engineer blueprint: ai unreachable: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	answer, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		http.Error(w, "engineer blueprint: "+err.Error(), http.StatusBadGateway)
		return
	}
	// ai speaks YAML; the page asks for JSON. Translate rather than relay: the
	// page has one parser, and a failure keeps ai's own shape.
	var out map[string]any
	if err := yaml.Unmarshal(answer, &out); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(res.StatusCode)
		json.NewEncoder(w).Encode(map[string]any{"error": strings.TrimSpace(string(answer))})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(res.StatusCode)
	json.NewEncoder(w).Encode(out)
}
