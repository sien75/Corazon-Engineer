package ai

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

const (
	// CredentialsDir holds one markdown file per credential, named explicitly
	// after the provider, e.g. .corazon/credentials/deepseek.md
	CredentialsDir = ".corazon/credentials"
	// DeepSeekFile is the DeepSeek credential file under CredentialsDir.
	DeepSeekFile = "deepseek.md"
	KeyDeepSeek  = "DEEPSEEK_API_KEY"
)

// LoadCredentials reads key=value pairs from <root>/.corazon/credentials/<name>.
// Blank lines and lines starting with # are ignored. Returns an empty map on error.
func LoadCredentials(root, name string) map[string]string {
	out := map[string]string{}
	data, err := os.ReadFile(filepath.Join(root, CredentialsDir, name))
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
