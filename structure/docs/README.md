# Corazon Engineer interfaces

Four services: **log** (state and records), **ai** (conversations), **static** (project files), **web** (the shell). Their addresses are not fixed — each run picks them, and they are given to you when the session starts.

## Calling

- `POST <service address><path>`, body YAML (JSON also parses), `Content-Type: application/yaml`. Responses are YAML.
- A failure is a non-200 with `error: {code, message}`.
- Ids: project `p_<12 hex>`, session `s_<hex>`.
- `*-stream` interfaces are SSE for pages; do not call them.

```bash
curl -s -X POST <log>/log/session/list -H 'Content-Type: application/yaml' --data-binary 'pageNum: 1'
```

## Common tasks

Each step is one call; read the interface's file for its fields and rules.

- List projects: `log-project-list`. A project's blueprints: `ls <project path>/.agents/blueprints/`.
- List sessions: `log-session-current-get` (open ones, main), `log-session-list`, `log-session-detail`.
- Start an agent and put it on screen: `ai-new`, then `log-session-on`.
- Close / reopen a session: `log-session-off` / `log-session-on`.
- Delete a session: `ai-delete`.
- Replace main with a fresh conversation: `log-session-current-get`, `ai-new` (kind main), `log-session-current-put`.
- Bring an earlier main back: `log-session-list` (kind main), `ai-resume`, `log-session-current-put`.
- Record a test / an observation: `log-test-add` / `log-telemetry-add`.

## Interfaces

Each file has the description, request, response and errors of one interface.

### ai

- `POST /ai/ask` — Ask AI — [ai-ask](ai-ask.md)
- `GET /blobs/{sha256}` — Read back a stored image by its content address, as raw bytes — [ai-blobs](ai-blobs.md)
- `POST /ai/delete` — Delete an agent, its records and its session row for good — [ai-delete](ai-delete.md)
- `POST /ai/new` — Instantiate an agent from a blueprint — [ai-new](ai-new.md)
- `POST /ai/resume` — Resume an existing conversation, rebuilding its context from log records — [ai-resume](ai-resume.md)
- `POST /ai/stop` — Abort the run currently streaming in a session — [ai-stop](ai-stop.md)
- `POST /ai/stream` — Stream AI output as native pi events — [ai-stream](ai-stream.md)

### log

- `POST /log/project/add` — Put a folder on the project board — [log-project-add](log-project-add.md)
- `POST /log/project/get` — Read one project by id, removed or not — [log-project-get](log-project-get.md)
- `POST /log/project/list` — The project board — [log-project-list](log-project-list.md)
- `POST /log/project/remove` — Take a project off the board — [log-project-remove](log-project-remove.md)
- `POST /log/project/visible` — Show or hide one project's group in the titlebar — [log-project-visible](log-project-visible.md)
- `POST /log/search` — Full-text search across records — [log-search](log-search.md)
- `POST /log/session/current/get` — Read the workspace — [log-session-current-get](log-session-current-get.md)
- `POST /log/session/current/put` — Replace the workspace — [log-session-current-put](log-session-current-put.md)
- `POST /log/session/delete` — Delete a conversation session's records and its session row — [log-session-delete](log-session-delete.md)
- `POST /log/session/detail` — Read one conversation's kind, project, blueprint and name — [log-session-detail](log-session-detail.md)
- `POST /log/session/list` — List conversation sessions, most recently active first — [log-session-list](log-session-list.md)
- `POST /log/session/messages` — Fetch a conversation session's messages (full content), in chronological order — [log-session-messages](log-session-messages.md)
- `POST /log/session/off` — Close sessions — [log-session-off](log-session-off.md)
- `POST /log/session/on` — Put existing sessions back on screen — [log-session-on](log-session-on.md)
- `POST /log/session/record/add` — Append one message record to a conversation session — [log-session-record-add](log-session-record-add.md)
- `POST /log/session/upsert` — Store a conversation's kind, project, blueprint, name and models — [log-session-upsert](log-session-upsert.md)
- `POST /log/stream` — Subscribe to record stream — [log-stream](log-stream.md)
- `POST /log/telemetry/add` — Append one telemetry record — [log-telemetry-add](log-telemetry-add.md)
- `POST /log/telemetry/detail` — Fetch one telemetry record's full payload — [log-telemetry-detail](log-telemetry-detail.md)
- `POST /log/telemetry/query` — List telemetry records, newest first — [log-telemetry-query](log-telemetry-query.md)
- `POST /log/test/add` — Append one test record — [log-test-add](log-test-add.md)
- `POST /log/test/detail` — Fetch one test record's full payload — [log-test-detail](log-test-detail.md)
- `POST /log/test/query` — List test records, newest first — [log-test-query](log-test-query.md)
- `POST /log/workspace/stream` — Subscribe to workspace changes — [log-workspace-stream](log-workspace-stream.md)

### static

- `POST /static/query` — Return full schema data for rendering the architecture graph and atom/edge details — [static-query](static-query.md)
- `POST /static/query-detail` — Fetch content of a single leaf file — [static-query-detail](static-query-detail.md)
- `POST /static/stream` — Long-lived connection pushing schema-change events — [static-stream](static-stream.md)
