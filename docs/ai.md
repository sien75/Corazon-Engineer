<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), writes/reads records via log, connects external systems via bash; it owns two roles of custom tools — every session gets ask_user (ask and end the turn); main, the one conversation the shell itself hosts, additionally gets the workspace tools (session-list, session-resume, tab-list, tab-mutation, tab-on, tab-off, tab-delete) that read and write sessions, tabs and current through log, so main opens, closes, splits and deletes the tabs the shell shows; a sub agent, instantiated from a blueprint, has no workspace tools; ai-new takes a blueprint slug, checks its two required files (README.md + index.html, any css / js / images alongside them), records the session's kind and blueprint in log, and appends that README plus the path of the blueprint directory last in a sub agent's system prompt, so the agent knows what its UI is and where it lives from the first turn; nothing is copied — the web server serves the prototype directory itself, so one page is shared by every agent made from it, and an edit reaches all of them on reload; the role's spec is agents/main or agents/sub; skill discovery is gone — skills are plain files that agents read, nothing more

- runtime: bun 1.3

## ai-new

- `POST /ai/new` (network / http)

Instantiate an agent from a blueprint; where it is shown is the tab's business

### Request body

```yaml
blueprint?: string  # slug of a prototype under .agents/blueprints/<slug>/ — required for kind=sub, absent for kind=main. README.md and index.html are required; every other file (css / js / images / subdirectories) is served from the same directory by relative URL. The directory is not copied — /agent/<sessionId>/ serves it directly — and its README plus its path are appended to this session's system prompt; the slug is recorded on the session row in log
kind?: main | sub  # the role: "main" is the shell's own conversation (no blueprint, workspace tools), "sub" is a blueprint agent (default)
```

### Response (status 200)

```yaml
sessionId: string  # the new agent. It belongs to no tab: a tab references agents, and several tabs may reference the same one. Its UI is served at /agent/<sessionId>/ from the copy
kind: main | sub  # echoed role; the session row in log stores it
```

### Errors

- 400 `bad_request` — blueprint missing, unknown, or lacking one of its two required files (README.md, index.html); kind not main | sub
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/new \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
blueprint: project
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

## ai-stop

- `POST /ai/stop` (network / http)

Abort the run currently streaming in a session; the session itself survives and can be asked again

### Request body

```yaml
id: string  # session id
```

### Response (status 200)

```yaml
sessionId: string  # same session, now idle
```

### Errors

- 404 `not_found` — session not found
- 500 `ai_error` — the abort itself failed

### Example

```bash
curl -s -X POST <address>/ai/stop \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string  # session id
YAML
```

## ai-delete

- `POST /ai/delete` (network / http)

Delete an agent — its live session, and the copy of its blueprint

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

Resume an existing conversation session, rebuilding its text context from log records; malformed history (orphan tool results, tool calls without a result, duplicate seq) is repaired in memory before it is replayed

### Request body

```yaml
id: string  # session id
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
  id: s_1a2b3c
YAML
```

## ai-blobs

- `GET /blobs/{sha256}` (network / http)

Read back a stored image by its content address, as raw bytes

### Request body

```yaml
sha256: string  # content address — it is the path segment of /blobs/{sha256}
```

### Response (status 200)

```yaml
# the raw image itself, not yaml; Content-Type is the mime it was stored with,
# Cache-Control is public, max-age=31536000, immutable
bytes
```

### Errors

- 404 `not_found` — no blob is stored under that address

### Example

```bash
curl -s -X GET <address>/blobs/<sha256> -o image.png
```

## Tools

Two roles, two tool surfaces. Every session gets the pi built-ins (`read` / `grep` / `find` / `ls` / `bash` / `write` / `edit`) plus **`ask_user`** — ask a question and end the turn; the answer arrives as an ordinary text block on `/ai/ask`.

**main** — the one conversation the shell itself hosts — also gets the workspace tools:

- **`session-list`** — the project's conversations (id, kind, message count, preview).
- **`session-resume`** — rebuild a conversation server-side so it can be asked again.
- **`session-delete`** — delete one conversation for good: the agent and its records. The page
  belongs to its blueprint and stays. It refuses the conversation it runs in (main cannot delete itself), and it
  does not touch tabs — a tab still showing that agent keeps a dead pane, so a tab that should
  go too is `tab-delete`'s job. An unknown id is an error, not a silent success (`/log/delete`
  answers 200 with `deleted: 0` for ids that never existed).
- **`tab-list`** — the open tabs, each one's pane tree and the agents in it, plus the main session.
- **`tab-mutation`** — replace one tab's pane tree. The tree is `{ pane: { paneId, contentId, flex? } }`, `{ pane: { blueprint: "<slug>" } }` to instantiate a new agent into a pane, or `{ split: { flexDirection: "row" | "column", flex?, children: [ … ] } }`; at most 6 panes. A write replaces the whole tree, so the model is told to read `tab-list` first and pass back the paneIds it means to keep.
- **`tab-on`** — open a tab for a new agent (`blueprint`) or an existing conversation (`sessionId`).
- **`tab-off`** — close a tab, keeping its record so it can be reopened.
- **`tab-delete`** — delete a tab and its conversations' records (pages belong to their blueprints and stay).

There is no `layout` tool any more: layout is a tab's business, and main is the only one that changes it. A **sub** agent — instantiated from a blueprint — has `ask_user` and the built-ins, nothing else: its page is a view, not a workspace.
