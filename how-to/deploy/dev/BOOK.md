# dev environment cookbook

Local development environment: builds and runs the whole stack — the Go side as a single binary, plus the ai Bun/TS service — on this machine.

## Prerequisites

- Go 1.22+
- Bun (ai service) — the only JS runtime in the stack: web is Go (`workspace/web/server`), so no Node.js is needed
- An LLM provider key for the ai service — configured pi's own way: env vars or `~/.pi/agent/auth.json` (`--api-key` also works). Corazon Engineer keeps no credentials itself; external tools keep their own under their own `~/.xxx` locations.

## Start / stop

Run from the project root (the directory holding `engineer.yaml`):

```bash
how-to/deploy/dev/launch.sh    # build + start log → static → ai → web
how-to/deploy/dev/stop.sh      # stop everything
```

`launch.sh` owns port selection: defaults are 8500 web / 8501 ai / 8502 static / 8503 log, and a taken default advances to the next free port. It builds the Go side into `.engineer/dev/bin/engineer` — one multi-call binary that also carries the three services, started as `engineer serve-log` / `serve-static` / `serve-web` (the same binary the prod launcher ships; `serve-web` serves the assets in `workspace/web/`) — starts all four, hands each service the chosen addresses (ai gets `--log` / `--static`; web gets its port plus `--bind` / `--root` / `--static` / `--ai` / `--log`), and prints the port table and the bind host. There is **no port config file**.

Services listen on `127.0.0.1` by default — this is a local tool, not a service on the office network. `ENGINEER_BIND` overrides the bind host: `ENGINEER_BIND=0.0.0.0 how-to/deploy/dev/launch.sh` opens the stack to the whole network, `ENGINEER_BIND=<this machine's IP>` binds one interface (that is also the form that makes the printed addresses usable from another machine).

Logs and pids live under `.engineer/dev/`.

To pin a model, pass it through: `AI_MODEL=... ` is not wired yet — run ai directly if needed: `cd workspace/ai && bun run src/main.ts --root <project root> --agents ../../agents/AGENTS.md --model anthropic/claude-sonnet-4-6` (without `--agents` it falls back to the installed tool's copy under `~/.engineer/apps/current/agents/`; without `--addr` it falls back to its own default host and port, `127.0.0.1:7501` — under the launcher the real, possibly advanced port is always passed in).

## Verify

`launch.sh` prints the static address. Query it:

```bash
curl -s -X POST http://localhost:<static port>/static/query -d '{}'
```

A response listing atoms / edges / how-to / development entries means the stack is up. For system-level tests see `development/testing/dev/` (each `case-*/TEST.md`).
