# development — Development Material

> Chinese is the working language for `humanwrite/` and `development/iterations/`. This English `README.md` is the authoritative entry (its Chinese mirror is `README_zh.md`).

What the development process produces. A plain file tree; the layout below is its contract.

## Layout

- `iterations/` — the AI-generated plan per requirement: one markdown file named `[YYMM]-[2-digit sequence]-[short title].md` (e.g. `2609-01-runtime 散文化重构.md`), created in Phase 1 and kept updated as the design evolves.
- `testing/` — E2E tests, one dir per environment; each case is `desp.yaml` (metadata) + `TEST.md` (the case itself). How a case is written and run — including the port and reclaim rules that keep cases from talking to each other — is `testing/README.md`.

## Development entry

1. **Process** — the development SOP lives in the project-root `AGENTS.md`. Follow it; do not skip stages.
2. **Design records** — the AI-generated plan goes into `iterations/` as one markdown file named `[YYMM]-[2-digit sequence]-[short title].md`; the human discussion and raw notes live outside this tree, in `../humanwrite/<iteration-number>/`. Do not leave them scattered in chat.
3. **Deploy** — build / launch local services per `../how-to/deploy/dev/BOOK.md` (log :8503 → static :8502 → ai :8501 → web :8500).
4. **Verification** — system cases live in `testing/dev/` (`case-core-*/TEST.md`); read `testing/README.md` first — cases own a port block and reclaim it before starting.
5. **Structure** — before changing code, understand the schema: see `agents/zh/schema.md` / `agents/zh/enum.md`, or use `/static/query` once services are up.
