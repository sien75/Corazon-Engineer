# how-to

How to build and operate this project's environments. This file is the contract for the `how-to/` tree — read it before doing anything here.

## Layout

```
how-to/
├── README.md            # this file
├── deploy/[env]/        # build / pack / launch / deploy; env name = dir name
│   └── BOOK.md          # the cookbook for that environment
└── operation/           # how to connect to / observe resources (db, cache, logs, services)
```

## Conventions

- Env name = directory name under `deploy/`.
- Structured data lives in yaml; everything else is prose.
- How the system is tested lives in `development/testing/`, not here.
