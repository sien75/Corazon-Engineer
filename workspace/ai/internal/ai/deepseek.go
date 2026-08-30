package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"corazon/ai/internal/tools"
)

type ChatMessage struct {
	Role         string     `json:"role"`
	Content      string     `json:"content,omitempty"`
	ToolCallID   string     `json:"tool_call_id,omitempty"`
	ToolCalls    []ToolCall `json:"tool_calls,omitempty"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func newToolCall(id, name, args string) ToolCall {
	tc := ToolCall{ID: id, Type: "function"}
	tc.Function.Name = name
	tc.Function.Arguments = args
	return tc
}

type deepseekClient struct {
	apiKey string
	model  string
	base   string
	http   *http.Client
}

func newDeepseekClient(apiKey string) *deepseekClient {
	return &deepseekClient{
		apiKey: apiKey,
		model:  "deepseek-chat",
		base:   "https://api.deepseek.com",
		http:   &http.Client{Timeout: 180 * time.Second},
	}
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Tools    []openAITool  `json:"tools,omitempty"`
	Stream   bool          `json:"stream"`
}

type openAITool struct {
	Type     string                 `json:"type"`
	Function map[string]interface{} `json:"function"`
}

func buildOpenAITools(tls []tools.Tool) []openAITool {
	var out []openAITool
	for _, t := range tls {
		out = append(out, openAITool{Type: "function", Function: map[string]interface{}{
			"name":        t.Name,
			"description": t.Description,
			"parameters":  t.Parameters,
		}})
	}
	return out
}

// streamResult is the accumulated outcome of a streaming chat completion.
type streamResult struct {
	Content   string
	ToolCalls []ToolCall
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content   string            `json:"content"`
			ToolCalls []streamToolDelta `json:"tool_calls"`
		} `json:"delta"`
	} `json:"choices"`
}

type streamToolDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type toolAccum struct {
	ID   string
	Name string
	Args string
}

// chatStream sends a streaming chat completion with tools (OpenAI-compatible
// function calling). Content deltas are passed to onContent as they arrive;
// accumulated tool_calls are returned in the result.
func (c *deepseekClient) chatStream(ctx context.Context, messages []ChatMessage, tls []tools.Tool, onContent func(string)) (*streamResult, error) {
	req := chatRequest{Model: c.model, Messages: messages, Tools: buildOpenAITools(tls), Stream: true}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("deepseek http %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}

	result := &streamResult{}
	var tcs []toolAccum
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var ch streamChunk
		if err := json.Unmarshal([]byte(data), &ch); err != nil {
			continue
		}
		if len(ch.Choices) == 0 {
			continue
		}
		d := ch.Choices[0].Delta
		if d.Content != "" {
			result.Content += d.Content
			if onContent != nil {
				onContent(d.Content)
			}
		}
		for _, td := range d.ToolCalls {
			for len(tcs) <= td.Index {
				tcs = append(tcs, toolAccum{})
			}
			if td.ID != "" {
				tcs[td.Index].ID = td.ID
			}
			if td.Function.Name != "" {
				tcs[td.Index].Name += td.Function.Name
			}
			if td.Function.Arguments != "" {
				tcs[td.Index].Args += td.Function.Arguments
			}
		}
	}
	if err := sc.Err(); err != nil {
		return result, err
	}
	for _, tc := range tcs {
		result.ToolCalls = append(result.ToolCalls, newToolCall(tc.ID, tc.Name, tc.Args))
	}
	return result, nil
}
