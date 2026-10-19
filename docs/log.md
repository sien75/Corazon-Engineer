<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# log

Corazon Engineer log service — owns the project's sqlite state — records (call / observe / conversation), tabs (each tab's pane tree, name and last activity), sessions (each conversation's kind, main or sub, and the tab it belongs to) and current (which tabs are open, and the main session); exposes log query/detail/search/mutation/stream APIs plus the tab, session and current ones

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

## log-session-detail

- `POST /log/session-detail` (network / http)

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
curl -s -X POST <address>/log/session-detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  sessionId: string
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

List ai conversation sessions; one entry per sessionId, most recently active first

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
    - count: number
      createdAt: string
      lastAt: string
      preview: string
      sessionId: string
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


## log-tab-new

- `POST /log/tab/new` (network / http)

Create a tab record with its first layout, bind the sessions it shows, add it to the open list (current), and name it

### Request body

```yaml
layout: object
open?: boolean
sessionIds?: [string]
title: string
```

### Response (status 200)

```yaml
createdAt: string
lastAt: string
layout: object
tabId: string
title: string
updatedAt: string
```

### Errors

- 400 `bad_request` — layout missing, or a sessionId is already bound to another tab
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/new \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  layout: object
  open?: boolean
  sessionIds?: [string]
  title: string
YAML
```

## log-tab-mutation

- `POST /log/tab/mutation` (network / http)

Overwrite a tab's layout and name, binding any session that is now shown; the layout is stored as text and returned as-is — log does not interpret it

### Request body

```yaml
layout: object
sessionIds?: [string]
tabId: string
title: string
```

### Response (status 200)

```yaml
createdAt: string
lastAt: string
layout: object
tabId: string
title: string
updatedAt: string
```

### Errors

- 400 `bad_request` — layout missing, or a sessionId is already bound to another tab
- 404 `not_found` — tab does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  layout: object
  sessionIds?: [string]
  tabId: string
  title: string
YAML
```

## log-tab-detail

- `POST /log/tab/detail` (network / http)

Read one tab record — its pane tree and timestamps

### Request body

```yaml
tabId: string
```

### Response (status 200)

```yaml
createdAt: string
lastAt: string
layout: object
tabId: string
title: string
updatedAt: string
```

### Errors

- 400 `bad_request` — tabId missing
- 404 `not_found` — tab does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  tabId: string
YAML
```

## log-tab-list

- `POST /log/tab/list` (network / http)

List tab records, most recently active first (a message in one of the tab's sessions counts)

### Request body

```yaml
pageNum?: number
```

### Response (status 200)

```yaml
hasMore: boolean
pageNum: number
pageSize: number
tabs: [object]
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/list \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  pageNum?: number
YAML
```

## log-tab-on

- `POST /log/tab/on` (network / http)

Put existing tabs back in the open list (idempotent) — reopening a tab keeps its record and does not create a new one

### Request body

```yaml
index?: number
tabIds: [string]
```

### Response (status 200)

```yaml
openTabs: [string]
```

### Errors

- 400 `bad_request` — tabIds missing, or one of them does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/on \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  index?: number
  tabIds: [string]
YAML
```

## log-tab-off

- `POST /log/tab/off` (network / http)

Close tabs — take them out of the open list, keeping their records so they can be reopened

### Request body

```yaml
tabId?: string
tabIds: [string]
```

### Response (status 200)

```yaml
openTabs: [string]
```

### Errors

- 400 `bad_request` — tabIds missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/off \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  tabId?: string
  tabIds: [string]
YAML
```

## log-tab-delete

- `POST /log/tab/delete` (network / http)

Delete a tab record and take it out of the open list; its conversations are deleted separately (log-delete / ai-delete)

### Request body

```yaml
tabId: string
```

### Response (status 200)

```yaml
tabId: string  # echoed
```

### Errors

- 400 `bad_request` — tabId missing
- 404 `not_found` — tab does not exist
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/tab/delete \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
tabId: t_1a2b3c
YAML
```

## log-session-upsert

- `POST /log/session/upsert` (network / http)

Store a conversation's role (main / sub); an existing row keeps its createdAt and takes the new kind

### Request body

```yaml
sessionId: string  # conversation session id
kind?: main | sub  # the role; omitted or unknown reads as "sub"
```

### Response (status 200)

```yaml
sessionId: string
kind: main | sub
createdAt: string  # first write time, RFC3339
```

### Errors

- 400 `bad_request` — sessionId missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/upsert \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionId: s_1a2b3c
kind: main
YAML
```

## log-session-kind

- `POST /log/session/detail` (network / http)

Read one conversation's role and the blueprint it was made from; a session with no row is not an error to the caller, but this endpoint answers 404

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
tabId: string
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

Read the workspace row — which tabs are open (in display order) and which session the shell's own chat is

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
openTabs: [string]  # t_<hex> ids, in display order
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

Replace the workspace row; used to repair or reorder the open list (opening and closing a tab has its own endpoints)

### Request body

```yaml
openTabs: [string]  # the whole open list, in display order
mainSession?: string
```

### Response (status 200)

```yaml
openTabs: [string]
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
openTabs: [t_1a2b3c]
mainSession: s_1a2b3c
YAML
```
