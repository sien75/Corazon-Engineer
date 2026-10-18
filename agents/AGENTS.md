# AGENTS.md — Corazon Engineer AI Capability

This file describes how an AI Agent should **use** Corazon Engineer and how to **develop** a Corazon-like project. This English file is authoritative.

> Corazon Engineer is itself a Corazon-like project: it follows this same spec (dogfooding).

---

# Part 1 — Using Corazon Engineer

Corazon Engineer is the running system. Its schema is a plain file tree and its other internal capabilities are reached through the shell / HTTP; the tool surface, endpoints, and ports in this part belong to Corazon Engineer itself and are **not** requirements on a Corazon-like project.

## Tools

You have the standard pi built-in tools:

- `read` `grep` `find` `ls` — read files, search content, find files, list directories.
- `bash` — run shell commands. This is also how you reach the network (e.g. `curl`) and how you run external CLI programs.
- `write` `edit` — create or modify files.

Writing a log record is a `curl` call from `bash`; the actual address is in the Runtime endpoints section appended at the end of this prompt.

## External systems & tools

Do not expect a fixed tool list. When a task needs a tool — a database needs a SQL client, a Go project needs the Go toolchain, a Redis needs a Redis client — find an appropriate CLI tool yourself, install it if missing, and run it via `bash`. A recommended list with install/detect steps lives in `./tools.md`.

Listening-type tools (log/metric/trace tailers, subscribers, stream readers) must have their observations recorded as a `telemetry` log record, so listening results feed into the log as one connected stream.

External tools keep their own credentials (under their own `~/.xxx` locations); there is no project-level credential store. Logging in / authenticating a tool is the user's job — ask the user to do it. If a tool is not authenticated, say so honestly instead of probing around. Never echo credentials into responses or logs.

## Blueprint

**A Blueprint is the class; an Agent is the instance.** Every Agent was instantiated from a Blueprint: the prototype's two files are copied under that Agent's own session id, and the copy's `README.md` becomes the tail of that Agent's system prompt. From the moment of instantiation the Agent is on its own — editing the prototype does not touch Agents that already exist.

- A Blueprint is a directory `.agents/blueprints/<slug>/` holding **exactly two files and nothing else**: `README.md` (what this Agent is, and what its UI is for — this is the Agent's opening context) and `index.html` (the UI itself, which must be **self-contained**: all css / js inline, no sibling files).

## Working rules

- Verify before answering: when unsure about structure or state, query first and answer from real data. Do not fabricate from memory.
- Use tools with restraint: call one when the task genuinely needs it, but avoid redundant or speculative calls, and do not turn a single step into a burst of similar tool calls. When no tool is required, just answer. Necessary use is expected; overuse is not.
- For schema changes, edit the files directly. For other side-effectful operations, issue the call from `bash` — `curl` to an internal service, or an external CLI.
- After every real test you run, call the log service's record write with `kind: test`; record listening / observation results with `kind: telemetry`. (`conversation` records are written by the ai service itself — never log them.)
- Reply in the same language as the user (use Chinese when the user writes Chinese).
- If a capability is not wired up yet, say so honestly instead of pretending you executed it.

## Tool safety

- Schema-file edits, log writes and other side-effectful calls have real effects — use them deliberately, never speculatively.
- Do not probe unknown endpoints or run unclear operations; if the effect of a call is unclear, refuse and explain instead of guessing.
- Never echo credentials into responses or logs.

---

# Part 2 — Developing a Corazon-like project

A Corazon-like project is an engineering-architecture system. It describes atomic projects (atoms), their connections (edges), and interface contracts (contracts) through schema files, keeps implementation code in `workspace/`, and validates the whole system through system-level tests. A Corazon-like project chooses how it runs; it does not inherit Corazon Engineer's services or ports.

`development/` and `how-to/` split the material: what the development process produces, and how to build / operate the system.

- `development/` — what the development process produces: design records, iteration records, and E2E tests from the user's point of view. Its internal layout is project-specific; `development/README.md` is its overview.
- `how-to/` — how to build and operate the system: build / pack / launch / deploy material, plus connecting to and observing databases, caches, logs, and service instances. Its internal layout is project-specific; `how-to/README.md` is its overview.

So: besides the project's own `AGENTS.md`, we recommend also reading `development/README.md` — it explains what the development process produces — and `how-to/README.md` — it explains how the system is built, tested, connected to, and operated — before making changes.

## Directory conventions

- `engineer.yaml` — project root marker (project name, version).
- `atoms/` — one YAML per atom: what it is, what it provides, what it consumes.
- `edges/` — connections between atoms.
- `contracts/` — interface contracts referenced by atoms; the internal source of truth for request/response shapes.
- `workspace/` — source code of the atoms (the local checkouts). It need not live inside this repository: an atom's `repo` / `path` link the upstream and the checkout location.
- `how-to/` — how to build and operate the system: build / deploy recipes, plus connections to / observation of resources; a plain file tree whose internal layout is project-specific; `how-to/README.md` is its overview.
- `docs/` — documentation, in the ordinary sense.
- `agents/` — the project's Agent instructions: how an AI Agent should work on this project, plus the schema / contract / enum reference.
- `development/` — what the development process produces: design / iteration records and E2E tests; a plain file tree whose internal layout is project-specific; `development/README.md` is its overview.
- `.agents/` — project resources the Agent keeps as files and other Agents read: `skills/<slug>/SKILL.md` (kept skills) and `blueprints/<slug>/index.html` (pages).
- `notes/` — free-form notes.
- `.engineer/` — local private data of the project (database, run data, logs). Git-ignored. Never commit it.

## Reference

- `./schema.md` — structure of the schema (atoms / edges / contracts / development / how-to / docs / notes).
- `./contract.md` — conventions for writing contract files.
- `./enum.md` — enum values (channel / protocol / runtime_type / role).
- `./how-to.md` — writing and maintaining the project's how-to content with the user: the complete initialization path, five steps in order. Read it whole when a project has no how-to yet; read the matching step when only part of the material is written or revised. When reality drifts from the how-to, fix the how-to first — never work around it silently.

