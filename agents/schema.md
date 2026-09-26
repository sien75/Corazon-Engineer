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

How to work on it
├── Development    development/  development material (plans + iterations + testing) — prose
└── How-to         how-to/       how to build & operate (deploy + operation)         — prose
```

`workspace/` holds the atoms' implementation code. An atom links its upstream repo via `repo` and its local checkout via `path`; the code may be checked out under `workspace/` (the default) or anywhere `path` points — it does not have to live inside this repository.

---

## File Organization

A root `engineer.yaml` holds project-level metadata only. `atoms/` / `edges/` / `development/` / `how-to/` / `docs/` / `notes/` are discovered by directory convention; `contracts/` is a content directory. Discovery of content entities under `atoms/`, `edges/` and `contracts/` is **recursive** — any `*.yaml` at any depth is picked up. `include`/`exclude` appear only when deviating. Entries whose name starts with `.` are **special entries**: they do not participate in the directory's sibling structure (they are not content entities).

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
├── development/               # plain file tree: development material (layout defined by development/README.md)
│   ├── README.md              # the development tree's own conventions — read first
│   ├── plans/                 # design docs, one dir per iteration number
│   ├── iterations/            # the confirmed plan per iteration
│   └── testing/               # E2E tests
└── how-to/                    # plain file tree: deploy + operation (layout defined by how-to/README.md)
    ├── README.md              # the how-to tree's own conventions — read first
    ├── deploy/                # build / pack / launch / deploy
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
- Protocol-specific fields go under `extend` (free-form object; shape varies by protocol — http uses `path/method`, redis uses `command/topic`, kafka uses `topic`, etc.). Bind addresses/ports belong to the runtime environment (`endpoints.address`), not to the atom

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

## Development Files — Development Material

Development material, under `development/`. A plain file tree (like `how-to/`); its layout is defined by `development/README.md`. Three modules:

- **`plans/`** — requirements analysis and architecture design, one dir per iteration number.
- **`iterations/`** — the plan confirmed at each iteration.
- **`testing/`** — E2E tests from the real user's point of view, exercising the business system through its UI / API.

System-level tests live under `testing/`, with `desp.yaml` (metadata) and `TEST.md` (the case); they must not run against the real project tree.

Mostly plain markdown, no format convention; it may also contain script files. Read the README and follow the project's stated conventions.

---

## How-to Files — Deploy & Operation

How to build and operate the system, under `how-to/`. A plain file tree (like `development/`); its layout is defined by `how-to/README.md`. Two modules:

- **`deploy/`** — build, pack, launch, and deploy a project, per environment; ensures the project starts, but does not verify business behavior.
- **`operation/`** — connecting to and observing resources (databases, caches, logs, service instances), including telemetry: live monitoring, historical log queries, and active operations.

Mostly plain markdown, no format convention; it may also contain script files. Read the README and follow the project's stated conventions.
