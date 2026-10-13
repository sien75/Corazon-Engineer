<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; keys from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), validates the schema via static, writes/reads records via log, connects external systems via bash; it also owns automatic skill discovery — a skill is one piece of text, kept as a file at .agents/skills/<slug>/SKILL.md with candidates at .engineer/suggested-skills/<slug>.md, discovered from past conversation runs read back through log, and running one opens a session with that text; blueprints are frontend resources under .agents/blueprints/, written by the agent as plain files and served/listed by static — ai has no blueprint interface of its own

- runtime: bun 1.3

## ai-new

- `POST /ai/new` (network / http)

Create a conversation; where it is shown is the tab's business

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
sessionId: string  # the new conversation. A conversation belongs to no tab: a tab references conversations, and several tabs may reference the same one
```

### Errors

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
