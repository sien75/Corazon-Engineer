# devtime — Development-Time Material

> All content under `devtime/` is written in Chinese. This English `README.md` is the authoritative entry (its Chinese mirror is `README_zh.md`).

Corazon Engineer's **development-time** material — everything that turns a requirement into a runnable system. It is **not shipped** with the system. A plain file tree; the layout below is its contract.

## Layout

- `development/` — development material before coding: design work plus iteration records.
  - `plans/` — design / plan documents, one dir per iteration number (`2608/`, `2609/`, ...).
  - `iteration/` — the plan confirmed at each iteration: one markdown file per plan, named `[YYMM]-[2-digit sequence]-[short title].md` (e.g. `2609-01-runtime 散文化重构.md`).
- `deploy/` — build, pack, launch, and deploy a project, per environment. It ensures the project starts; it does not verify business behavior.

## Development entry

1. **Process** — the development SOP lives in the project-root `AGENTS.md`. Follow it; do not skip stages.
2. **Design records** — designs and plans go into `development/plans/<iteration-number>/`; each confirmed plan goes into `development/iteration/` as one markdown file named `[YYMM]-[2-digit sequence]-[short title].md`. Do not leave them scattered in chat.
3. **Deploy** — launch local services per `deploy/dev/BOOK.md` (log :8503 → static :8502 → ai :8501 → web :8500).
4. **Verification** — system cases live in `runtime/testing/dev/` (`case-core-*/TEST.md`).
5. **Structure** — before changing code, understand the schema: see `agents/zh/schema.md` / `agents/zh/enum.md`, or use `/static/query` once services are up.
