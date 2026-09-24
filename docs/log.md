<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# log

Corazon Engineer log service — owns sqlite records (call / observe / conversation); exposes log query/detail/search/mutation/stream APIs

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

Delete all conversation records belonging to a session

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

