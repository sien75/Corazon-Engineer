# runtime

How to run this project in each environment, and which tests apply. This file is the contract for the `runtime/` tree — read it before doing anything here.

## Layout

```
runtime/
├── README.md          # this file
├── cookbooks/[env]/   # one dir per environment; env name = dir name
│   ├── BOOK.md        # how to launch / connect / observe this env (prose)
│   └── config.yaml    # the env's default values (ports, ...)
└── tests/[env]/       # system tests bound to this env (env name must match cookbooks/)
    └── case-xxx/
        ├── desp.yaml  # test metadata: atoms (required), env (optional)
        └── TEST.md    # the test case itself
```

## Conventions

- Env name = directory name under `cookbooks/`; `tests/[env]` must use the same name; `corazon.yaml`'s `default_runtime` must exist.
- Structured data lives in yaml: test metadata in `desp.yaml`, runtime values in `config.yaml`. Everything else is prose.
- When a cookbook uses a value, it says so (ref `config.yaml`) instead of hardcoding a second copy.
