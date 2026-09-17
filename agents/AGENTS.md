# AGENTS.md — Corazon AI Capability

This file describes how an AI agent should **use** Corazon and how to **develop** a Corazon-like project. This English file is authoritative.

> Corazon is itself a Corazon-like project: it follows this same spec (dogfooding).

---

# Part 1 — Using Corazon

Corazon is the running system. Its internal capabilities are plain HTTP interfaces; the tool surface, endpoints, and ports in this part belong to Corazon itself and are **not** requirements on a Corazon-like project.

## Tools

You have two tools:

- `http` — make an HTTP request (method / url / headers / body), used to call Corazon's internal services and other internal endpoints. Network-only: no filesystem or shell access.
- `cli` — run a local CLI program with an argument array. No shell, so pipes/redirects/chaining are unavailable; the first use per program requires user approval.

There are no dedicated per-endpoint tools.

## Internal HTTP APIs (POST; actual addresses are in the Runtime endpoints section appended at the end of this prompt)

**static service — schema**, YAML on the wire (`application/yaml`):

- `/static/query` — fetch the full architecture (atoms / edges / runtime entries + all directory listings)
- `/static/query-detail` — fetch a single file's content (runtime / contract / devtime / docs / notes)
- `/static/search` — global search over any schema content
- `/static/mutation` — add / update / remove schema entries (side effects)
- `/static/stream` — SSE subscription for schema-change events (long-lived; do NOT run a bare blocking curl)

**log service — records**, YAML on the wire:

- `/log/query` — query records (test / telemetry / conversation)
- `/log/query-detail` — fetch a single record's detail
- `/log/search` — full-text search over records
- `/log/mutation` — write a record (side effects). After every test you trigger, record it here; listening/telemetry results also land here as a stream (see External systems & tools). (Conversation records are written by the ai service itself — never log those.)

Request / response shapes are defined by contract files under `contracts/` (e.g. `contracts/static-query.yaml`). Before calling an unfamiliar endpoint, read its contract live via `/static/query-detail` with `type=contract`.

## External systems & tools

Do not expect a fixed tool list. When a task needs a tool — a database needs a SQL client, a Go project needs the Go toolchain, a Redis needs a Redis client — find an appropriate CLI tool yourself and connect via the `cli` tool.

Listening-type tools (log/metric/trace tailers, subscribers, stream readers) must have their observations recorded via `/log/mutation`, so listening results feed into the log as one connected stream.

Connection credentials for external systems live in the project's own `.corazon/credentials/` (local private data, git-ignored) — they are yours to read. When a credential is needed, ask the user for it; the user provides it. If a credential is missing, say so honestly instead of probing around. Never echo credentials into responses or logs.

## Working rules

- Verify before answering: when unsure about structure or state, query first and answer from real data. Do not fabricate from memory.
- For schema changes or any side-effectful operation, issue the call via `http` / `cli` directly. `http` calls never need approval. For `cli` calls, the first use of each program shows an approval card to the user — if denied, explain and stop; once approved, that program runs freely.
- After every real test you run, write a log record via `/log/mutation`.
- Reply in the same language as the user (use Chinese when the user writes Chinese).
- If a capability is not wired up yet, say so honestly instead of pretending you executed it.

## Tool safety

- The `http` tool is for Corazon's internal services and internal endpoints only — never use it to reach arbitrary external systems.
- Network access goes through the `http` tool only; local programs through the `cli` tool (first use per program requires user approval).
- `/static/mutation` and `/log/mutation` have side effects — use them deliberately, never speculatively.
- Do not probe unknown endpoints or run unclear operations; if the effect of a call is unclear, refuse and explain instead of guessing.
- Never echo credentials into responses or logs.

---

# Part 2 — Developing a Corazon-like project

A Corazon-like project is an engineering-architecture system. It describes atomic projects (atoms), their connections (edges), interface contracts (contracts), and environment mappings (runtime) through schema files, keeps implementation code in `workspace/`, and validates the whole system through system-level tests. A Corazon-like project chooses its own runtime layout; it does not inherit Corazon's services or ports.

To develop a Corazon-like project, read `devtime/README.md` first — it explains how development works.

## Directory conventions

- `corazon.yaml` — project root marker (project name, version, default runtime).
- `atoms/` — one YAML per atom: what it is, what it provides, what it consumes.
- `edges/` — connections between atoms.
- `contracts/` — interface contracts referenced by atoms; the internal source of truth for request/response shapes.
- `workspace/` — source code of the atoms.
- `runtime/` — how to run each environment and which tests apply: a plain file tree whose layout is defined by `runtime/README.md` (read it first).
- `docs/` — external-facing documentation. It must explain how to consume the `workspace/` build artifacts, including the public view of the relevant contracts — a consumer should not need the internal source tree to use the artifacts.
- `agents/` — this AI capability description, plus the schema, contract, and enum reference.
- `devtime/` — development-time material (methodology, SOPs, iteration records).
- `notes/` — free-form notes.
- `.corazon/` — local private data of the project (database, `credentials/`). Git-ignored. Never commit it.

## Reference

- `./schema.md` — structure of the schema (atoms / edges / runtime / contracts / docs / notes).
- `./contract.md` — conventions for writing contract files.
- `./enum.md` — enum values (channel / protocol / runtime_type / role).

## Development entry

Handle these scenarios explicitly:

1. **Project initialization** — when a project has no Corazon structure yet: create `corazon.yaml` at the root, then bootstrap the directory skeleton (`atoms/`, `contracts/`, `edges/`, `workspace/`, `runtime/`, `docs/`, `agents/`, `devtime/`). Define the first atom and its contracts before writing implementation code, and establish `devtime/README.md`, `runtime/README.md`, plus a development SOP together with the user early on.
2. **A development guide already exists** — read `devtime/README.md` and follow it. Do not reinvent the process; work within the documented SOP.
3. **The guide is missing or outdated** — when reality has drifted from `devtime/` (new directories, changed workflow, new conventions), propose concrete adjustments to the user first, and update `devtime/` only after confirmation.
