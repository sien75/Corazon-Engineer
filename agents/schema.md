# Schema Design

## Overall Structure

The schema consists of **what it is** and **how to do it**:

```
What it is — define the system structure
├── Atom layer      atoms/       atomic project        — yaml
├── Edge layer      edges/       connection definition  — yaml
├── Contract        contracts/   interface contract     — yaml
├── Workspace       workspace/   atom code (checkout)   — code
├── Docs            docs/        external-facing docs   — prose
└── Notes           notes/       internal annotations    — prose

How to do it — development & operation
├── Devtime         devtime/     how to develop (development + deploy) — prose
└── Runtime         runtime/     how to test & operate (testing + operation)      — prose
```

`workspace/` holds the atoms' implementation code. An atom links its upstream repo via `repo` and its local checkout via `path`; the code may be checked out under `workspace/` (the default) or anywhere `path` points — it does not have to live inside this repository.

---

## File Organization

A root `engineer.yaml` holds project-level metadata only. `atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` are discovered by directory convention; `contracts/` is a content directory. Discovery of content entities under `atoms/`, `edges/` and `contracts/` is **recursive** — any `*.yaml` at any depth is picked up. `include`/`exclude` appear only when deviating. Entries whose name starts with `.` are **special entries**: they do not participate in the directory's sibling structure (they are not content entities).

```yaml
# engineer.yaml — root meta only, does NOT enumerate data files
project: Corazon Engineer
version: 1.0
default_runtime: dev
# optional: only when deviating from convention
include:
  - ../shared-atoms/billing-service.yaml   # pull in an atom from outside
exclude:
  - atoms/experimental-service.yaml         # skip a file
```

```
project/
├── engineer.yaml               # Root meta only (project, version, default_runtime, include/exclude)
├── atoms/                     # **/*.yaml → atom (recursive)
│   ├── user-service.yaml
│   ├── notification-service.yaml
│   └── ...
├── edges/                     # **/*.yaml → edge (recursive)
│   ├── user-to-notification.yaml
│   └── ...
├── contracts/                 # content files (interface contract yaml, recursive)
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
│   └── ...
├── workspace/                 # local code repositories (checkouts)
├── docs/                      # *.md → external-facing doc
├── notes/                     # *.md → internal annotation (marker + thread, anchored to entity)
├── devtime/                   # plain file tree: dev-time material (layout defined by devtime/README.md)
│   ├── README.md              # the devtime tree's own conventions — read first
│   ├── development/           # requirements / design / iteration records before coding
│   └── deploy/                # build / pack / launch / deploy
└── runtime/                   # plain file tree: testing + operation (layout defined by runtime/README.md)
    ├── README.md              # the runtime tree's own conventions — read first
    ├── testing/               # E2E tests
    └── operation/             # connect to / observe resources (db, cache, logs, services)
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
- `role` is the atom's role in the architecture (service | database | cache | queue | storage | gateway | scheduler | worker | proxy), see ./enum.md
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
- Field-writing conventions (types, enums, optional, arrays, comments) live in `./contract.md`

---

## Docs Files — External-Facing Docs

External-facing docs, under `docs/`. Plain markdown files, no format convention.

---

## Notes Files — Internal Annotations

Internal markers and discussions targeting an entity, under `notes/`. Plain markdown files, no format convention.

---

## Devtime Files — Dev-Time Material

Everything that turns a requirement into a runnable system, under `devtime/`. A plain file tree (like `runtime/`); its layout is defined by `devtime/README.md`. Two modules:

- **`development/`** — requirements analysis, architecture design, and design work before coding, including plan docs and iteration records.
- **`deploy/`** — build, pack, launch, and deploy a project, per environment; ensures the project starts, but does not verify business behavior.

Mostly plain markdown, no format convention; it may also contain script files (e.g. deploy scripts). Read the README and follow the project's stated conventions.

---

## Runtime Layer

The running system and its resources, under `runtime/`. A plain file tree (like `devtime/`); its layout is defined by `runtime/README.md`. Two modules:

- **`testing/`** — E2E tests from the real user's point of view, exercising the business system through its UI / API.
- **`operation/`** — connecting to and observing resources (databases, caches, logs, service instances), including telemetry: live monitoring, historical log queries, and active operations.

System-level tests live under `testing/`, with `desp.yaml` (metadata) and `TEST.md` (the case); they must not run against the real project tree.

Mostly plain markdown, no format convention; it may also contain script files. Read the README and follow the project's stated conventions.
