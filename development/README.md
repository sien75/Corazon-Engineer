# development — Development Material

> Chinese is the working language for `development/plans/` and `development/iterations/`. This English `README.md` is the authoritative entry (its Chinese mirror is `README_zh.md`).

What the development process produces. A plain file tree; the layout below is its contract.

## Layout

- `plans/` — design / plan documents, one dir per iteration number (`2608/`, `2609/`, ...).
- `iterations/` — the plan confirmed at each iteration: one markdown file per plan, named `[YYMM]-[2-digit sequence]-[short title].md` (e.g. `2609-01-runtime 散文化重构.md`).
- `testing/` — E2E tests, one dir per environment; each case is `desp.yaml` (metadata) + `TEST.md` (the case itself).

## Development entry

1. **Process** — the development SOP lives in the project-root `AGENTS.md`. Follow it; do not skip stages.
2. **Design records** — designs and plans go into `plans/<iteration-number>/`; each confirmed plan goes into `iterations/` as one markdown file named `[YYMM]-[2-digit sequence]-[short title].md`. Do not leave them scattered in chat.
3. **Deploy** — build / launch local services per `../how-to/deploy/dev/BOOK.md` (log :8503 → static :8502 → ai :8501 → web :8500).
4. **Verification** — system cases live in `testing/dev/` (`case-core-*/TEST.md`).
5. **Structure** — before changing code, understand the schema: see `agents/zh/schema.md` / `agents/zh/enum.md`, or use `/static/query` once services are up.
