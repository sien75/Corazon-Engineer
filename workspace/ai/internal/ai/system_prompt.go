package ai

import _ "embed"

// SystemPrompt is the runtime system prompt.
// It is a static copy of devtime/system-prompt/SKILL_zh.md, kept inside this
// module so the ai binary is self-contained (devtime is not coupled in at build time).
//
//go:embed system-prompt.md
var SystemPrompt string
