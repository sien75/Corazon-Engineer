package schema

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var Channels = []string{"network", "stdio", "ipc"}

var Protocols = map[string][]string{
	"network": {"http", "grpc", "ws", "sse", "pgwire", "mysql", "redis", "kafka", "amqp", "mqtt", "s3", "elastic", "custom"},
	"stdio":   {"json-rpc", "ndjson", "binary", "text"},
	"ipc":     {"unix-socket", "dbus", "shared-mem", "signal"},
}

var RuntimeTypes = []string{"native", "go", "browser", "node", "bun", "jre", "python", "dotnet", "beam", "ruby", "php"}

var AtomRoles = []string{"service", "database", "cache", "queue", "storage", "gateway", "scheduler", "worker", "proxy"}

var ObjectTypes = []string{"atom", "edge", "runtime", "devtime", "contract", "docs", "notes"}

var TypeDirs = map[string]string{
	"atom":     "atoms",
	"edge":     "edges",
	"runtime":  "runtime",
	"contract": "contracts",
	"devtime":  "devtime",
	"docs":     "docs",
	"notes":    "notes",
}

type FieldError struct {
	Field   string `yaml:"field"`
	Message string `yaml:"message"`
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func str(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// LoadAtoms reads all atoms/*.yaml files and returns the full atom list.
func LoadAtoms(root string) ([]interface{}, error) {
	return loadStructure(root, "atoms")
}

// LoadEdges reads all edges/*.yaml files and returns the full edge list.
func LoadEdges(root string) ([]interface{}, error) {
	return loadStructure(root, "edges")
}

func loadStructure(root, kind string) ([]interface{}, error) {
	dir := filepath.Join(root, kind)
	out := []interface{}{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return out, nil
		}
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		var doc map[string]interface{}
		if err := yaml.Unmarshal(data, &doc); err != nil {
			return nil, fmt.Errorf("%s/%s: %w", kind, e.Name(), err)
		}
		if list, ok := doc[kind].([]interface{}); ok {
			out = append(out, list...)
		}
	}
	return out, nil
}

// ListEntries returns relative paths of files under a content directory, recursively.
func ListEntries(root, dir string) []string {
	out := []string{}
	base := filepath.Join(root, dir)
	_ = filepath.Walk(base, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err == nil {
			out = append(out, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(out)
	return out
}

// LoadContractFile parses a contract yaml file into a generic map.
func LoadContractFile(root, id string) (map[string]interface{}, error) {
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(id)))
	if err != nil {
		return nil, err
	}
	var doc map[string]interface{}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

// Validate checks a mutation body of the given type and returns field errors.
func Validate(objType string, body map[string]interface{}) []FieldError {
	errs := []FieldError{}
	fail := func(field, msg string) {
		errs = append(errs, FieldError{Field: field, Message: msg})
	}
	switch objType {
	case "atom":
		validateAtom(body, fail)
	case "edge":
		for _, f := range []string{"id", "from", "from_interface", "to", "to_interface", "description"} {
			if str(body, f) == "" {
				fail(f, "required")
			}
		}
		validateChannelProtocol(body, "", fail)
	case "contract":
		if str(body, "id") == "" {
			fail("id", "required")
		}
		if str(body, "description") == "" {
			fail("description", "required")
		}
		if _, ok := body["request"]; !ok {
			fail("request", "required (use {} when empty)")
		}
		if _, ok := body["response"]; !ok {
			fail("response", "required")
		}
	case "runtime", "devtime", "docs", "notes":
		// raw content, no structural validation
	}
	return errs
}

func validateAtom(body map[string]interface{}, fail func(field, msg string)) {
	if str(body, "name") == "" {
		fail("name", "required")
	}
	if str(body, "description") == "" {
		fail("description", "required")
	}
	rt := str(body, "runtime_type")
	if !contains(RuntimeTypes, rt) {
		fail("runtime_type", "must be one of "+strings.Join(RuntimeTypes, " | "))
	}
	if role := str(body, "role"); role != "" && !contains(AtomRoles, role) {
		fail("role", "must be one of "+strings.Join(AtomRoles, " | "))
	}
	ifaces, _ := body["interfaces"].(map[string]interface{})
	if ifaces == nil {
		fail("interfaces", "required")
		return
	}
	for _, dir := range []string{"provides", "consumes"} {
		list, _ := ifaces[dir].([]interface{})
		for i, raw := range list {
			iface, _ := raw.(map[string]interface{})
			prefix := fmt.Sprintf("interfaces.%s[%d]", dir, i)
			if str(iface, "id") == "" {
				fail(prefix+".id", "required")
			}
			validateChannelProtocol(iface, prefix, fail)
		}
	}
}

func validateChannelProtocol(body map[string]interface{}, prefix string, fail func(field, msg string)) {
	ch := str(body, "channel")
	if !contains(Channels, ch) {
		key := "channel"
		if prefix != "" {
			key = prefix + ".channel"
		}
		fail(key, "must be one of network | stdio | ipc")
		return
	}
	proto := str(body, "protocol")
	key := "protocol"
	if prefix != "" {
		key = prefix + ".protocol"
	}
	if proto == "" {
		fail(key, "required")
	} else if !contains(Protocols[ch], proto) {
		fail(key, "protocol "+proto+" is not compatible with channel "+ch)
	}
}

// TreeError is one validation failure found while validating the schema tree.
type TreeError struct {
	File    string `yaml:"file"`            // relative path, e.g. "atoms/ai.yaml"
	Type    string `yaml:"type"`            // atom | edge | contract
	Field   string `yaml:"field,omitempty"` // offending field path, e.g. "interfaces.provides[0].contract"
	Message string `yaml:"message"`         // failure reason
}

// ValidateTree validates every contract, atom and edge under root: yaml parse
// errors, per-type structural rules, and cross-file references (each atom
// interface's contract must exist; each edge's endpoints must resolve to a
// known atom interface).
func ValidateTree(root string) []TreeError {
	errs := []TreeError{}
	fail := func(file, typ, field, msg string) {
		errs = append(errs, TreeError{File: file, Type: typ, Field: field, Message: msg})
	}

	// --- contracts ---
	contractFiles := map[string]bool{} // existing contract file, relative path
	contractIDs := map[string]string{} // contract id -> file
	for _, rel := range ListEntries(root, "contracts") {
		if !strings.HasSuffix(rel, ".yaml") {
			continue
		}
		contractFiles[rel] = true
		doc, err := readYAMLMap(root, rel)
		if err != nil {
			fail(rel, "contract", "", "yaml parse error: "+err.Error())
			continue
		}
		for _, e := range Validate("contract", doc) {
			fail(rel, "contract", e.Field, e.Message)
		}
		if id := str(doc, "id"); id != "" {
			if prev, dup := contractIDs[id]; dup {
				fail(rel, "contract", "id", "duplicate id "+id+" (also in "+prev+")")
			} else {
				contractIDs[id] = rel
			}
		}
	}

	// --- atoms ---
	atomNames := map[string]string{}                     // atom name -> file
	atomIface := map[string]map[string]map[string]bool{} // atom -> provides/consumes -> interface id set
	for _, rel := range ListEntries(root, "atoms") {
		if !strings.HasSuffix(rel, ".yaml") {
			continue
		}
		doc, err := readYAMLMap(root, rel)
		if err != nil {
			fail(rel, "atom", "", "yaml parse error: "+err.Error())
			continue
		}
		list, _ := doc["atoms"].([]interface{})
		for i, raw := range list {
			body, _ := raw.(map[string]interface{})
			if body == nil {
				fail(rel, "atom", fmt.Sprintf("atoms[%d]", i), "not an object")
				continue
			}
			for _, e := range Validate("atom", body) {
				fail(rel, "atom", e.Field, e.Message)
			}
			name := str(body, "name")
			if name != "" {
				if prev, dup := atomNames[name]; dup {
					fail(rel, "atom", "name", "duplicate atom "+name+" (also in "+prev+")")
				} else {
					atomNames[name] = rel
				}
				atomIface[name] = map[string]map[string]bool{"provides": {}, "consumes": {}}
			}
			ifaces, _ := body["interfaces"].(map[string]interface{})
			for _, dir := range []string{"provides", "consumes"} {
				items, _ := ifaces[dir].([]interface{})
				for j, rawIf := range items {
					iface, _ := rawIf.(map[string]interface{})
					if iface == nil {
						continue
					}
					if id := str(iface, "id"); id != "" && name != "" {
						atomIface[name][dir][id] = true
					}
					if c := str(iface, "contract"); c != "" {
						if ref := strings.TrimPrefix(c, "./"); !contractFiles[ref] {
							fail(rel, "atom", fmt.Sprintf("interfaces.%s[%d].contract", dir, j), "contract file not found: "+c)
						}
					}
				}
			}
		}
	}

	// --- edges ---
	edgeIDs := map[string]bool{}
	for _, rel := range ListEntries(root, "edges") {
		if !strings.HasSuffix(rel, ".yaml") {
			continue
		}
		doc, err := readYAMLMap(root, rel)
		if err != nil {
			fail(rel, "edge", "", "yaml parse error: "+err.Error())
			continue
		}
		list, _ := doc["edges"].([]interface{})
		for i, raw := range list {
			body, _ := raw.(map[string]interface{})
			if body == nil {
				fail(rel, "edge", fmt.Sprintf("edges[%d]", i), "not an object")
				continue
			}
			for _, e := range Validate("edge", body) {
				fail(rel, "edge", e.Field, e.Message)
			}
			if id := str(body, "id"); id != "" {
				if edgeIDs[id] {
					fail(rel, "edge", "id", "duplicate id "+id)
				}
				edgeIDs[id] = true
			}
			from, to := str(body, "from"), str(body, "to")
			fi, ti := str(body, "from_interface"), str(body, "to_interface")
			if from != "" {
				if _, ok := atomNames[from]; !ok {
					fail(rel, "edge", "from", "atom not found: "+from)
				} else if fi != "" && !atomIface[from]["consumes"][fi] {
					fail(rel, "edge", "from_interface", "atom "+from+" has no consumes interface "+fi)
				}
			}
			if to != "" {
				if _, ok := atomNames[to]; !ok {
					fail(rel, "edge", "to", "atom not found: "+to)
				} else if ti != "" && !atomIface[to]["provides"][ti] {
					fail(rel, "edge", "to_interface", "atom "+to+" has no provides interface "+ti)
				}
			}
		}
	}

	return errs
}

func readYAMLMap(root, rel string) (map[string]interface{}, error) {
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil, err
	}
	var doc map[string]interface{}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}
