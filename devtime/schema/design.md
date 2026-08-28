# Schema Design

## Overall Structure

The schema consists of **static structure** and **scenario**:

```
Static structure (atom & edge) — define the system structure
├── Atom layer      atoms/       atomic project
│   └── Contract    contracts/   interface contract
├── Edge layer      edges/       connection definition
├── Docs            docs/        reference docs (cites contract)
│   └── Contract    contracts/   interface contract
└── Notes           notes/       annotations

Scenario — fill in concrete content
├── Runtime         runtime/     runtime environment mapping
│   └── Test        tests/       test case (cites contract)
│       └── Contract contracts/  interface contract
└── Devtime         devtime/     dev-time records
    └── Contract    contracts/   interface contract
```

Loading strategy: `atoms` and `edges` are loaded in full (the schema query returns their complete content — needed to draw the graph). `runtime`, `contracts`, `tests`, `devtime`, `docs`, and `notes` are loaded on demand — the query returns only paths/entries, content fetched when needed.

---

## File Organization

A root `corazon.yaml` holds project-level metadata only. `atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` are discovered by directory convention; `contracts/` and `tests/` are content directories. `include`/`exclude` appear only when deviating. Entries whose name starts with `.` are ignored everywhere — never parsed as content — so dot-directories are free for fixtures, scratch data, and tooling (e.g. `tests/.playground/`).

```yaml
# corazon.yaml — root meta only, does NOT enumerate data files
project: Corazon
version: 1.0
default_runtime: dev
# optional: only when deviating from convention
include:
  - ../shared-atoms/billing-service.yaml   # pull in an atom from outside
exclude:
  - atoms/experimental-service.yaml         # skip a file
```

```
corazon/
├── corazon.yaml               # Root meta only (project, version, default_runtime, include/exclude)
├── atoms/                     # *.yaml → atom
│   ├── user-service.yaml
│   ├── notification-service.yaml
│   └── ...
├── edges/                     # *.yaml → edge
│   ├── user-to-notification.yaml
│   └── ...
├── runtime/                   # *.yaml → runtime env (filename = env name)
│   ├── dev.yaml
│   ├── staging.yaml
│   └── prod.yaml
├── devtime/                   # *.md → dev-time record (meetings / ADR / changelog)
├── contracts/                 # content files (interface contract yaml)
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
│   └── ...
├── tests/                     # content files (test case markdown)
│   ├── user-registration-flow.yaml
│   ├── user-service-api.yaml
│   └── ...
├── docs/                      # *.md → reference doc (cites contracts)
├── notes/                     # *.md → annotation (marker + thread, anchored to entity)
└── workspace/                 # Local code repositories
```

---

## Atom Layer

Describes a minimal independent project/service/repository, under `atoms/`. Format:

```yaml
atoms:
  - name: user-service
    description: User management and authentication service
    repo: git@github.com:org/user-service.git
    path: ./workspace/user-service
    runtime_type: go
    runtime_version: "1.22"
    role: service

    interfaces:
      provides:
        - id: create-user-api
          channel: network
          protocol: http
          contract: ./contracts/create-user-api.yaml
          extend:
            path: /api/v1/users
            method: POST
        - id: redis-sub
          channel: network
          protocol: redis
          extend:
            command: SUBSCRIBE
            topic: session:expired

      consumes:
        - id: user-created-event
          channel: network
          protocol: kafka
          contract: ./contracts/user-created-event.yaml
          extend:
            topic: user.created
        - id: postgres-client
          channel: network
          protocol: pgwire
          contract: ./contracts/postgres-client.yaml
        - id: redis-client
          channel: network
          protocol: redis
          contract: ./contracts/redis-client.yaml
```

- `interfaces.provides` / `interfaces.consumes` declare the atom's interfaces by role: `provides` = capabilities this atom exposes (others call this atom), `consumes` = capabilities this atom depends on (this atom calls others)
- `role` is the atom's role in the architecture (service | database | cache | queue | storage | gateway | scheduler | worker | proxy), see devtime/schema/enums.md
- Common interface fields: `id` / `channel` / `protocol` / `contract` (pointing to a contract file under `contracts/`)
- Protocol-specific fields go under `extend` (free-form object; shape varies by protocol — http uses `path/method`, redis uses `command/topic`, kafka uses `topic`, etc.). Bind addresses/ports belong to the Runtime layer's `endpoints.address`, not to the atom

---

## Edge Layer

Defines how atoms connect, under `edges/`. Format:

