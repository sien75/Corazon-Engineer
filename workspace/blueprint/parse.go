// Package bp is the blueprint runtime: it reads a single-file blueprint (one
// HTML document that carries its own tables, orchestration and scripts), keeps
// one sqlite per blueprint, runs its flows, and gives its page one channel back
// to the bus.
//
// The format is the whole contract; nothing else in the program knows what a
// blueprint is. A blueprint is:
//
//	<!doctype html>
//	<title>Display name</title>
//	<meta id="identity">
//	<script type="blueprint/sql">…</script>
//	<script type="blueprint/flow">…</script>
//	<script type="blueprint/sh|js|py|…" id="step-name">…</script>
//	<body>…the page, which the browser runs as usual…</body>
//
// Everything with a `blueprint/*` type is backend: the browser skips it and the
// runtime strips it before the page is served. Nothing about it is a comment to
// the parser — a malformed blueprint is an error page, not a half-running
// runtime.
package blueprint

import (
	"fmt"
	"regexp"
	"strings"
)

// Script is one backend script block: the code, and the interpreter its type
// names ("js", "sh", "py", …). ID is the `id` attribute flows refer to.
type Script struct {
	ID   string
	Kind string
	Code string
}

// Page is a parsed blueprint file.
type Page struct {
	ID    string // <meta id>: the identity the blueprint's sqlite is filed under
	Title string // <title>: display name only
	SQL   []string
	Rules []FlowRule
	// Scripts are addressed by id: `run: <id>` in a flow is a lookup here.
	Scripts map[string]Script
	// HTML is the document with every `blueprint/*` script block removed: what a
	// browser gets. The runtime's own sources never reach the page.
	HTML []byte
	// Source is the file the page came from, for error messages.
	Source string
}

// idShape is what a blueprint identity may look like. It becomes a file name, so
// anything a path could mean is refused here rather than sanitized later.
var idShape = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

// Parse reads one blueprint document. The result is either a complete blueprint
// or an error: a missing identity, a flow that calls a script that is not there,
// or unparsable YAML stops the load here, so a page is never served half-alive.
func Parse(src []byte, source string) (*Page, error) {
	doc := string(src)
	page := &Page{Source: source, Scripts: map[string]Script{}}

	var flowBlocks []string
	var body strings.Builder
	cursor := 0 // where the kept document resumes
	for _, t := range scanTags(doc) {
		if t.kind == "meta" {
			if page.ID == "" {
				page.ID = t.attr["id"]
			}
			continue
		}
		typ := t.attr["type"]
		if !strings.HasPrefix(typ, "blueprint/") {
			continue // frontend script: the browser runs it, we leave it alone
		}
		// Backend block: recorded, and cut out of the document served to the page.
		body.WriteString(doc[cursor:t.start])
		cursor = t.end
		code := unescape(doc[t.bodyStart:t.bodyEnd])
		switch kind := strings.TrimPrefix(typ, "blueprint/"); kind {
		case "sql":
			if strings.TrimSpace(code) != "" {
				page.SQL = append(page.SQL, code)
			}
		case "flow":
			flowBlocks = append(flowBlocks, code)
		default:
			id := t.attr["id"]
			if id == "" {
				return nil, fmt.Errorf("%s: a <script type=%q> needs an id — flows refer to it by name", source, typ)
			}
			if _, dup := page.Scripts[id]; dup {
				return nil, fmt.Errorf("%s: two scripts share the id %q", source, id)
			}
			page.Scripts[id] = Script{ID: id, Kind: kind, Code: code}
		}
	}
	body.WriteString(doc[cursor:])
	page.HTML = []byte(body.String())

	page.Title = titleOf(doc)
	if page.ID == "" {
		return nil, fmt.Errorf("%s: no <meta id=\"…\"> — a blueprint is known by its id, and its sqlite is filed under it", source)
	}
	if !idShape.MatchString(page.ID) {
		return nil, fmt.Errorf("%s: blueprint id %q must be letters, digits, '.', '_' or '-', and at most 64 of them", source, page.ID)
	}

	for _, block := range flowBlocks {
		rules, err := ParseFlow(block)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", source, err)
		}
		page.Rules = append(page.Rules, rules...)
	}
	for _, rule := range page.Rules {
		for _, step := range rule.Steps {
			if step.Run != "" {
				if _, ok := page.Scripts[step.Run]; !ok {
					return nil, fmt.Errorf("%s: flow %q runs %q, and no <script type=\"blueprint/…\" id=%q> exists",
						source, rule.On, step.Run, step.Run)
				}
			}
		}
	}
	return page, nil
}

// unescape turns the two sequences a blueprint has to write so the browser's
// parser does not end the block early back into the characters they stand for.
// Nothing else is touched: the rule is one line long and fits in a head.
func unescape(code string) string {
	code = strings.ReplaceAll(code, `<\/script>`, `</script>`)
	return strings.ReplaceAll(code, `<\!--`, `<!--`)
}

