# dev environment runbook

Local development environment: run the static / ai / log Go services plus the web frontend on this machine. Ports must match the `endpoints` in `dev.yaml` (static: 7502, ai: 7501, log: 7503).

## Prerequisites

- Go 1.22+
- Node.js (web frontend only)
- DeepSeek key for the ai service in `.corazon/credentials.md` (`.corazon/` is a git-ignored private directory; create it on first use)

## Start order

log and static have no interdependency; ai depends on both (its flags point at their addresses); web comes last.

```bash
# 1. log — sqlite record service, :7503
cd workspace/log && go run . serve-log --root <project root>

# 2. static — schema parsing service, :7502
cd workspace/static && go run . serve-static --root <project root>

# 3. ai — session/orchestration service, :7501 (defaults already point at localhost:7502 / 7503)
cd workspace/ai && go run . serve-ai --root <project root>

# 4. web — frontend (architecture graph + schema browsers), :7500
node workspace/web/serve.js
```

`<project root>` is the directory containing `corazon.yaml`; when running from the repo root, `--root` can be omitted (auto-detected from cwd).

## Verify

```bash
curl -s -X POST http://localhost:7502/static/query -d '{}'
```

A response listing atoms / edges / runtime entries means the stack is up. For system-level tests see the `tests` block in `dev.yaml` (`tests/core-*.md`).
