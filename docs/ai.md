<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema files directly via the built-in shell (bash), validates the schema via static, writes/reads records via log, connects external systems via bash; also owns the skill system (a skill is one piece of text; running it opens a session with that text) in its own sqlite (.engineer/skill.db), including suggested-skill discovery over past conversation runs

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

Ask AI; prompt determines what AI does (qa / plan / act)

### Request body

```yaml
id: string
prompt: string
```

### Response (status 200)

```yaml
sessionId: string
```

### Errors

- 400 `bad_request` — prompt missing or empty
- 404 `not_found` — session not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/ask \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
  prompt: string
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

## ai-skill-list

- `POST /ai/skill/list` (network / http)

List skills (custom / suggested) owned by the ai service

### Request body

```yaml
source?: custom | suggested  # filter by skill source
status?: active | ignored  # filter by skill status
```

### Response (status 200)

```yaml
skills:  # newest updated first
    - id: string
      name: string  # skill display name
      text: string  # the skill itself: one piece of text
      source: custom | suggested
      status: active | ignored  # ignored only applies to suggested
      createdAt: string  # RFC3339
      updatedAt: string  # RFC3339
      evidence?: object  # suggested only: where the candidate came from
```

### Errors

- 400 `bad_request` — unknown source or status filter
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/list \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  source?: custom | suggested  # filter by skill source
  status?: active | ignored  # filter by skill status
YAML
```

## ai-skill-save

- `POST /ai/skill/save` (network / http)

Create or update a custom skill; the AI creates skills through this interface too

### Request body

```yaml
id?: string  # present = update that skill, absent = create a new one
name: string  # skill display name
text: string  # the skill itself: one piece of text handed to the model on run
```

### Response (status 200)

```yaml
skill:
    id: string
    name: string
    text: string
    source: custom  # saving always produces a custom skill
    status: active
    createdAt: string  # RFC3339
    updatedAt: string  # RFC3339
```

### Errors

- 400 `bad_request` — name or text missing or empty
- 404 `not_found` — skill to update does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/save \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id?: string  # present = update that skill, absent = create a new one
  name: string  # skill display name
  text: string  # the skill itself: one piece of text handed to the model on run
YAML
```

## ai-skill-delete

- `POST /ai/skill/delete` (network / http)

Delete a custom skill

### Request body

```yaml
id: string  # skill id
```

### Response (status 200)

```yaml
skillId: string
```

### Errors

- 400 `bad_request` — id missing
- 404 `not_found` — skill does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/delete \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string  # skill id
YAML
```

## ai-skill-ignore

- `POST /ai/skill/ignore` (network / http)

Ignore or restore a suggested skill; ignored skills are kept for de-duplication but never surfaced again

### Request body

```yaml
id: string  # skill id
ignored?: boolean  # true (default) = ignore, false = restore to active
```

### Response (status 200)

```yaml
skill:
    id: string
    name: string
    text: string
    source: custom | suggested
    status: active | ignored
    createdAt: string  # RFC3339
    updatedAt: string  # RFC3339
```

### Errors

- 400 `bad_request` — id missing
- 404 `not_found` — skill does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/ignore \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string  # skill id
  ignored?: boolean  # true (default) = ignore, false = restore to active
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

## ai-skill-refresh

- `POST /ai/skill/refresh` (network / http)

Manually trigger one suggested-skill scan over pending conversation runs

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
triggered: boolean  # false when a scan is already running or nothing is pending
scanned: number  # runs included in this scan, 0 when nothing was triggered
```

### Errors

- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/skill/refresh \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
YAML
```
