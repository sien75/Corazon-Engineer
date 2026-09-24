# runtime

How to test and operate this project's environments. This file is the contract for the `runtime/` tree — read it before doing anything here.

## Layout

```
runtime/
├── README.md            # this file
├── testing/[env]/       # E2E tests; env name = dir name
│   └── case-xxx/
│       ├── desp.yaml    # test metadata: atoms (required), env (optional)
│       └── TEST.md      # the case itself
└── operation/           # how to connect to / observe resources (db, cache, logs, services)
```

## Conventions

- Env name = directory name under `testing/`; `engineer.yaml`'s `default_runtime` must exist.
- Structured data lives in yaml: test metadata in `desp.yaml`. Everything else is prose.
- Launch / deploy recipes live in `devtime/deploy/`, not here.
