# how-to

> This English file is authoritative; the Chinese mirror is `README_zh.md`.

How to build and operate the system. This file is the contract for the `how-to/` tree — read it before doing anything here. A plain file tree; the layout below is its contract.

## Layout

```
how-to/
├── README.md          # this file
├── deploy/[env]/      # build / pack / launch / deploy, per environment
│   └── BOOK.md        # the cookbook for that environment
└── operation/         # how to connect to / observe resources (db, cache, logs, services)
```

Two modules:

- **`deploy/`** — per-environment build / pack / launch / deploy; it ensures the project starts, it does not verify business behavior.
- **`operation/`** — connecting to and observing resources (databases, caches, logs, service instances), including telemetry: live monitoring, historical log queries, and active operations.

## Conventions

- Env name = directory name under `deploy/`.
- Structured data lives in yaml; everything else is prose.
- How the system is tested lives in `development/testing/`, not here.
- Credentials are not configured here. External tools keep their own credentials under their own `~/.xxx` locations.
