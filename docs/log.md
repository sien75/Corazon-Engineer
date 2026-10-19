<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# log

Corazon Engineer log service — owns the project's sqlite state — records (call / observe / conversation), sessions (each conversation's kind, main or sub, the blueprint it drives and its display name) and current (which sessions are open — the shell's tab bar — and which one is main); a tab is not stored: it is one open session, so the open list is all the workspace needs; exposes log query/detail/search/mutation/stream/list/delete APIs plus the session and current ones

- runtime: go 1.22

## log-query

- `POST /log/query` (network / http)

Query records (test run / telemetry observe / ai conversation); list view

### Request body

```yaml
atom?: string
end?: string
env?: string
kind?: test | telemetry | conversation
pageNum?: number
sessionId?: string
start?: string
```

### Response (status 200)

```yaml
hasMore: boolean
pageNum: number
pageSize: 100
records:
    - atom?: string
      createdAt: string
      env?: string
      id: string
      kind: test | telemetry | conversation
      summary: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/query \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  atom?: string
  end?: string
  env?: string
  kind?: test | telemetry | conversation
  pageNum?: number
  sessionId?: string
  start?: string
YAML
```

## log-session-messages

- `POST /log/session/messages` (network / http)

Fetch a conversation session's messages (full content), in chronological order

### Request body

```yaml
sessionId: string
```

### Response (status 200)

```yaml
messages:
    - content: string
      createdAt: string
      raw?: object
      role: string
      seq: number
sessionId: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/messages \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  sessionId: string
YAML
```


## log-session-on

- `POST /log/session/on` (network / http)

Put existing sessions back on screen — add them to the open list (the shell's tab bar) without creating anything; idempotent

### Request body

```yaml
sessionIds: [string]  # conversations to open; already-open ids keep their place
index?: number  # where the first newly opened session goes; omitted appends
```

### Response (status 200)

```yaml
openSessions: [string]
```

### Errors

- 400 `bad_request` — sessionIds missing, or one of them has no session row
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/on \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionIds: [s_1a2b3c]
YAML
```

## log-session-off

- `POST /log/session/off` (network / http)

Close sessions — take them off the open list, keeping their records so they can be opened again

### Request body

```yaml
sessionIds: [string]  # sessions to close; ids that are not open are ignored
```

### Response (status 200)

```yaml
openSessions: [string]
```

### Errors

- 400 `bad_request` — sessionIds missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/off \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionIds: [s_1a2b3c]
YAML
```
## log-delete

- `POST /log/delete` (network / http)

Delete a conversation session's records and its session row (clearing it as main when it was)

### Request body

```yaml
sessionId: string
```

### Response (status 200)

```yaml
deleted: number
sessionId: string
```

### Errors

- 400 `bad_request` — sessionId missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/delete \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  sessionId: string
YAML
```

## log-list

- `POST /log/list` (network / http)

List conversation sessions, most recently active first — one entry per session, including one that has not been asked anything yet (count 0)

### Request body

```yaml
pageNum?: number
```

### Response (status 200)

```yaml
hasMore: boolean
pageNum: number
pageSize: 100
sessions:
    - blueprint: string
      count: number
      createdAt: string
      kind: main | sub
      lastAt: string
      preview: string
      sessionId: string
      title: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/list \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  pageNum?: number
YAML
```

## log-query-detail

- `POST /log/query-detail` (network / http)

Fetch a single record's full content

### Request body

```yaml
id: string
```

### Response (status 200)

```yaml
atom?: string
createdAt: string
env?: string
id: string
kind: test | telemetry | conversation
payload: object
sessionId?: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — record not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/query-detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
YAML
```

## log-search

- `POST /log/search` (network / http)

Full-text search across records

### Request body

```yaml
pageNum?: number
q: string
```

### Response (status 200)

```yaml
hasMore: boolean
pageNum: number
pageSize: 100
q: string
results:
    - createdAt: string
      id: string
      kind: test | telemetry | conversation
      snippet: string
      summary: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/search \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  pageNum?: number
  q: string
YAML
```

## log-mutation

- `POST /log/mutation` (network / http)

Write a record (ai only); `op` is `add` for now.

Kinds:

- `test` — a runtime test you triggered. `payload`: `case`, `atoms`, `req`, `resp`, `result`.
- `telemetry` — a listening / observation result. `payload`: `signal` (`trace` | `metric` | `log`), `query`, `result`.
- `conversation` — written by the ai service itself; never write this kind.

`env` / `atom` optionally tag the record (`sessionId` is for `conversation` only).

### Request body

```yaml
atom?: string
env?: string
kind: test | telemetry | conversation
op: add
payload: object
sessionId?: string
```

### Response (status 200)

```yaml
createdAt: string
id: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  atom?: string
  env?: string
  kind: test | telemetry | conversation
  op: add
  payload: object
  sessionId?: string
YAML
```

## log-stream

- `POST /log/stream` (network / http)

Subscribe to record stream; frontend receives each new record in real time

### Request body

```yaml
env?: string
kinds?: string
```

### Response (stream: sse)

```yaml
done?: boolean
record:
    atom?: string
    createdAt: string
    env?: string
    id: string
    kind: test | telemetry | conversation
    summary: string
seq: number
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/stream \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  env?: string
  kinds?: string
YAML
```









## log-session-upsert

- `POST /log/session/upsert` (network / http)

Store a conversation's role (main / sub), the blueprint it was made from and its display name; an existing row keeps its createdAt and takes the new values (an empty one keeps the stored value)

### Request body

```yaml
sessionId: string  # conversation session id
kind?: main | sub  # the role; omitted or unknown reads as "sub"
blueprint?: string  # slug of the page this session drives; "" for main
title?: string  # display name shown in the tab bar
```

### Response (status 200)

```yaml
blueprint: string
createdAt: string
kind: main | sub
sessionId: string
title: string
```

### Errors

- 400 `bad_request` — sessionId missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/upsert \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionId: s_1a2b3c
kind: sub
blueprint: project
title: Project overview
YAML
```

## log-session-kind

- `POST /log/session/detail` (network / http)

Read one conversation's role, the blueprint it was made from and its display name; a session with no row is not an error to the caller, but this endpoint answers 404

### Request body

```yaml
sessionId: string  # conversation session id
```

### Response (status 200)

```yaml
blueprint: string
createdAt: string
kind: main | sub
sessionId: string
title: string
```

### Errors

- 400 `bad_request` — sessionId missing
- 404 `not_found` — session does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionId: s_1a2b3c
YAML
```

## log-current-get

- `POST /log/current/get` (network / http)

Read the workspace row — which sessions are open (in display order) and which session the shell's own chat is

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
openSessions: [string]  # s_<hex> ids, in display order; never includes main
mainSession: string  # the main conversation's session id; empty when none
updatedAt: string
```

### Errors

- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/current/get \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
YAML
```

## log-current-put

- `POST /log/current/put` (network / http)

Replace the workspace row; used to repair or reorder the open list (opening and closing a session has its own endpoints)

### Request body

```yaml
openSessions: [string]  # the whole open list, in display order
mainSession?: string
```

### Response (status 200)

```yaml
openSessions: [string]
mainSession: string
updatedAt: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/current/put \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
openSessions: [s_1a2b3c]
mainSession: s_2d3e4f
YAML
```
