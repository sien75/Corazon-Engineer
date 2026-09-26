# AGENTS.md — Corazon Engineer AI Capability

This file describes how an AI agent should **use** Corazon Engineer and how to **develop** a Corazon-like project. This English file is authoritative.

> Corazon Engineer is itself a Corazon-like project: it follows this same spec (dogfooding).

---

# Part 1 — Using Corazon Engineer

Corazon Engineer is the running system. Its schema is a plain file tree and its other internal capabilities are reached through the shell / HTTP; the tool surface, endpoints, and ports in this part belong to Corazon Engineer itself and are **not** requirements on a Corazon-like project.

## Tools

You have the standard pi built-in tools:

- `read` `grep` `find` `ls` — read files, search content, find files, list directories.
- `bash` — run shell commands. This is also how you reach the network (e.g. `curl`) and how you run external CLI programs.
- `write` `edit` — create or modify files.

Any other internal capability is reached from `bash` (e.g. `curl`). Each service's usage — endpoints, request / response shapes, examples — is documented under the installed tool's `docs/` (default `~/.engineer/apps/current/docs/`, e.g. `static.md`, `log.md`); read the corresponding file before calling a service. The internal calls you will need most are `validate` (static, after schema changes) and the record write (log, after tests) — both are covered there. The actual service addresses are in the Runtime endpoints section appended at the end of this prompt.

## External systems & tools

Do not expect a fixed tool list. When a task needs a tool — a database needs a SQL client, a Go project needs the Go toolchain, a Redis needs a Redis client — find an appropriate CLI tool yourself, install it if missing, and run it via `bash`. A recommended list with install/detect steps lives in `agents/tools.md`.

Listening-type tools (log/metric/trace tailers, subscribers, stream readers) must have their observations recorded as a `telemetry` log record (see `~/.engineer/apps/current/docs/log.md`), so listening results feed into the log as one connected stream.

External tools keep their own credentials (under their own `~/.xxx` locations); there is no project-level credential store. Logging in / authenticating a tool is the user's job — ask the user to do it. If a tool is not authenticated, say so honestly instead of probing around. Never echo credentials into responses or logs.

## Working rules

- Verify before answering: when unsure about structure or state, query first and answer from real data. Do not fabricate from memory.
- Use tools with restraint: call one when the task genuinely needs it, but avoid redundant or speculative calls, and do not turn a single step into a burst of similar tool calls. When no tool is required, just answer. Necessary use is expected; overuse is not.
- For schema changes, edit the files directly. For other side-effectful operations, issue the call from `bash` — `curl` to an internal service, or an external CLI.
- After changing the schema, call the static service's `validate` to check the whole tree (atoms / edges / contracts) — usage in `~/.engineer/apps/current/docs/static.md`.
- After every real test you run, call the log service's record write with `kind: test`; record listening / observation results with `kind: telemetry`. (`conversation` records are written by the ai service itself — never log them.) Usage in `~/.engineer/apps/current/docs/log.md`.
- Reply in the same language as the user (use Chinese when the user writes Chinese).
- If a capability is not wired up yet, say so honestly instead of pretending you executed it.

## Tool safety

- Schema-file edits, log writes and other side-effectful calls have real effects — use them deliberately, never speculatively.
- Do not probe unknown endpoints or run unclear operations; if the effect of a call is unclear, refuse and explain instead of guessing.
- Never echo credentials into responses or logs.

---

# Part 2 — Developing a Corazon-like project

A Corazon-like project is an engineering-architecture system. It describes atomic projects (atoms), their connections (edges), interface contracts (contracts), and environment mappings (runtime) through schema files, keeps implementation code in `workspace/`, and validates the whole system through system-level tests. A Corazon-like project chooses its own runtime layout; it does not inherit Corazon Engineer's services or ports.

`devtime/` and `runtime/` divide one workflow: turning a requirement into a system, then verifying and operating it.

- `devtime/` (**not shipped**) — turning a requirement into a runnable system: requirements / design records, plus build / pack / launch / deploy material. Its internal layout is project-specific; `devtime/README.md` is its overview.
- `runtime/` (**shipped**) — verifying the running system and interacting with its resources: E2E tests from the user's point of view, plus connecting to and observing databases, caches, logs, and service instances. Its internal layout is project-specific; `runtime/README.md` is its overview.

So: besides the project's own `AGENTS.md`, we recommend also reading `devtime/README.md` — it explains how development works — and `runtime/README.md` — it explains how the running system is tested, connected to, and operated — before making changes.

## Directory conventions

- `engineer.yaml` — project root marker (project name, version, default runtime).
- `atoms/` — one YAML per atom: what it is, what it provides, what it consumes.
- `edges/` — connections between atoms.
- `contracts/` — interface contracts referenced by atoms; the internal source of truth for request/response shapes.
- `workspace/` — source code of the atoms (the local checkouts). It need not live inside this repository: an atom's `repo` / `path` link the upstream and the checkout location.
- `runtime/` — the running system: E2E tests and connections to / observation of resources; a plain file tree whose internal layout is project-specific; `runtime/README.md` is its overview.
- `docs/` — documentation, in the ordinary sense.
- `agents/` — the project's agent instructions: how an AI agent should work on this project, plus the schema / contract / enum reference.
- `devtime/` — development-time material (not shipped): requirements / design records and per-environment build / launch; a plain file tree whose internal layout is project-specific; `devtime/README.md` is its overview.
- `notes/` — free-form notes.
- `.engineer/` — local private data of the project (database, run data, logs). Git-ignored. Never commit it.

## Reference

- `./schema.md` — structure of the schema (atoms / edges / runtime / contracts / docs / notes).
- `./contract.md` — conventions for writing contract files.
- `./enum.md` — enum values (channel / protocol / runtime_type / role).

## Development entry

Handle these scenarios explicitly:

1. **Project initialization** — when a project has no Corazon Engineer structure yet: create `engineer.yaml` at the root, then bootstrap the directory skeleton (`atoms/`, `contracts/`, `edges/`, `workspace/`, `runtime/`, `docs/`, `agents/`, `devtime/`). Define the first atom and its contracts before writing implementation code, and establish `devtime/README.md`, `runtime/README.md`, plus a development SOP together with the user early on.
2. **A development guide already exists** — read `devtime/README.md` and follow it. Do not reinvent the process; work within the documented SOP.
3. **The guide is missing or outdated** — when reality has drifted from `devtime/` (new directories, changed workflow, new conventions), propose concrete adjustments to the user first, and update `devtime/` only after confirmation.
