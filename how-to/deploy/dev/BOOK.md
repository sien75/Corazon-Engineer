# dev environment cookbook

Local development environment: builds and runs the whole stack — the Go side as a single binary, plus the ai Bun/TS service — on this machine.

## Prerequisites

- Go 1.22+
- Bun (ai service) — the only JS runtime in the stack: web is Go (`workspace/web/server`), so no Node.js is needed
- An LLM provider key for the ai service — configured pi's own way: env vars or `~/.pi/agent/auth.json` (`--api-key` also works). Corazon Engineer keeps no credentials itself; external tools keep their own under their own `~/.xxx` locations.

## Start / stop

Run it from anywhere — the script works from the checkout it lives in, not from the current
directory. The program is not bound to a project folder any more: projects are added on the web page
(Engineer launcher, the `+`) and remembered in the **data home**.

```bash
how-to/deploy/dev/launch.sh    # build + start log → static → ai → web
how-to/deploy/dev/stop.sh      # stop everything
```

The data home is the program's own directory — `engineer.db`, the project board, uploads, run files.
`ENGINEER_DATA` overrides it; the dev default is `<checkout>/.engineer/home`, so a dev run never
touches a real install's data (`~/.engineer/data`). `ENGINEER_INSTANCE=<name>` runs a second instance
from the same checkout with its own pids, logs and binary path (ports are picked independently), so
two instances coexist as long as their ports differ. They share the data home unless you give the
second one its own `ENGINEER_DATA` — sharing means one board and one set of open sessions.

`launch.sh` owns port selection: defaults are 8500 web / 8501 ai / 8502 static / 8503 log, and a taken default advances to the next free port. It builds the Go side into `.engineer/dev${ENGINEER_INSTANCE:+-<name>}/bin/engineer` — one multi-call binary that also carries the three services, started as `engineer serve-log` / `serve-static` / `serve-web` (the same binary the prod launcher ships; `serve-web` serves the assets in `workspace/web/`) — starts all four, and hands each one everything it needs: every service gets `--bind` + `--port`; log gets `--home` (the data home); static gets `--log` (it has no root: each request carries a `projectId` that it resolves through log); ai gets `--home` / `--log` / `--static` / `--agents`; web gets `--assets` (the frontend files) / `--static` / `--ai` / `--log` (its `/agent/<sessionId>/` resolves the session's project and blueprint through log). It then prints the port table, the data home and the bind host. **No service has a default address** — a leaf that invented one would silently bind a port nobody chose. There is **no port config file**.

When the checkout still has a pre-home database (`<checkout>/.engineer/engineer.db`), the launcher runs
`engineer migrate --home <data> --from <checkout>/.engineer --project <checkout>` first: it copies the
database when the home has none and **merges whatever is new on every later run** (rows matched by id,
nothing overwritten), then puts the checkout on the board and assigns its old conversations to it.
The merge is what keeps the home current while a previously installed build is still writing to the
old file; run the launcher (or the command above) again whenever you want to catch up. `current` —
which tabs are open — is not merged: it belongs to whichever window is looking, and two instances
sharing a home would drag it back and forth; the conversations are all there under a project's Recent.

Another project's old database is **not** migrated — a newly added project starts with an empty
history.

The launcher binds `127.0.0.1` by default — this is a local tool, not a service on the office network. A service started by hand has **no** default host: `--bind` is required, so nothing is exposed by accident. `ENGINEER_BIND` overrides the bind host: `ENGINEER_BIND=0.0.0.0 how-to/deploy/dev/launch.sh` opens the stack to the whole network, `ENGINEER_BIND=<this machine's IP>` binds one interface (that is also the form that makes the printed addresses usable from another machine).

Logs and pids live under `.engineer/dev/`.

To pin a model, pass it through: `AI_MODEL=... ` is not wired yet — run ai directly if needed: `cd workspace/ai && bun run src/main.ts --bind 127.0.0.1 --port 7501 --home <data home> --log <log url> --static <static url> --agents ../../agents --model anthropic/claude-sonnet-4-6`. **Every one of those flags is required**: ai has no default host, port, home, log address, static address or spec file, so a hand-run must state all six (`--model` and `--stub` are the only optional ones). `--home` is the program's data directory (uploaded images), not a project; `--agents` is the directory holding the two role specs (`main/AGENTS.md`, `sub/AGENTS.md`).

## Verify

`launch.sh` prints the addresses. The board starts empty (except for the checkout, which the launcher
registered), so query it through a project's id:

```bash
curl -s -X POST http://localhost:<log port>/log/project/list -d '{}'
# take a projectId from the answer
curl -s -X POST http://localhost:<static port>/static/query -d 'projectId: <projectId>'
```

A project listing and a schema response (atoms / edges / how-to / development entries) mean the stack
is up. For system-level tests see `development/testing/dev/` (each `case-*/TEST.md`).
