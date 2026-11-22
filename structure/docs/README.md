# Corazon Engineer interfaces

Four services: **storage** (state), **ai** (conversations), **blueprint** (each blueprint's runtime), **web** (the shell). Their addresses are not fixed — each run picks them, and they are given to you when the session starts. storage answers on one prefix, `/log/*`, for records and sessions. The `/static/*` views of a folder's file tree are parked in `static_bak/` at the checkout root and are no longer served.

## Calling

- `POST <service address><path>`, body YAML (JSON also parses), `Content-Type: application/yaml`. Responses are YAML.
- A failure is a non-200 with `error: {code, message}`.
- Ids: session `s_<hex>`.
- `*-stream` interfaces are SSE for pages; do not call them.
- A blueprint's own routes (`/bp/<project>/<slug>`, `/bp-dev/<project>/<slug>`, their `/events` and `/op`) are browser-facing and are not listed here: they exist so a blueprint page can talk to its runtime (`structure/contracts/blueprint-*.yaml`). Blueprints live in **projects** — one blueprints folder each, imported in the web UI, all of them running once imported — and a blueprint is a single `.html` file inside one of them; the format is in `agents/blueprint.md`. `prod` (`/bp/<project>/<slug>`) is loaded when the project is imported, `dev` (`/bp-dev/<project>/<slug>`) when its page is first opened, each against its own database, and neither reloads except by the page's reload button.

```bash
curl -s -X POST <storage>/log/session/list -H 'Content-Type: application/yaml' --data-binary 'pageNum: 1'
```

## Common tasks

Each step is one call; read the interface's file for its fields and rules.

- List what can be opened: `blueprint-list` (the front project's blueprints). A page is at `/bp/<project>/<slug>`, always through web's origin.
- Start a conversation: `blueprint-chat-session` when a page needs one — blueprint composes the agent's system text and calls `ai-new` for you. Calling `ai-new` yourself is the low-level form: the folder the agent works in (`cwd`) plus, if it should know anything, the text to append to its system prompt (`system`). A session is a plain conversation — nothing names a project, a blueprint or a role.
- List sessions, most recently active first: `log-session-list`. One session: `log-session-detail`.
- Ask and follow: `ai-ask`, then `ai-stream`.
- Pick up an earlier conversation: `ai-resume`, then replay `log-session-messages`.
- Abort a run in flight: `ai-stop`.
- Delete a session: `ai-delete`.

## Interfaces

Each file has the description, request, response and errors of one interface.
Interfaces marked *(browser)* are loaded by a page, never called by an agent.

### web

The shell the user opens: the page itself, plus the forwarding that keeps one origin for everything a page touches. Only `/config.js` is an interface of its own — the rest are blueprint's, passed through unchanged.

- `GET /config.js` — The shell's runtime configuration: the addresses a page calls, its working folder, and the projects in the corner — [web-config](web-config.md) *(browser)*

### blueprint

Each blueprint's runtime, plus the projects its pages live in. The shell's conversation routes are ai's, except `/chat/session`, which exists so the system text an agent is given is composed in one place:

- `GET /bp/{project}/{slug}` — Serve a blueprint page — [blueprint-page](blueprint-page.md)
- `GET /bp/{project}/{slug}/events` — The blueprint's bus, as one SSE stream per open page — [blueprint-events](blueprint-events.md)
- `POST /bp/{project}/{slug}/op` — One request from a blueprint page to its runtime — [blueprint-op](blueprint-op.md) *(browser)*
- `GET /config/blueprints` — The front project's blueprints, as the shell's strip lists them — [blueprint-list](blueprint-list.md)
- `POST /chat/session` — Raise a conversation for a blueprint's page — [blueprint-chat-session](blueprint-chat-session.md)
- `GET /config/projects` — The imported blueprints folders and the one in front — [blueprint-projects](blueprint-projects.md) *(browser)*
- `POST /config/projects` — Import a blueprints folder — [blueprint-projects-add](blueprint-projects-add.md) *(browser)*
- `POST /config/projects/foreground` — Bring an imported project to the front — [blueprint-projects-foreground](blueprint-projects-foreground.md) *(browser)*
- `DELETE /config/projects` — Remove an imported project — it stops running — [blueprint-projects-remove](blueprint-projects-remove.md) *(browser)*

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
