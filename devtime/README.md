# devtime — Development-Time Material

> All content under `devtime/` is written in Chinese. This English `README.md` is the authoritative entry (its Chinese mirror is `README_zh.md`).

Corazon's **development-time** material — everything that turns a requirement into a runnable system. It is **not shipped** with the system. A plain file tree; the layout below is its contract.

## Layout

- `development/` — requirements analysis, architecture design, and design work before coding (meetings, ADRs, iteration records, one dir per iteration number).
- `deploy/` — build, pack, launch, and deploy a project, per environment. It ensures the project starts; it does not verify business behavior.

## Development entry

1. **Process** — the development SOP lives in the project-root `AGENTS.md`. Follow it; do not skip stages.
2. **Design records** — important decisions and risks go into `development/iteration-XXXX/` (one dir per iteration number); do not leave them scattered in chat.
3. **Deploy** — launch local services per `deploy/dev/BOOK.md` (log :8503 → static :8502 → ai :8501 → web :8500).
4. **Verification** — system cases live in `runtime/testing/dev/` (`case-core-*/TEST.md`).
5. **Structure** — before changing code, understand the schema: see `agents/zh/schema.md` / `agents/zh/enum.md`, or use `/static/query` once services are up.
