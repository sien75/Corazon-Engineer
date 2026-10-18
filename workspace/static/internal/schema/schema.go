package schema

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var ObjectTypes = []string{"atom", "edge", "how-to", "development", "contract", "docs", "notes", "skill", "blueprint"}

var TypeDirs = map[string]string{
	"atom":        "atoms",
	"edge":        "edges",
	"how-to":      "how-to",
	"contract":    "contracts",
	"development": "development",
	"docs":        "docs",
	"notes":       "notes",
	"skill":       ".agents/skills",
	"blueprint":   ".agents/blueprints",
}

// TypeDirOf returns the registered type directory a relative path sits under
// (the longest match), or "" when it is not under one. Type directories may be
// dot-prefixed (.agents/skills, .engineer/suggested-skills, ...), which is why
// the match is done here rather than by rejecting every dot segment.
func TypeDirOf(rel string) string {
	rel = filepath.ToSlash(rel)
	best := ""
	for _, d := range TypeDirs {
		if (rel == d || strings.HasPrefix(rel, d+"/")) && len(d) > len(best) {
			best = d
		}
	}
	return best
}

// TypeOf returns the object type a relative path belongs to, or "".
func TypeOf(rel string) string {
	d := TypeDirOf(rel)
	for t, dir := range TypeDirs {
		if dir == d {
			return t
		}
	}
	return ""
}

// LoadAtoms reads every *.yaml under atoms/ (recursively) and returns the full atom list.
func LoadAtoms(root string) ([]interface{}, error) {
	return loadStructure(root, "atoms")
}

// LoadEdges reads every *.yaml under edges/ (recursively) and returns the full edge list.
func LoadEdges(root string) ([]interface{}, error) {
	return loadStructure(root, "edges")
}

func loadStructure(root, kind string) ([]interface{}, error) {
	out := []interface{}{}
	for _, rel := range ListEntries(root, kind) {
		if !strings.HasSuffix(rel, ".yaml") {
			continue
		}
		doc, err := readYAMLMap(root, rel)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", rel, err)
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
