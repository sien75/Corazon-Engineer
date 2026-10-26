<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# static

Corazon Engineer static service — watches the schema file tree of every project on the board and serves the read-only views (query / query-detail / stream) to the web frontend; it does not validate the tree — a malformed atom or a dangling edge is not its business; it has no root of its own any more: each request names a projectId, which it resolves to a folder through log (remembered for a few seconds), so the program is not tied to the folder it was started in; the views cover every file type — atoms, edges, contracts, how-to, development, docs, notes, and the dot-directory resources skills (.agents/skills) and blueprints (.agents/blueprints); writes go through the ai shell

- runtime: go 1.22

## static-query

- `POST /static/query` (network / http)

Return full schema data for rendering the architecture graph and atom/edge details

### Request body

```yaml
projectId: string  # p_<12 hex> — whose tree to read
```

### Response (status 200)

```yaml
atoms:
    - description: string
      interfaces:
        consumes:
            - channel: network | stdio | ipc
              contract?: string
              extend?: object
              id: string
              protocol: string
        provides:
            - channel: network | stdio | ipc
              contract?: string
              extend?: object
              id: string
              protocol: string
      name: string
      path?: string
      repo?: string
      role?: string
      runtime_type: string
      runtime_version?: string
blueprints:
    - string
contracts:
    - string
development:
    - string
docs:
    - string
edges:
    - channel: network | stdio | ipc
      description: string
      from: string
      from_interface: string
      id: string
      protocol: string
      to: string
      to_interface: string
how-to:
    - string
notes:
    - string
skills:
    - string
    - string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/static/query \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  env?: string
YAML
```

## static-query-detail

- `POST /static/query-detail` (network / http)

Fetch content of a single leaf file

### Request body

```yaml
id: string
type: how-to | development | contract | docs | notes | skill | blueprint
```

### Response (status 200)

```yaml
blueprint?: string
contract?:
    description: string
    error: object
    id: string
    request: object
    response: object
development?: string
docs?: string
how-to?: string
id: string
notes?: string
skill?: string
type: how-to | development | contract | docs | notes | skill | blueprint
```

### Errors

- 400 `bad_request` — invalid type or id; also when the (cleaned) id is not a file of the requested type, e.g. `type: blueprint` with a path that traverses into `.agents/skills`
- 404 `not_found` — file not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
  type: how-to | development | contract | docs | notes | skill | blueprint
YAML
```

## static-stream

- `POST /static/stream` (network / http)

Long-lived connection pushing schema-change events; the service watches the schema file tree and emits an event whenever a content file is added, updated or removed. Execution events (call / test / development) reserved.

### Request body

```yaml
edges?: string
env: string
kinds?: string
```

### Response (stream: sse)

```yaml
env: string
kind: schema | how-to | test | development
payload:
    atom?:
        description: string
        interfaces:
            consumes:
                - channel: network | stdio | ipc
                  contract?: string
                  extend?: object
                  id: string
                  protocol: string
            provides:
                - channel: network | stdio | ipc
                  contract?: string
                  extend?: object
                  id: string
                  protocol: string
        name: string
        path?: string
        repo?: string
        role?: string
        runtime_type: string
        runtime_version?: string
    contract?:
        description: string
        error: object
        id: string
        request: object
        response: object
    development?: string
    docs?: string
    edge?:
        channel: network | stdio | ipc
        description: string
        from: string
        from_interface: string
        id: string
        protocol: string
        to: string
        to_interface: string
    file: string
    how-to?: string
    id: string
    notes?: string
    op: add | update | remove
    type: atom | edge | how-to | development | contract | docs | notes
seq: number
ts: string
```

### Errors

- 400 `bad_request` — bad request
- 404 `not_found` — env not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/static/stream \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  edges?: string
  env: string
  kinds?: string
YAML
```

