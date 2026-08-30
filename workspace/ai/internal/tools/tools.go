package tools

import "encoding/json"

// Tool is a DeepSeek function-calling tool definition.
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// BuiltinTools returns the corazon-internal tool definitions (generated from contracts/).
func BuiltinTools() ([]Tool, error) {
	var out []Tool
	if err := json.Unmarshal([]byte(builtinToolsRaw), &out); err != nil {
		return nil, err
	}
	return out, nil
}
