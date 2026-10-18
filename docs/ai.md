<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), writes/reads records via log, connects external systems via bash; it owns two custom tools — ask_user (ask and end the turn) and layout, which reads and replaces the pane layout of the tab the session is shown in (a tree of agent panes stored per tabId via log, so the model can split the screen instead of only talking about it); it is also where an agent is born — ai-new takes a blueprint slug, copies the prototype's two files (.agents/blueprints/<slug>/{README.md,index.html}) into .engineer/agents/<sessionId>/, and appends that README last in the session's system prompt, so an agent carries its own copy of its UI and knows what it is from the first turn; skill discovery (the suggested-skills scan) is gone — skills are plain files that agents read, nothing more

- runtime: bun 1.3

## ai-new

- `POST /ai/new` (network / http)

Instantiate an agent from a blueprint; where it is shown is the tab's business

### Request body

```yaml
blueprint?: string  # slug of a prototype under .agents/blueprints/<slug>/ — required in practice: every agent is made from one. Its README.md and index.html are copied to .engineer/agents/<sessionId>/ and the copy's README is appended to this session's system prompt
```

### Response (status 200)

```yaml
sessionId: string  # the new agent. It belongs to no tab: a tab references agents, and several tabs may reference the same one. Its UI is served at /agent/<sessionId>/ from the copy
```

### Errors

- 400 `bad_request` — blueprint missing, unknown, or a prototype that breaks the two-file rule (only README.md and index.html are allowed)
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/new \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
blueprint: schema-graph
YAML
```

## ai-ask

- `POST /ai/ask` (network / http)

Ask AI; prompt determines what AI does (qa / plan / act). A reply to an ask_user question is an ordinary text block on this same interface — there is no separate answer endpoint

### Request body

```yaml
id: string  # session id
tabId?: string  # the tab this turn is speaking for — the layout tool acts on it. A conversation may be shown in more than one tab, so the caller names the one it is asking from; without it, `layout` has nothing to read or write
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

Two custom tools beyond the built-in ones (`read` / `grep` / `find` / `ls` / `bash` / `write` / `edit`):

- **`ask_user`** — ask a question and end the turn; the answer arrives as an ordinary text block on `/ai/ask`.
- **`layout`** — read or replace the **pane layout** of the tab the current turn is speaking for (`/ai/ask`'s `tabId`). `op: read` returns the current tree; `op: write` replaces it with `layout`. The layout is shared by every conversation in that tab, so another pane's session can change it between turns — hence the tool's insistence on reading before writing. Every handle in the tree is one the tool issued and an unknown one is rejected: a pane's `paneId` (which pane this is — pass it back to keep that pane, leave it out for a new one) and a chat pane's `contentId` (leave it out to open a conversation). The tree is a recursive pair of node shapes:

```yaml
pane:  { paneId: string, contentType: chat | page, contentId: string, flex?: string }
split: { flexDirection: row | column, flex?: string, children: [ … ] }
```

  `flexDirection` is the CSS one: `row` puts the children side by side (left/right), `column` stacks them (top/bottom). `flex` is CSS's `flex` shorthand for a node's share of its parent — the ratio form (`"2 1 0"`) is the one to use, and a node that omits it shares evenly. A pane's `contentId` is a session id or a blueprint slug, and the same one in two panes is one conversation shown twice. A chat pane with no `contentId` gets a fresh session. At most 6 panes. The tree is stored per tab via `log-tab-mutation`, keyed by the session's `tabId`; a write replaces the whole tree, which is why the tool tells the model to read first — and why the result always echoes what was stored. The frontend applies the tree when the tool's frame arrives, so what the model asks for is what the screen shows.
