# AGENTS.md — Corazon Engineer

**Corazon Engineer** is Corazon — an engineering agent above the coding agent. Developing this project with Corazon is dogfooding.

> The spec shipped with the tool is `agents/AGENTS.md` (Chinese in `agents/zh/`): how to use Corazon Engineer to develop a Corazon-like project.

## Development workflow (SOP)

Every task falls into one of three types; follow its phases in order, none skipped.

General rules:

- Clarify first: never code from assumptions — confirm goal, scope, and acceptance criteria (and what is **out of scope**) before acting. Below 80% confidence, keep asking.
- Keep changes minimal and limited to the current phase; no drive-by refactors.
- Test each step immediately. If the same failure repeats **3 times in a row**, stop and report the error, what you tried, and the suspected blocker, with alternatives.

### Type 1 — Requirement development

**Phase 1 — Design.** Scope: `devtime/development/` and `notes/`. Turn the requirement into design records.

**Phase 2 — Contracts, tests, code.** Scope: `contracts/`, `atoms/` `edges/`, `runtime/testing/`, `workspace/` (and `agents/` if the change involves it). Order matters: define the **contracts** first, then the static relations (`atoms/` `edges/`), then the tests (`runtime/testing/`), and only then develop the code (`workspace/`).

**Phase 3 — Build, run, test.** Repack and launch per `devtime/deploy/dev/BOOK.md`, then run the test cases. Pass → continue; fail → return to Phase 2 with the error.

**Phase 4 — Human review & commit.** Stop and wait for human review. Rejected → return to Phase 2. Approved → `git add` & `git commit` (do **not** push).

### Type 2 — Build & release

**Phase 1 — Follow the book.** Read `devtime/deploy/prod/BOOK.md` and act on its instructions to pack and release. (Currently packing only — just follow the BOOK.)

### Type 3 — Change how-to files

**Phase 1 — Edit as instructed.** Modify the files the user points to. If both an English file and its `_zh` mirror exist, update both. `devtime/development/` is always Chinese; elsewhere English takes priority. Scope includes `devtime/deploy/`, `runtime/operation/`, `devtime/README.md`, `runtime/README.md`, `AGENTS.md`, `corazon.yaml`, and similar.

## Repository layout

- `devtime/` — development-time, not shipped: `development/` (requirements & design records, per iteration), `deploy/` (build / pack / launch / deploy, per environment).
- `runtime/` — running-system, shipped: `testing/` (E2E tests), `operation/` (connect to / observe resources).
- `agents/` — shipped AI capability spec (`agents/AGENTS.md`, Chinese in `agents/zh/`) plus schema / contract / enum reference.
- `atoms/` `edges/` `contracts/` `docs/` `notes/` `workspace/` — this project's schema and code.
