<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# ai

Corazon Engineer ai service — pi-SDK-driven conversation / orchestration (any pi-supported LLM provider; which model a session runs is decided in three layers per slot — the session's own row in log, then the engineer home's models.yaml (main and sub, each with a chat and an image slot), then pi's own default model for chat only — while keys and the model catalog come from pi's own config (env, ~/.pi/agent/auth.json, or --api-key)); exposes ai session APIs to the frontend, reads/writes schema and project files directly via the built-in shell (bash), writes/reads records via log, connects external systems via bash; it owns two roles of custom tools — every session gets ask_user (ask and end the turn) and web_search (live web search behind one pluggable provider — DeepSeek's /v1/tools/search first, chosen by the `provider` argument, default deepseek; the key is the one pi already holds for that provider in auth.json or that provider's own env var and never passes through the model, so a search with no key fails and says why instead of returning nothing; results are a markdown list of title, URL, site, date, authority and abstract) and image (generate a picture with this conversation's image model and show it in the conversation — one OpenAI-compatible POST {baseUrl}/images/generations, falling back to chat-completions with image modalities when the gateway has no images endpoint; baseUrl and credential come from pi's own config; the bytes land in the same content-addressed uploads store a pasted image lands in, so the page draws it with /blobs/<sha256> (the ai service), and the model reads back text plus a file path — the pixels ride in the tool result's details, never as a content block); main, the one conversation the shell itself hosts and the one that belongs to no project, additionally gets the workspace tools (project-list, session-list, session-open, session-close, main-list, main-new, main-resume, session-new, session-delete) that read and write sessions and current through log, so main puts a session on screen, takes it off, creates an agent and deletes one; a tab is not stored — it is one open session, so opening a session is opening its tab; main-new starts a fresh main conversation and moves log's main-session pointer to it, so the shell switches to an empty chat while the previous conversation keeps its records; main-list lists those earlier main conversations and main-resume points the shell back at one, history and all; a sub agent, instantiated from a blueprint inside one project, has no workspace tools; ai-new takes a projectId and a blueprint slug, resolves the project's folder through log — that folder is the agent's cwd and the tree its page is read from — checks the prototype's two required files (README.md + index.html, any css / js / images alongside them), records the session's kind, blueprint and display name in log (and, when the caller names them, its chat and image models), and appends that README plus the path of the blueprint directory last in a sub agent's system prompt, so the agent knows what its UI is and where it lives from the first turn; nothing is copied — the web server serves the prototype directory itself, so one page is shared by every agent made from it, and an edit reaches all of them on reload; the role's spec is agents/main or agents/sub; skill discovery is gone — skills are plain files that agents read, nothing more; --home is this service's own data (uploaded images), not a project — the program runs anywhere and a conversation's project folder comes from its session row

- runtime: bun 1.3

## ai-new

- `POST /ai/new` (network / http)

Instantiate an agent from a blueprint; whether its tab is open is the caller's business (session-open is what puts it on screen)

### Request body

```yaml
projectId?: string  # p_<12 hex> — the project the agent belongs to: its folder is the agent's cwd and the blueprint tree its page comes from. Required for kind=sub, absent for kind=main (main is global and belongs to no project)
blueprint?: string  # slug of a prototype under .agents/blueprints/<slug>/ — required for kind=sub, absent for kind=main. README.md and index.html are required; every other file (css / js / images / subdirectories) is served from the same directory by relative URL. The directory is not copied — /agent/<sessionId>/ serves it directly — and its README plus its path are appended to this session's system prompt; the slug and the page's <title> are recorded on the session row in log
kind?: main | sub  # the role: "main" is the shell's own conversation (no blueprint, workspace tools), "sub" is a blueprint agent (default)
```

### Response (status 200)

```yaml
sessionId: string  # the new agent. It is not on screen yet: a tab is this session, and session-open puts it up. Its UI is served at /agent/<sessionId>/
kind: main | sub  # echoed role; the session row in log stores it
```

### Errors

- 400 `bad_request` — blueprint missing, unknown, or lacking one of its two required files (README.md, index.html); projectId missing for kind=sub, or naming no known project; kind not main | sub
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/ai/new \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
projectId: p_0123456789ab
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

**main** — the one conversation the shell itself hosts — also gets the workspace tools. A tab is
not stored: it is one open session, so a session id is a tab's id, opening a session opens its tab,
and there is nothing else a tab could hold.

- **`project-list`** — the project board: every folder the user opened in Engineer, with its
  projectId, name and path. This is where `session-new`'s project id comes from; a project taken off
  the board is not listed (its conversations keep their records).
- **`session-list`** — the tabs that are open (one session each), in display order, each with its
  session id, title, blueprint and last activity. main is listed apart; closed sessions are not here
  (the launcher lists them).
- **`session-open`** — put existing sessions on screen, in the order given, at an optional `index`.
  This creates nothing: a session that was closed comes back as itself, history and all. Idempotent;
  main's own id is refused (`main-resume` is the way back to it).
- **`session-close`** — take sessions off screen. Everything they hold stays, and `session-open` puts
  them back; idempotent.
- **`session-new`** — a new agent from a required `blueprint` slug and a required `project` id (from
  `project-list`), in a new tab, already on screen. The agent runs in that project's folder and its
  page is read from that project's `.agents/blueprints/`. The session id is assigned here — the
  model cannot pass one, and a conversation cannot be moved into a tab, because a new tab always
  means a new agent.
- **`session-delete`** — delete one session for good: the agent, its records and its row, and its tab
  goes with them. The page belongs to its blueprint and stays. main is refused — replacing it is
  `main-new`'s job.
- **`main-list`** — main's own conversations, most recently active first: id, last activity,
  message count and the first user message. The one on screen is marked `*`; blueprint agents are
  not listed (a tab is how they get on screen). This is where `main-resume`'s ids come from.
- **`main-new`** — replace main with a fresh conversation: a new `kind: main` session is made with
  the same role and tools, log's `current.main_session` moves to it, and the shell follows the tool
  frame to it. The conversation that called the tool is not deleted — its records stay in log, and
  `main-resume` brings it back — but nothing shows it once the call returns.
- **`main-resume`** — put an earlier main conversation back on screen by id: the session is resumed
  (a live one is a no-op, one with records is rebuilt from them), `current.main_session` moves to
  it, and the shell follows the tool frame. Resuming what is already on screen is a no-op; a
  blueprint agent's id is refused.
There is no layout tool: a tab shows exactly one agent and its page is that agent's blueprint, so no
model decides the shape of the screen. A **sub** agent — instantiated from a blueprint — has
`ask_user` and the built-ins, nothing else: its page is a view, not a workspace.
