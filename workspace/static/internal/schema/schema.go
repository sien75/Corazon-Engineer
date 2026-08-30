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

var ObjectTypes = []string{"atom", "edge", "runtime", "devtime", "contract", "test", "docs", "notes"}

var TypeDirs = map[string]string{
	"atom":     "atoms",
	"edge":     "edges",
	"runtime":  "runtime",
	"contract": "contracts",
	"test":     "tests",
	"devtime":  "devtime",
	"docs":     "docs",
	"notes":    "notes",
}

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
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

// RuntimeEnvs returns the env names available under runtime/ (filename without .yaml).
func RuntimeEnvs(root string) []string {
	envs := []string{}
	for _, p := range ListEntries(root, "runtime") {
		name := strings.TrimSuffix(filepath.Base(p), ".yaml")
		envs = append(envs, name)
	}
	return envs
}

// LoadRuntimeEnv parses runtime/<env>.yaml and returns the env's content.
func LoadRuntimeEnv(root, env string) (map[string]interface{}, error) {
	path := filepath.Join(root, "runtime", env+".yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc map[string]interface{}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	rt, _ := doc["runtime"].(map[string]interface{})
	content, ok := rt[env].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("env %q not found in runtime/%s.yaml", env, env)
	}
	return content, nil
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
	case "runtime":
		if str(body, "description") == "" {
			fail("description", "required")
		}
		endpoints, _ := body["endpoints"].(map[string]interface{})
		if len(endpoints) == 0 {
			fail("endpoints", "required, must map atom id to runtime endpoint")
		}
		for id, raw := range endpoints {
			ep, _ := raw.(map[string]interface{})
			if ep == nil {
				fail("endpoints."+id, "required")
				continue
			}
			ch := str(ep, "channel")
			if !contains(Channels, ch) {
				fail("endpoints."+id+".channel", "must be one of network | stdio | ipc")
				continue
			}
			switch ch {
			case "network", "ipc":
				if str(ep, "address") == "" {
					fail("endpoints."+id+".address", "required when channel="+ch)
				}
			case "stdio":
				if str(ep, "in") == "" || str(ep, "out") == "" {
					fail("endpoints."+id, "in and out are required when channel=stdio")
				}
			}
		}
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
	case "test", "devtime", "docs", "notes":
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
