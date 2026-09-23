# Corazon Engineer

[中文](README_zh.md)

An **engineering agent** on top of the coding agent. It describes a system — what it is made of, how the parts connect, and how they run in a real environment — as plain schema files, so that a change can be designed, built, verified and operated at a level above any single repository.

## What it is

Coding agents made code generation cheap, but understanding a system, constraining a change and verifying the result did not get cheap. Corazon Engineer keeps that part in a small, readable schema:

- **Atom** — one engineering unit: a service, a frontend, a database, a worker, a gateway …
- **Edge** — a connection between two atoms.
- **Contract** — the interface a connection must satisfy (the source of truth for request / response shapes).
- **Runtime** — how the system maps onto an actual environment: addresses, telemetry, tests.

The agent reads and edits this schema, and reaches running resources through the shell. The code *inside* an atom is still the coding agent's job — Corazon Engineer does not take over how a single project is implemented.

## How to use it

**Use the tool.** Download the tarball for your OS/arch from the [Releases page](https://github.com/sien75/Corazon-Engineer/releases) — for v0.1.0 on macOS arm64 that is [`corazon-v0.1.0-darwin-arm64.tar.gz`](https://github.com/sien75/Corazon-Engineer/releases/download/v0.1.0/corazon-v0.1.0-darwin-arm64.tar.gz). Then unpack, install once, and run `corazon` in the directory of the project you want it to process:

```bash
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh
corazon             # start all services in the foreground (Ctrl-C stops them)
corazon status      # per-service state for the current directory
```

Open the web address it prints (defaults: web 7500 / ai 7501 / static 7502 / log 7503; a taken port advances to the next free one) and talk to the agent. The current working directory **is** the project — it may be empty, and the agent will initialize it. All data stays in that directory's `.corazon/`.

**Develop a system with it.** A project follows the workflow in [AGENTS.md](AGENTS.md):

1. Read [`devtime/README.md`](devtime/README.md) — requirements and design records, then build and launch.
2. Define contracts, then atoms/edges, then tests, then code.
3. Verify the running system from [`runtime/README.md`](runtime/README.md) — E2E tests and resource operations.

To run this repository from source: `devtime/deploy/dev/launch.sh` (see `devtime/deploy/dev/BOOK.md`).

## Layout

| Path | What it holds |
| --- | --- |
| `corazon.yaml` | Project root marker (name, version, default runtime). |
| `atoms/` `edges/` `contracts/` | The schema: units, connections, interface contracts. |
| `workspace/` | Source code of the atoms. |
| `runtime/` | Running-system material: `testing/` (E2E tests) + `operation/` (observe resources). Shipped. |
| `devtime/` | Development-time material: `development/` + `deploy/`. Not shipped. |
| `docs/` | External-facing documentation for consumers of the build artifacts. |
| `agents/` | The AI capability spec shipped with the tool. |
| `.corazon/` | Local private data (db, logs, pids). Git-ignored. |

## Docs

- [`agents/AGENTS.md`](agents/AGENTS.md) — the AI capability spec: how an agent uses Corazon and develops a Corazon-like project.
- [`agents/schema.md`](agents/schema.md) · [`agents/contract.md`](agents/contract.md) · [`agents/enum.md`](agents/enum.md) — schema, contract and enum reference.
- [`docs/`](docs/) — service usage references.
- [`notes/`](notes/) — free-form notes.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
