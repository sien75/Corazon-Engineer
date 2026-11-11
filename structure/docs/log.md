<!-- Service usage reference, derived from the schema (structure/atoms/ + structure/contracts/). Keep in sync when the schema changes. -->

# log

Corazon Engineer log service — owns the engineer home's sqlite state — records in three tables of one shape (conversation, tests, telemetries; the payload of a record is kept as written), projects (the board of folders the program works on — path, name, and whether it is still on the board, since removal is soft), and sessions (each conversation's kind, main or sub, the project it belongs to, the blueprint it drives, its display name, and its place in the workspace — `open_index` for the tab bar, `is_main` for the shell's own chat, both -1 / 0 when it has neither); a tab is not stored: it is one open session, so the workspace is derived from the session rows and there is no current table; the home is the program's own data directory, not a project — the program runs anywhere and the folders it serves are rows in projects; every route is named by what it is about — log-session-*, log-project-*, log-test-*, log-telemetry-* — except log-search and log-stream, which span every kind

- runtime: go 1.22

## log-test-query

- `POST /log/test/query` (network / http)

List test records, newest first — one page without payloads. The kind is the endpoint's: a body cannot ask for a telemetry row here

### Request body

```yaml
atom?: string
end?: string
env?: string
pageNum?: number
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
      kind: test
      summary: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/test/query \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
env: dev
pageNum: 1
YAML
```

## log-telemetry-query

- `POST /log/telemetry/query` (network / http)

List telemetry records, newest first — the same shape as log-test-query, over the observations table

### Request body

```yaml
atom?: string
end?: string
env?: string
pageNum?: number
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
      kind: telemetry
      summary: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/telemetry/query \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
atom: web_search
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
## log-session-delete

- `POST /log/session/delete` (network / http)

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
curl -s -X POST <address>/log/session/delete \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  sessionId: string
YAML
```

## log-session-list

- `POST /log/session/list` (network / http)

List conversation sessions, most recently active first — one entry per session, including one that has not been asked anything yet (count 0)

### Request body

```yaml
pageNum?: number  # page number, 1-based, default 1
projectId?: string  # only this project's sessions; empty = every session, main included
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
      projectId: string  # the project it belongs to, "" for main
      sessionId: string
      title: string
```

### Errors

- 400 `bad_request` — bad request
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/list \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  pageNum?: number
YAML
```

## log-test-detail

- `POST /log/test/detail` (network / http)

Fetch one test record's full payload; a row of another kind is not found here, even with a valid id

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
kind: test
payload:
    atoms?: [string]
    case?: string
    req?: string
    resp?: string
    result?: string
```

### Errors

- 400 `bad_request` — id missing
- 404 `not_found` — no such test record
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/test/detail -d 'id: <record id>'
```

## log-telemetry-detail

- `POST /log/telemetry/detail` (network / http)

Fetch one telemetry record's full payload; the same shape as log-test-detail, over the observations table

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
kind: telemetry
payload:
    query?: string
    result?: string
    signal?: trace | metric | log
```

### Errors

- 400 `bad_request` — id missing
- 404 `not_found` — no such telemetry record
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/telemetry/detail -d 'id: <record id>'
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

## log-session-record-add

- `POST /log/session/record/add` (network / http)

Append one message record to a conversation session — the ai service is the only writer, and the shell replays these back as the conversation. The bucket is the endpoint's, so `kind` is never in the body

### Request body

```yaml
atom?: string
env?: string
payload: object  # seq, role, content, raw?
sessionId: string
```

### Response (status 200)

```yaml
createdAt: string
id: string
```

### Errors

- 400 `bad_request` — sessionId missing
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/record/add \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
sessionId: s_1a2b3c
payload:
  seq: 1
  role: user
  content: hello
YAML
```

## log-test-add

- `POST /log/test/add` (network / http)

Append one test record — a runtime test that was actually run, with what it asked, what came back and whether it passed. `payload`: `case`, `atoms`, `req`, `resp`, `result`

### Request body

```yaml
atom?: string
env?: string
payload: object
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
curl -s -X POST <address>/log/test/add \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
env: dev
atom: log
payload:
  case: core-log-workspace
  atoms: [log]
  req: curl /log/session/on, then /log/session/current/get
  resp: openSessions holds the id
  result: pass
