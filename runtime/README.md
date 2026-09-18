# runtime

How to run this project in each environment, and which tests apply. This file is the contract for the `runtime/` tree — read it before doing anything here.

## Layout

```
runtime/
├── README.md          # this file
├── cookbooks/[env]/   # one dir per environment; env name = dir name
│   ├── BOOK.md        # how to launch / connect / observe this env (prose)
│   └── launch.sh      # the env's launcher (owns ports, starts the atoms)
└── tests/[env]/       # system tests bound to this env (env name must match cookbooks/)
    └── case-xxx/
        ├── desp.yaml  # test metadata: atoms (required), env (optional)
        └── TEST.md    # the test case itself
```

## Conventions

- Env name = directory name under `cookbooks/`; `tests/[env]` must use the same name; `corazon.yaml`'s `default_runtime` must exist.
- Structured data lives in yaml: test metadata in `desp.yaml`. Everything else is prose.
- An env is launched by its `launch.sh` (a real script, not generated from BOOK.md). The launcher owns port selection — defaults plus advance-on-conflict — and passes the chosen addresses to each atom; there is no port config file. The launcher prints the addresses it chose, so they are discovered at run time rather than declared. How it is torn down is the env's own business: `dev/` ships a `stop.sh`, `prod/` holds the foreground and exits on Ctrl-C.
- Credentials are not configured here. The ai service's LLM provider key comes from pi's own config (env vars or `~/.pi/agent/auth.json`). External tools keep their own credentials under their own `~/.xxx` locations.
