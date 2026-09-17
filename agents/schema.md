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
├── Runtime         runtime/     how to run + which tests (plain file tree; see runtime/README.md)
└── Devtime         devtime/     dev-time records
    └── Contract    contracts/   interface contract
```

---

## File Organization

A root `corazon.yaml` holds project-level metadata only. `atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` are discovered by directory convention; `contracts/` is a content directory. `include`/`exclude` appear only when deviating. Entries whose name starts with `.` are ignored everywhere — never parsed as content.

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
project/
├── corazon.yaml               # Root meta only (project, version, default_runtime, include/exclude)
├── atoms/                     # *.yaml → atom
│   ├── user-service.yaml
│   ├── notification-service.yaml
│   └── ...
├── edges/                     # *.yaml → edge
│   ├── user-to-notification.yaml
│   └── ...
├── runtime/                   # plain file tree: how to run + which tests (layout defined by runtime/README.md)
│   ├── README.md              # the runtime tree's own conventions — read first
│   ├── cookbooks/             # one dir per env (env name = dir name)
│   │   └── dev/               # BOOK.md (launch/connect/observe) + launch.sh (launcher)
│   └── tests/                 # system tests per env
│       └── dev/               # case-xxx/ → desp.yaml (metadata) + TEST.md (the case)
├── devtime/                   # *.md → dev-time record (meetings / ADR / changelog)
├── contracts/                 # content files (interface contract yaml)
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
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

## Runtime Layer

Maps the schema to concrete runtime environments. `runtime/` is a **plain file tree** (like `devtime/`), not a structured YAML schema — its layout and meaning are defined by `runtime/README.md`, which is the contract for the tree. The consumers are the web frontend (which serves files raw, without interpreting structure) and the AI (which reads the README first, then the files it needs, to launch / connect / observe / test an environment). Structured values, when needed, live in small YAML files inside the tree (e.g. `desp.yaml`); the conventions are the project's own, documented in `runtime/README.md`. An env is started by its own `launch.sh` (a real script, not generated prose), which chooses the ports and passes the addresses to the atoms at launch.

A typical layout (one env per directory):

```
runtime/
├── README.md          # the runtime tree's own conventions — read first
├── cookbooks/[env]/   # env name = directory name
│   ├── BOOK.md        # how to launch / connect / observe this env (prose)
│   └── launch.sh      # the env's launcher (owns ports, starts the atoms)
└── tests/[env]/       # system tests bound to this env
    └── case-xxx/
        ├── desp.yaml  # test metadata: atoms (required), env (optional)
        └── TEST.md    # the test case itself
```

Because the tree is prose-first, there is no enforced schema here: ports, endpoints, and telemetry are described in the cookbook and realized by the env's `launch.sh`, and the AI is expected to read the README and follow the project's stated conventions rather than rely on a fixed shape.

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

## Test Files — Test Cases

System-level tests live inside the runtime tree (see the Runtime layer): `runtime/tests/[env]/case-xxx/`, with `desp.yaml` (metadata) and `TEST.md` (the case). The case file itself is plain markdown with no format convention.

Tests never run against the real project tree. They run in `.corazon/.playground/` — `.corazon/` is the git-ignored private directory at the project root, and `.corazon/.playground/` is a blank or mock corazon project under it, scaffolded by the test setup (e.g. from fixtures like `runtime/tests/dev/.playground/`). The backend under test is started with its project root pointed at `.corazon/.playground/`, so add/update/remove mutations only touch the mock.

## Devtime Files — Dev-Time Records

Record meetings, ADRs, changelogs, etc., under `devtime/`. Plain markdown files, no format convention.

## Docs Files — Reference Docs

User-facing reference docs, under `docs/`. Plain markdown files, no format convention.

## Notes Files — Annotations

Markers and discussions targeting an entity, under `notes/`. Plain markdown files, no format convention.
