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

`launch.sh` owns port selection: defaults are 8500 web / 8501 ai / 8502 static / 8503 log, and a taken default advances to the next free port. It builds the Go side into `.engineer/dev/bin/engineer` — one multi-call binary that also carries the three services, started as `engineer serve-log` / `serve-static` / `serve-web` (the same binary the prod launcher ships; `serve-web` serves the assets in `workspace/web/`) — starts all four, and hands each one everything it needs: every service gets `--bind` + `--port`; log and static also get `--root`; ai gets `--root` / `--log` / `--static` / `--agents`; web gets `--assets` (the frontend files) / `--pages` (`<project>/.agents/blueprints`, served under `/pages/…`) / `--static` / `--ai` / `--log`. It then prints the port table and the bind host. **No service has a default address** — a leaf that invented one would silently bind a port nobody chose. There is **no port config file**.

The launcher binds `127.0.0.1` by default — this is a local tool, not a service on the office network. A service started by hand has **no** default host: `--bind` is required, so nothing is exposed by accident. `ENGINEER_BIND` overrides the bind host: `ENGINEER_BIND=0.0.0.0 how-to/deploy/dev/launch.sh` opens the stack to the whole network, `ENGINEER_BIND=<this machine's IP>` binds one interface (that is also the form that makes the printed addresses usable from another machine).

Logs and pids live under `.engineer/dev/`.

To pin a model, pass it through: `AI_MODEL=... ` is not wired yet — run ai directly if needed: `cd workspace/ai && bun run src/main.ts --bind 127.0.0.1 --port 7501 --root <project root> --log <log url> --static <static url> --agents ../../agents/AGENTS.md --model anthropic/claude-sonnet-4-6`. **Every one of those flags is required**: ai has no default host, port, project root, log address, static address or spec file, so a hand-run must state all six (`--model` and `--stub` are the only optional ones).

## Verify

`launch.sh` prints the static address. Query it:

```bash
curl -s -X POST http://localhost:<static port>/static/query -d '{}'
```

A response listing atoms / edges / how-to / development entries means the stack is up. For system-level tests see `development/testing/dev/` (each `case-*/TEST.md`).