```yaml
edges:
  - id: user-to-notification
    from: user-service
    from_interface: user-created-event
    to: notification-service
    to_interface: send-notification-api
    channel: network
    protocol: http
    description: Send welcome notification after user registration
```

---

## Runtime Layer

Maps the schema to a concrete runtime environment. Under `runtime/`, **filename = env name** (`dev.yaml` → env `dev`). Each env has four blocks: `description` (environment description), `endpoints` (how each atom is reached — keyed per atom, fields depend on its channel), `telemetry` (monitoring observation for logs/metrics/traces), and `tests` (system-level tests bound to this environment). How an atom is launched is the atom's own concern and is not part of the architecture schema.

```yaml
runtime:
  dev:
    description: Local development environment
    endpoints:
      user-service:
        channel: network
        address: http://localhost:8080
      notification-service:
        channel: network
        address: http://localhost:9090
      mcp-server:
        channel: stdio
        in: /tmp/corazon.mcp.in
        out: /tmp/corazon.mcp.out
      local-daemon:
        channel: ipc
        address: /var/run/corazon.sock
    telemetry:
      user-service:
        backend: otel
        endpoint: http://localhost:4317
    tests:
      - id: user-registration-flow
        description: E2E — welcome notification after user registration
        atoms: [user-service, notification-service]
        edges: [user-to-notification]
        case: ./tests/user-registration-flow.yaml
      - id: user-service-api
        description: user-service HTTP contract conformance
        atoms: [user-service]
        case: ./tests/user-service-api.yaml

  staging:
    description: Staging environment
    endpoints:
      user-service:
        channel: network
        address: https://user.staging.corazon.com
      notification-service:
        channel: network
        address: https://notify.staging.corazon.com

  prod:
    description: Production environment
    endpoints:
      user-service:
        channel: network
        address: https://user.api.corazon.com
      notification-service:
        channel: network
        address: https://notify.api.corazon.com
```

**endpoints field shape per channel**

| channel | field | meaning |
|---|---|---|
| `network` | `address` | the address to dial, e.g. `http://`, `grpc://`, `redis://...` |
| `stdio` | `in` + `out` | named pipes (the atom's own launch is out of scope for the schema) |
| `ipc` | `address` | a local inter-process resource, e.g. a unix socket path |

**telemetry** — the monitoring (read/listen) side of the runtime: where to observe logs/metrics/traces. Keyed per atom for now (granularity to be decided). A single otel endpoint carries all three signals — no per-signal split.

**tests** — each runtime env may carry a `tests:` block of system-level tests bound to that environment. A test scopes itself to a subset of atoms/edges (by id) and points its actual definition at a `case` file under `tests/`. Atoms declare interfaces; tests exercise them. `dev` may run the full suite while `prod` runs none or read-only checks.

---

## Contract Files — Interface Contracts

Describe an interface's input/output/errors, under `contracts/`. Referenced by atom `interfaces` and tests. Format:

```yaml
id: ai-ask
description: Ask AI; prompt determines what AI does

request:
  body:
    id: string  # session id
    prompt: string  # what AI should do

response:
  status: 200
  body:
    sessionId: string

errors:
  - status: 400
    code: bad_request
    description: prompt missing or empty
  - status: 404
    code: not_found
    description: session not found
  - status: 500
    code: internal
    description: server error
```

- `request` / `response` body is the real data structure; `stream: sse` marks streaming interfaces where body is the schema of each event
- `errors` lists the errors this interface may return (status / code / description)
- Field-writing conventions (types, enums, optional, arrays, comments) live in `devtime/iteration-2608/contract 规范.md`

---

## Test Files — Test Cases

Describe system-level tests, under `tests/`, referenced by runtime env `tests.case`. Plain markdown files, no format convention.

Tests never run against the real project tree. They run in `.playground/` — a blank or mock corazon project at the repo root (git-ignored), scaffolded by the test setup (e.g. from fixtures like `tests/.playground/`), never copied from the real project. The backend under test is started with its project root pointed at `.playground/`, so tests are fully decoupled from real schema content and add/update/remove mutations only touch the mock. `.playground/` can be deleted and re-scaffolded at any time.

## Devtime Files — Dev-Time Records

Record meetings, ADRs, changelogs, etc., under `devtime/`. Plain markdown files, no format convention.

## Docs Files — Reference Docs

User-facing reference docs, under `docs/`. Plain markdown files, no format convention.

## Notes Files — Annotations

Markers and discussions targeting an entity, under `notes/`. Plain markdown files, no format convention.
