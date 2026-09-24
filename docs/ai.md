<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema files directly via the built-in shell (bash), validates the schema via static, writes/reads records via log, connects external systems via bash

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

