package blueprint

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// tableShape is what may be named as a table: a plain sqlite identifier. It is
// checked wherever a name arrives from outside (a watch request, a push), never
// trusted as written.
var tableShape = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// FlowRule is one entry of a flow block: an event, and what that event sets in
// motion. The syntax is a stack of GitHub Actions shapes with two steps of our
// own — `sql` and `emit` — because those are the two things a blueprint does that
// are not a script.
type FlowRule struct {
	On    string `yaml:"on"`
	Steps []Step `yaml:"steps"`
}

// Step is one action. Exactly one of Run / SQL / Emit is set; With carries its
// input, resolved against the event and the steps before it.
type Step struct {
	ID   string `yaml:"id"`
	Run  string `yaml:"run"`
	SQL  string `yaml:"sql"`
	Emit string `yaml:"emit"`
	With any    `yaml:"with"`
}

// ParseFlow reads one flow block. Unknown keys are refused rather than ignored: a
// typo in `steps` or `on` would otherwise become a rule that silently never runs.
func ParseFlow(src string) ([]FlowRule, error) {
	if strings.TrimSpace(src) == "" {
		return nil, nil
	}
	var rules []FlowRule
	dec := yaml.NewDecoder(strings.NewReader(src))
	dec.KnownFields(true)
	if err := dec.Decode(&rules); err != nil {
		return nil, fmt.Errorf("flow: %w", err)
	}
	for i, rule := range rules {
		if strings.TrimSpace(rule.On) == "" {
			return nil, fmt.Errorf("flow: rule %d has no `on` — a rule is triggered by an event type, e.g. `on: ui.build`", i+1)
		}
		if len(rule.Steps) == 0 {
			return nil, fmt.Errorf("flow: rule %q has no steps", rule.On)
		}
		for j, step := range rule.Steps {
			set := 0
			if step.Run != "" {
				set++
			}
			if step.SQL != "" {
				set++
			}
			if step.Emit != "" {
				set++
			}
			if set != 1 {
				return nil, fmt.Errorf("flow: rule %q, step %d: exactly one of `run`, `sql`, `emit` is required", rule.On, j+1)
			}
		}
	}
	return rules, nil
}

// Event is what travels on the bus. The envelope borrows CloudEvents' four
// fields, because they are the four a page needs to route on: what happened,
// where it came from, what it carried, and when.
type Event struct {
	Type   string `json:"type"`
	Source string `json:"source"`
	Data   any    `json:"data"`
	Time   string `json:"time"`
}

// fields is the event as a map, for the expression lookup: the same four names
// the envelope carries on the wire.
func (e Event) fields() map[string]any {
	return map[string]any{"type": e.Type, "source": e.Source, "data": e.Data, "time": e.Time}
}

// resolve turns a step's `with` value into an input: a whole-string `${{ … }}` is
// replaced by whatever the expression names (so an object stays an object), and
// objects and lists are walked element by element. Nothing else is templated —
// there is no expression language here, just two lookups.
func resolve(with any, event Event, steps map[string]any) any {
	switch v := with.(type) {
	case nil:
		return nil
	case string:
		if expr, ok := templateExpr(v); ok {
			return lookup(expr, event, steps)
		}
		return v
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, item := range v {
			out[k] = resolve(item, event, steps)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(v))
		for k, item := range v {
			out[fmt.Sprint(k)] = resolve(item, event, steps)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = resolve(item, event, steps)
		}
		return out
	default:
		return v
	}
}

func templateExpr(s string) (string, bool) {
	t := strings.TrimSpace(s)
	if !strings.HasPrefix(t, "${{") || !strings.HasSuffix(t, "}}") {
		return "", false
	}
	return strings.TrimSpace(t[3 : len(t)-2]), true
}

// lookup answers the two expressions a flow may write: `event.<path>` and
// `steps.<id>.output[.<path>]`.
func lookup(expr string, event Event, steps map[string]any) any {
	path := strings.Split(expr, ".")
	switch {
	case len(path) >= 1 && path[0] == "event":
		// The event is a struct, and dig knows maps and lists: hand it the
		// envelope's four fields as one, so `event.data`, `event.data.q` and
		// `event.type` all read the same way.
		var cur any = event.fields()
		for _, key := range path[1:] {
			cur = dig(cur, key)
		}
		return cur
	case len(path) >= 3 && path[0] == "steps" && path[2] == "output":
		cur, ok := steps[path[1]]
		if !ok {
			return nil
		}
		for _, key := range path[3:] {
			cur = dig(cur, key)
		}
		return cur
	}
	return nil
}

// dig walks one key into a value that came out of JSON or YAML.
func dig(v any, key string) any {
	switch node := v.(type) {
	case map[string]any:
		return node[key]
	case map[any]any:
		return node[key]
	case []any:
		for i := 0; i < len(node); i++ {
			if fmt.Sprint(i) == key {
				return node[i]
			}
		}
	case []map[string]any:
		// What a sql read answers with: rows, indexed the same way.
		if i, err := strconv.Atoi(key); err == nil && i >= 0 && i < len(node) {
			return node[i]
		}
	}
	return nil
}

// paramsOf is a step's `with` read as sql parameters: a flat map of values bound
// to `:name` in the statement. Anything that is not a map is an error the author
// can act on, since a silent empty parameter set is a silently wrong query.
func paramsOf(with any) (map[string]any, error) {
	if with == nil {
		return nil, nil
	}
	switch m := with.(type) {
	case map[string]any:
		return m, nil
	case map[any]any:
		out := make(map[string]any, len(m))
		for k, v := range m {
			out[fmt.Sprint(k)] = v
		}
		return out, nil
	}
	return nil, fmt.Errorf("`with` for a sql step must be a map of named parameters, e.g. { title: ${{ event.data.title }} }")
}

// asObject is an input object, for steps whose scripts take more than one value.
func asObject(with any) map[string]any {
	switch m := with.(type) {
	case map[string]any:
		return m
	case map[any]any:
		out := make(map[string]any, len(m))
		for k, v := range m {
			out[fmt.Sprint(k)] = v
		}
		return out
	}
	return nil
}