YAML
```

## log-telemetry-add

- `POST /log/telemetry/add` (network / http)

Append one telemetry record — the result of a listening / observation pass. `payload`: `signal` (`trace` | `metric` | `log`), `query`, `result`

### Request body

```yaml
atom?: string
env?: string
payload: object
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
curl -s -X POST <address>/log/telemetry/add \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
atom: web_search
payload:
  signal: log
  query: last 10 minutes of the web daemon log
  result: no errors
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

Store a conversation's role (main / sub), the project it belongs to, the blueprint it was made from and its display name; an existing row keeps its createdAt and takes the new values (an empty one keeps the stored value)

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

## log-session-detail

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

## log-session-current-get

- `POST /log/session/current/get` (network / http)

Read the workspace — which sessions are open (in display order) and which session the shell's own chat is. Both are columns on the session rows (`open_index`, `is_main`), so this answers from `sessions`, not from a row of its own

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
openSessions: [string]  # s_<hex> ids, in display order; never includes main
mainSession: string  # the main conversation's session id; empty when none
updatedAt: string  # the latest workspace change any session took part in, RFC3339
```

### Errors

- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/log/session/current/get \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
YAML
```

## log-session-current-put

- `POST /log/session/current/put` (network / http)

Replace the workspace: used to repair or reorder the open list and to point main at a session (opening and closing a session has its own endpoints). An id with no session row is ignored — there would be nothing to draw

### Request body

```yaml
openSessions: [string]  # the whole open list, in display order
mainSession?: string  # the main conversation's session id
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
curl -s -X POST <address>/log/session/current/put \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
openSessions: [s_1a2b3c]
mainSession: s_2d3e4f
YAML
```

## log-project-list

- `POST /log/project/list` (network / http)

The project board — every folder the user added in Engineer, in the order it was added; a project that was removed is not listed (its row and its conversations stay in the database)

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
projects:
    - projectId: string  # p_<12 hex>; the id every other service resolves a project folder by
      path: string  # absolute folder path on this machine
      name: string  # display name (engineer.yaml `project:`, else the folder name)
      createdAt: string
      updatedAt: string
```

### Example

```bash
curl -s -X POST <address>/log/project/list -d '{}'
```

## log-project-get

- `POST /log/project/get` (network / http)

Read one project by id, removed or not — static, ai and web turn a projectId into the folder they serve / run in

### Request body

```yaml
projectId: string  # p_<12 hex>
```

### Response (status 200)

```yaml
projectId: string
path: string
name: string
createdAt: string
updatedAt: string
removedAt?: string  # set when the project is off the board
```

### Errors

- 400 `bad_request` — projectId missing
- 404 `not_found` — no such project
- 500 `internal` — server internal error

## log-project-add

- `POST /log/project/add` (network / http)

Put a folder on the project board. The store does not look at the filesystem — web checks that the path really is an engineer project first. A path already on record keeps its projectId

### Request body

```yaml
path: string  # absolute folder path; a relative one is refused
name?: string  # display name; "" keeps the stored one
```

### Response (status 200)

```yaml
projectId: string
path: string
name: string
createdAt: string
updatedAt: string
```

### Errors

- 400 `bad_request` — path missing or not absolute
- 500 `internal` — server internal error

## log-project-remove

- `POST /log/project/remove` (network / http)

Take a project off the board (soft: the row, its sessions and the folder all stay). Re-adding the same path clears removedAt

### Request body

```yaml
projectId: string  # p_<12 hex>
```

### Response (status 200)

```yaml
projectId: string
path: string
name: string
removedAt: string
```

### Errors

- 400 `bad_request` — projectId missing
- 404 `not_found` — no such project
- 500 `internal` — server internal error

## log-project-visible

- `POST /log/project/visible` (network / http)

Show or hide one project's group in the titlebar. Hiding changes nothing about the project — it stays on the board, its sessions stay open, and showing it again brings back exactly the tabs it had

### Request body

```yaml
projectId: string  # p_<12 hex>
visible: boolean
```

### Response (status 200)

```yaml
projectId: string
path: string
name: string
createdAt: string
updatedAt: string
visible: boolean
```

### Errors

- 400 `bad_request` — visible missing
- 404 `not_found` — no such project
- 500 `internal` — server internal error
