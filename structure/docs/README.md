# Corazon Engineer interfaces

Three services: **storage** (state and a folder's files), **ai** (conversations), **blueprint** (the shell, and each blueprint page). Their addresses are not fixed — each run picks them, and they are given to you when the session starts. storage answers on two prefixes: `/log/*` for records and sessions, `/static/*` for a folder's files — one address, both kinds of call.

## Calling

- `POST <service address><path>`, body YAML (JSON also parses), `Content-Type: application/yaml`. Responses are YAML.
- A failure is a non-200 with `error: {code, message}`.
- Ids: session `s_<hex>`.
- `*-stream` interfaces are SSE for pages; do not call them.
- A blueprint's own routes (`/b/<slug>`, `/b/<slug>/events`, `/b/<slug>/op`) are browser-facing and are not listed here: they exist so a blueprint page can talk to its runtime (`structure/contracts/blueprint-*.yaml`), and opening `/b/<slug>` in a browser is what loads one. A blueprint is a single `.html` file in `.agents/blueprints/`; the format is in `agents/blueprint.md`.

```bash
curl -s -X POST <storage>/log/session/list -H 'Content-Type: application/yaml' --data-binary 'pageNum: 1'
```

## Common tasks

Each step is one call; read the interface's file for its fields and rules.

- Start a conversation: `ai-new` with the folder the agent works in (`cwd`) and, if it should know anything, the text to append to its system prompt (`system`). A session is a plain conversation — nothing names a project, a blueprint or a role.
- List sessions, most recently active first: `log-session-list`. One session: `log-session-detail`.
- Ask and follow: `ai-ask`, then `ai-stream`.
- Pick up an earlier conversation: `ai-resume`, then replay `log-session-messages`.
- Abort a run in flight: `ai-stop`.
- Delete a session: `ai-delete`.

## Interfaces

Each file has the description, request, response and errors of one interface.
Interfaces marked *(browser)* are loaded by a page, never called by an agent.

### blueprint

The shell and each blueprint page. The shell's conversation routes are ai's; these three belong to the page↔runtime protocol a blueprint uses:

- `GET /b/{slug}` — Serve a blueprint page — [blueprint-page](blueprint-page.md)
- `GET /b/{slug}/events` — The blueprint's bus, as one SSE stream per open page — [blueprint-events](blueprint-events.md)
- `POST /b/{slug}/op` — One request from a blueprint page to its runtime — [blueprint-op](blueprint-op.md) *(browser)*

### ai

- `POST /ai/ask` — Ask AI — [ai-ask](ai-ask.md)
- `GET /blobs/{sha256}` — Read back a stored image by its content address, as raw bytes — [ai-blobs](ai-blobs.md)
- `POST /ai/delete` — Delete a conversation, its records and its session row for good — [ai-delete](ai-delete.md)
- `POST /ai/new` — Start a conversation session — [ai-new](ai-new.md)
- `POST /ai/resume` — Resume an existing conversation, rebuilding its context from storage records — [ai-resume](ai-resume.md)
- `POST /ai/stop` — Abort the run currently streaming in a session — [ai-stop](ai-stop.md)
- `POST /ai/stream` — Stream AI output as native pi events — [ai-stream](ai-stream.md)

### storage

Records and sessions (the `/log/*` prefix):

- `POST /log/session/delete` — Delete a conversation session's records and its session row — [log-session-delete](log-session-delete.md)
- `POST /log/session/detail` — Read one conversation's folder, system text, name and models — [log-session-detail](log-session-detail.md)
- `POST /log/session/list` — List conversation sessions, most recently active first — [log-session-list](log-session-list.md)
- `POST /log/session/messages` — Fetch a conversation session's messages (full content), in chronological order — [log-session-messages](log-session-messages.md)
- `POST /log/session/record/add` — Append one message record to a conversation session — [log-session-record-add](log-session-record-add.md)
- `POST /log/session/upsert` — Store a conversation's folder, system text, name and models — [log-session-upsert](log-session-upsert.md)

A folder's files — atoms, edges, contracts and the prose beside them (the `/static/*` prefix). Each call names the folder by its absolute path; storage keeps no board of projects:

- `POST /static/query` — Return full schema data for rendering the architecture graph and atom/edge details — [static-query](static-query.md)
- `POST /static/query-detail` — Fetch content of a single leaf file — [static-query-detail](static-query-detail.md)
- `POST /static/stream` — Long-lived connection pushing schema-change events — [static-stream](static-stream.md)