<!-- Service usage reference, derived from the schema (atoms/ + contracts/). Keep in sync when the schema changes. -->

# static

Corazon Engineer static service — watches the schema file tree, serves the read-only schema views (query / query-detail / stream) to the web frontend, and validates atoms / edges / contracts; writes go through the ai shell

- runtime: go 1.22

## static-query

- `POST /static/query` (network / http)

Return full schema data for rendering the architecture graph and atom/edge details

### Request body

```yaml
env?: string
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
type: how-to | development | contract | docs | notes
```

### Response (status 200)

```yaml
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
type: how-to | development | contract | docs | notes
```

### Errors

- 400 `bad_request` — invalid type or id
- 404 `not_found` — file not found
- 500 `internal` — server error

### Example

```bash
curl -s -X POST <address>/static/query-detail \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
  id: string
  type: how-to | development | contract | docs | notes
YAML
```

## static-validate

- `POST /static/validate` (network / http)

Validate the whole schema tree — every file under `atoms/`, `edges/` and `contracts/` — and report every field-level error. Read-only: nothing is written.

Checks:

- yaml parse errors
- contract: `id` / `description` / `request` / `response` required, and `id` unique across files
- atom: `name` / `description` required; `runtime_type` / `role` are known enums; each interface's `channel` / `protocol` is valid; each referenced `contract` file exists
- edge: required fields and a unique `id`; `channel` / `protocol` valid; `from` / `to` resolve to known atoms and `from_interface` / `to_interface` to that atom's consumes / provides

`ok` is true when `errors` is empty. Each error carries `file`, `type`, an optional `field` and a `message`. Run it after any schema change, fix the reported fields, and rerun.

### Request body

```yaml
{}
```

### Response (status 200)

```yaml
errors:
    - field?: string
      file: string
      message: string
      type: atom | edge | contract
ok: boolean
```

### Errors

- 500 `internal` — server internal error

### Example

```bash
curl -s -X POST <address>/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
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

