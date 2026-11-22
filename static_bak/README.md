# static_bak — parked, not served

The read-only views of a folder's file tree, kept for reference. They are no
longer registered by any service: there is no `/static/*` route any more.

| file | was |
|---|---|
| `server-static.go` | `workspace/storage/internal/server/static.go` — the handlers (`/static/query`, `/static/query-detail`, `/static/stream`) |
| `contracts/*.yaml` | the three interface contracts |
| `docs/*.md` | their generated interface docs |

The routes went away with the project board: the shell never drew a schema graph,
and the agent reads a project's files with `read` / `grep` anyway. Nothing else
in the checkout refers to them.

Putting any of it back means: the handlers into
`workspace/storage/internal/server/`, the contracts into
`structure/contracts/`, the `static-*` entries back into
`structure/atoms/storage.yaml`, the routes back into `server.go`, and the docs
lines back into `structure/docs/README.md` — then regenerate with
`bun how-to/deploy/gen-docs.ts . structure/docs`.
