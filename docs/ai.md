<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), writes/reads records via log, connects external systems via bash; it owns two roles of custom tools — every session gets ask_user (ask and end the turn); main, the one conversation the shell itself hosts, additionally gets the workspace tools (current-tab-list, current-tab-mutation, tab-new, tab-delete, tab-layout-mutation) that read and write tabs and current through log, so main opens, closes, splits and deletes the tabs the shell shows; a sub agent, instantiated from a blueprint, has no workspace tools; ai-new takes a blueprint slug, checks its two required files (README.md + index.html, any css / js / images alongside them), records the session's kind and blueprint in log, and appends that README plus the path of the blueprint directory last in a sub agent's system prompt, so the agent knows what its UI is and where it lives from the first turn; nothing is copied — the web server serves the prototype directory itself, so one page is shared by every agent made from it, and an edit reaches all of them on reload; the role's spec is agents/main or agents/sub; skill discovery is gone — skills are plain files that agents read, nothing more

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

**main** — the one conversation the shell itself hosts — also gets the workspace tools. There is
no session-level tool: a conversation is only reachable through the tab that holds it, so opening
the tab resumes it and deleting the tab deletes it.

- **`current-tab-list`** — the tabs that are open, in display order, each with its title, pane count
  and last activity.
- **`current-tab-mutation`** — open and close tabs: `ops: [{ op: "on" | "off", tabIds, index? }]`,
  applied in order. Opening a tab puts the same record back (it never creates one); both ops are
  idempotent.
- **`tab-new`** — a new agent from a required `blueprint` slug, in a new tab holding one pane. The
  session id is assigned here — the model cannot pass one, and a conversation cannot be moved into
  a tab, because it belongs to the tab that made it.
- **`tab-delete`** — delete a tab and every conversation it showed: the record, the agents and their
  records. The pages belong to their blueprints and stay.
- **`tab-layout-mutation`** — add or remove panes with `ops`: `{ op: "add", nextTo, side, blueprint,
  flex? }` puts a new agent on `side` (`left` / `right` / `top` / `bottom`) of the pane `nextTo`;
  `{ op: "delete", paneId }` removes one. The tree is derived, never written: a side that crosses the
  surrounding split wraps the anchor and the new pane in a split of their own, a split left with one
  child collapses, a tab keeps 1 to 6 panes, and the whole call is refused if any op does not fit.
  The tab's title is recomputed from its pages on every change.

There is no `layout` tool any more: layout is a tab's business, and main is the only one that changes it. A **sub** agent — instantiated from a blueprint — has `ask_user` and the built-ins, nothing else: its page is a view, not a workspace.
