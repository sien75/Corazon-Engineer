# AGENTS.md — Corazon Engineer

**Corazon Engineer** is an engineering agent above the coding agent. Developing this project with Corazon Engineer is dogfooding.

> The spec shipped with the tool is `agents/AGENTS.md` (Chinese in `agents/zh/`): how to use Corazon Engineer to develop a Corazon-like project.

## Development workflow (SOP)

Every task falls into one of three types of operation; follow its phases in order, none skipped.

General rules:

- Clarify first: never code from assumptions — confirm goal, scope, and acceptance criteria (and what is **out of scope**) before acting. Below 80% confidence, keep asking.
- Keep changes minimal and limited to the current phase; no drive-by refactors.
- Test each step immediately. If the same failure repeats **3 times in a row**, stop and report the error, what you tried, and the suspected blocker, with alternatives.
- Commit & push go through `my-server` (`ssh my-server`), not the local machine: locate this project's clone on `my-server` (search by repo name) → send the changes as a patch → commit & push on `my-server` → delete the local working-tree changes and pull. **Never push directly from the local machine.**

### Type 1 — Normal requirement development

**Phase 1 — Design.** Scope: `development/` and `notes/`. Turn the requirement into a design record: the AI-generated plan is written under `development/iterations/` as one markdown file named `[YYMM]-[2-digit sequence]-[short title].md`, created here and updated as the design evolves. `development/plans/<iteration-number>/` holds human discussion and raw notes only.

**Phase 2 — Contracts, tests, code.** Scope: `contracts/`, `atoms/` `edges/`, `development/testing/`, `workspace/`. Order matters: define the **contracts** first, then the static relations (`atoms/` `edges/`), then the tests (`development/testing/`), and only then develop the code (`workspace/`).

**Phase 3 — Build, run, test.** Repack and launch per `how-to/deploy/dev/BOOK.md`, then run the test cases. Pass → continue; fail → return to Phase 2 with the error.

**Phase 4 — Human review & commit.** Stop and wait for human review. Rejected → return to Phase 2. Approved → commit & push on `my-server`, then pull locally (see General rules).

### Type 2 — System changes

Change the system or its environment rather than its specified behavior: pack / release, launch and operate the base services, change data in a running resource.

**Phase 1 — Find the book.** Every such change has one: `how-to/deploy/<env>/BOOK.md` for build / pack / launch / deploy, `how-to/operation/` for connecting to, observing, and changing a resource.

**Phase 2 — Follow the book.** Act on its instructions step by step; do not improvise commands and do not skip steps. If the book no longer matches reality, stop and switch to Type 3 (fix the book) instead of working around it.

Currently only build & pack is wired: read `how-to/deploy/prod/BOOK.md` and follow it.

### Type 3 — Change How-to content

Change the instructions themselves — the content that tells a human or an agent how this project is developed and operated. Initialization is the first instance of this type, not a separate one: a project with no how-to yet simply has it still to be written, and keeping it in step with reality is the same work continued.

**Phase 1 — Edit as instructed.** Modify the files the user points to. If both an English file and its `_zh` mirror exist, update both. `development/plans/` and `development/iterations/` are always Chinese; elsewhere English takes priority. The scope is the how-to content: `how-to/` and `AGENTS.md`.

Initialization is this same type applied to a project that has no how-to yet: create the project marker `engineer.yaml`, lay down the how-to material (`how-to/`, with `how-to/README.md`, and the SOP) together with the user.

## Repository layout

- `development/` — what the development process produces: `iterations/` (the AI-generated plan per requirement, one markdown file named `[YYMM]-[2-digit sequence]-[short title].md`, created in Phase 1 and kept updated), `plans/` (human discussion / raw notes, one dir per iteration number), `testing/` (E2E tests).
- `how-to/` — how to build and operate the system: `deploy/` (build / pack / launch / deploy, per environment), `operation/` (connect to / observe resources).
- `agents/` — the shipped AI capability spec (`agents/AGENTS.md`, Chinese in `agents/zh/`) plus schema / contract / enum reference.
- `atoms/` `edges/` `contracts/` `docs/` `notes/` `workspace/` — this project's schema and code.
