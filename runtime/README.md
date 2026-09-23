# runtime

> This English file is authoritative; the Chinese mirror is `README_zh.md`.

Verifies the running system and interacts with its resources. This file is the contract for the `runtime/` tree — read it before doing anything here. A plain file tree; the layout below is its contract.

## Layout

```
runtime/
├── README.md          # this file
├── testing/[env]/     # E2E tests; env name = dir name
│   └── case-xxx/
│       ├── desp.yaml  # test metadata: atoms (required), env (optional)
│       └── TEST.md    # the case itself
└── operation/         # how to connect to / observe resources (db, cache, logs, services)
```

Two modules:

- **`testing/`** — E2E tests from the real user's point of view, exercising the business system through its UI / API.
- **`operation/`** — connecting to and observing resources (databases, caches, logs, service instances), including telemetry: live monitoring, historical log queries, and active operations.

## Conventions

- Env name = directory name under `testing/`; `corazon.yaml`'s `default_runtime` must exist.
- Structured data lives in yaml: test metadata in `desp.yaml`. Everything else is prose.
- How an environment is built, launched, and deployed lives in `devtime/deploy/`, not here.
- Credentials are not configured here. External tools keep their own credentials under their own `~/.xxx` locations.
</content>
