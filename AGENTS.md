# AGENTS.md — Corazon Engineer

This repository is **Corazon Engineer** itself. This file tells an AI agent how to **develop this repository**.

> The AI capability spec that ships with the tool is `agents/AGENTS.md` (Chinese mirror in `agents/zh/`) — a different audience: it describes how to *use* Corazon and how to develop a Corazon-like project.

## Development workflow (SOP)

Every task must go through the four phases below, in order. No phase may be skipped.

### Phase 1 — Clarify requirements

Always talk to the user first; never write code from assumptions.

- Read the relevant schema / code to build context first, then talk to the user.
- Keep asking until goal, scope, and acceptance criteria are unambiguous.
- Confirm what is explicitly **out of scope**.
- Summarize the confirmed requirements to the user before starting. If confidence is below 80%, keep asking — do not guess.

**Done when:** the user confirms the requirements summary.

### Phase 2 — Develop & test (iterate)

Develop in small steps and verify each step immediately. Development and testing are one loop, not two ordered steps.

1. Make the smallest meaningful change.
2. Run / test it immediately (unit test, manual run, or schema query — whichever fits).
3. On failure, read the error, fix, and retest until it passes.
4. If the same failure occurs **3 times in a row**, stop immediately. Do not blind-retry a 4th time — report the error, what you already tried, and the suspected blocker, with alternative ideas.
5. Keep changes minimal: no drive-by refactors, nothing beyond the requirement.

**Done when:** the relevant tests / checks pass and the change matches the confirmed requirements.

### Phase 3 — Human review gate (mandatory)

This is a hard gate. The AI must stop here and wait for explicit human approval.

- Summarize the change (what changed + test result); do not write an essay.
- Point the user to the content area to inspect the actual change (diff / changed files).
- Do not enter the deploy phase before explicit approval.
- If the user asks for changes, go back to Phase 2 with the feedback.

**Done when:** the human explicitly approves (e.g. "LGTM", "okay", "ship it").

### Phase 4 — Deploy

For Corazon, deploying means **pushing code** (commit + push to the repo).

- Only after Phase 3 approval.
- Use a concise commit message, then push.
- Report the result (commit hash / what was pushed).
- If push fails, report the error — no force-push or history rewriting without explicit permission.

**Done when:** the code is pushed and the user has been told.

## Repository layout

- `devtime/` — development-time material (not shipped): `architecture/` (requirements & design, iteration records), `coding/` (code + unit tests), `deploy/` (build / pack / launch / deploy).
- `runtime/` — running-system material (shipped): `testing/` (E2E tests), `operation/` (connect to / observe resources).
- `agents/` — the AI capability spec shipped with the tool (`agents/AGENTS.md`, Chinese in `agents/zh/`), plus the schema / contract / enum reference.
- `atoms/` `edges/` `contracts/` `docs/` `notes/` `workspace/` — this project's schema and code.
</content>
