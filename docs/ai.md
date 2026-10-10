<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), validates the schema via static, writes/reads records via log, connects external systems via bash; it also owns automatic skill discovery — a skill is one piece of text, kept as a file at .agents/skills/<slug>/SKILL.md with candidates at .engineer/suggested-skills/<slug>.md, discovered from past conversation runs read back through log, and running one opens a session with that text; blueprints are frontend resources under .agents/blueprints/, written by the agent as plain files and served/listed by static — ai has no blueprint interface of its own

- runtime: bun 1.3

## ai-new

- `POST /ai/new` (network / http)

Create a new session and return session id

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
sessionId: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/new \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
YAML
```

## ai-ask

- `POST /ai/ask` (network / http)

Ask AI; prompt determines what AI does (qa / plan / act). A reply to an ask_user question is an ordinary text block on this same interface — there is no separate answer endpoint

### Request body

```yaml
id: string  # session id
blocks:  # the user turn, in order; a reply to ask_user is just a text block
    - type: text | image  # "text" carries text, "image" carries base64 data + mimeType
      text?: string  # text block: the prompt text
      data?: string  # image block: base64-encoded bytes
      mimeType?: string  # image block: e.g. image/png
```

### Response (status 200)

```yaml
sessionId: string  # same session, used to pull stream
```

### Errors

- 400 `bad_request` — blocks missing or empty
- 404 `not_found` — session not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/ask \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
id: string  # session id
blocks:  # the user turn, in order; a reply to ask_user is just a text block
    - type: text | image  # "text" carries text, "image" carries base64 data + mimeType
      text?: string  # text block: the prompt text
      data?: string  # image block: base64-encoded bytes
      mimeType?: string  # image block: e.g. image/png
YAML
```

## ai-stream

- `POST /ai/stream` (network / http)

Stream AI output as native pi events; the frontend renders the subset it needs

### Request body

```yaml
id: string
since?: number
```

### Response (stream: sse)

```yaml
error?:
    code: string
    message: string
reason?: error | aborted
seq: number
type: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — session not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/stream \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
  since?: number
YAML
```

## ai-delete

- `POST /ai/delete` (network / http)

Delete a session and its stream

### Request body

```yaml
id: string
```

### Response (status 200)

```yaml
sessionId: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — session not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/delete \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
YAML
```

## ai-resume

- `POST /ai/resume` (network / http)

Resume an existing conversation session, rebuilding its text context from log records

### Request body

```yaml
id: string
```

### Response (status 200)

```yaml
active: boolean
lastSeq: number
sessionId: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — session has no live session and no recorded history
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/resume \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
YAML
```

## ai-skill-run

- `POST /ai/skill/run` (network / http)

Instantiate a skill — open a session and hand the skill text to the model as the first prompt; the client then subscribes to ai-stream with the returned sessionId

### Request body

```yaml
skillId?: string  # instantiate a saved skill
name?: string  # or run an ad-hoc skill (text required, name optional)
text?: string
```

### Response (status 200)

```yaml
sessionId: string  # the session created for this skill instance
skillId?: string  # echoed when a saved skill was instantiated
```

### Errors

- 400 `bad_request` — neither skillId nor text given
- 404 `not_found` — skill does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/run \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  skillId?: string  # instantiate a saved skill
  name?: string  # or run an ad-hoc skill (text required, name optional)
  text?: string
YAML
```
