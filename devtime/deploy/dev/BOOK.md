# dev environment cookbook

Local development environment: builds and runs the static / log Go services, the ai Bun/TS service, and the web frontend on this machine.

## Prerequisites

- Go 1.22+
- Bun (ai service) and Node.js (web frontend only)
- An LLM provider key for the ai service — configured pi's own way: env vars or `~/.pi/agent/auth.json` (`--api-key` also works). Corazon keeps no credentials itself; external tools keep their own under their own `~/.xxx` locations.

## Start / stop

Run from the project root (the directory holding `corazon.yaml`):

```bash
devtime/deploy/dev/launch.sh    # build + start log → static → ai → web
devtime/deploy/dev/stop.sh      # stop everything
```

`launch.sh` owns port selection: defaults are 7500 web / 7501 ai / 7502 static / 7503 log, and a taken default advances to the next free port. It builds the Go services into `.corazon/dev/bin/`, starts all four, hands each service the chosen addresses (ai gets `--log` / `--static`; web gets `--static` / `--ai` / `--log`), and prints the port table. There is **no port config file**.

Logs and pids live under `.corazon/dev/`.

To pin a model, pass it through: `AI_MODEL=... ` is not wired yet — run ai directly if needed: `cd workspace/ai && bun run src/main.ts --root <project root> --model anthropic/claude-sonnet-4-6`.

## Verify

`launch.sh` prints the static address. Query it:

```bash
curl -s -X POST http://localhost:<static port>/static/query -d '{}'
```

A response listing atoms / edges / runtime entries means the stack is up. For system-level tests see `runtime/testing/dev/` (each `case-*/TEST.md`).