// ---------- tag scanning ----------

// tag is one `<meta …>` or `<script …>…</script>` found in the document.
type tag struct {
	kind      string // "meta" or "script"
	attr      map[string]string
	start     int // index of '<'
	openEnd   int // index just past the opening tag's '>'
	bodyStart int
	bodyEnd   int
	end       int // index just past the whole tag
}

// scanTags finds the meta and script tags in document order, skipping over
// script bodies so a string inside a page's own JavaScript can never look like a
// tag. It is a scanner, not a parser: blueprints are plain HTML, and the runtime
// needs four attributes out of it.
func scanTags(doc string) []tag {
	low := strings.ToLower(doc)
	var out []tag
	for i := 0; i < len(doc); {
		j := nextTagStart(low, i)
		if j < 0 {
			break
		}
		kind := ""
		if strings.HasPrefix(low[j:], "<script") {
			kind = "script"
		} else if strings.HasPrefix(low[j:], "<meta") {
			kind = "meta"
		}
		if kind == "" {
			i = j + 1
			continue
		}
		openEnd := tagEnd(doc, j)
		if openEnd < 0 {
			break
		}
		t := tag{kind: kind, attr: parseAttrs(doc[j:openEnd]), start: j, openEnd: openEnd + 1}
		if kind == "meta" {
			t.bodyStart, t.bodyEnd, t.end = t.openEnd, t.openEnd, t.openEnd
			out = append(out, t)
			i = t.end
			continue
		}
		// A script body ends at the first literal </script>. An escaped one is
		// `<\/script>` and matches nothing, which is exactly why the escape works.
		rel := strings.Index(low[t.openEnd:], "</script>")
		if rel < 0 {
			break // unterminated: whatever follows is left as the browser sees it
		}
		t.bodyStart = t.openEnd
		t.bodyEnd = t.openEnd + rel
		t.end = t.bodyEnd + len("</script>")
		out = append(out, t)
		i = t.end
	}
	return out
}

// nextTagStart is the first '<' that starts either tag we care about.
func nextTagStart(low string, from int) int {
	a := strings.Index(low[from:], "<script")
	b := strings.Index(low[from:], "<meta")
	switch {
	case a < 0 && b < 0:
		return -1
	case a < 0:
		return from + b
	case b < 0:
		return from + a
	case a < b:
		return from + a
	default:
		return from + b
	}
}

// tagEnd is the index of the '>' closing an opening tag, honoring quoted
// attribute values that contain one.
func tagEnd(doc string, from int) int {
	var quote byte
	for i := from; i < len(doc); i++ {
		switch c := doc[i]; {
		case quote != 0:
			if c == quote {
				quote = 0
			}
		case c == '"' || c == '\'':
			quote = c
		case c == '>':
			return i
		}
	}
	return -1
}

// parseAttrs reads name="value" / name='value' / name=value / bare name pairs out
// of an opening tag. Names are lowercased; values are left as written.
func parseAttrs(raw string) map[string]string {
	attrs := map[string]string{}
	i := strings.IndexAny(raw, " \t\n\r")
	if i < 0 {
		return attrs
	}
	s := raw[i:]
	for j := 0; j < len(s); {
		for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r' || s[j] == '/' || s[j] == '>') {
			j++
		}
		start := j
		for j < len(s) && !strings.ContainsRune(" \t\n\r=/>", rune(s[j])) {
			j++
		}
		name := strings.ToLower(s[start:j])
		for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r') {
			j++
		}
		if name == "" {
			continue
		}
		if j >= len(s) || s[j] != '=' {
			attrs[name] = ""
			continue
		}
		j++
		for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r') {
			j++
		}
		if j < len(s) && (s[j] == '"' || s[j] == '\'') {
			q := s[j]
			j++
			vstart := j
			for j < len(s) && s[j] != q {
				j++
			}
			attrs[name] = s[vstart:j]
			j++
			continue
		}
		vstart := j
		for j < len(s) && !strings.ContainsRune(" \t\n\r>", rune(s[j])) {
			j++
		}
		attrs[name] = s[vstart:j]
	}
	return attrs
}

// titleOf is the display name: the <title> element's text, trimmed.
func titleOf(doc string) string {
	low := strings.ToLower(doc)
	i := strings.Index(low, "<title")
	if i < 0 {
		return ""
	}
	gt := strings.Index(low[i:], ">")
	if gt < 0 {
		return ""
	}
	from := i + gt + 1
	if e := strings.Index(low[from:], "</title>"); e >= 0 {
		return strings.TrimSpace(unescape(doc[from : from+e]))
	}
	return ""
}

