package ai

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

const (
	CredentialsPath = ".corazon/credentials.md"
	KeyDeepSeek     = "DEEPSEEK_API_KEY"
)

// LoadCredentials reads key=value pairs from <root>/.corazon/credentials.md.
// Blank lines and lines starting with # are ignored. Returns an empty map on error.
func LoadCredentials(root string) map[string]string {
	out := map[string]string{}
	data, err := os.ReadFile(filepath.Join(root, CredentialsPath))
	if err != nil {
		return out
	}
	sc := bufio.NewScanner(strings.NewReader(string(data)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if ok {
			out[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	return out
}
