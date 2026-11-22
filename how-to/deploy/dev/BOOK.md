# dev environment cookbook

Local development environment: builds and runs the whole stack — the Go side as a single binary, plus the ai Bun/TS service — on this machine.

## Prerequisites

- Go 1.22+
- Bun (ai service) — the only JS runtime in the stack: the shell and the blueprint runtime are Go (`workspace/blueprint`), so no Node.js is needed
- An LLM provider key for the ai service — configured pi's own way: env vars or `~/.pi/agent/auth.json` (`--api-key` also works). Corazon Engineer keeps no credentials itself; external tools keep their own under their own `~/.xxx` locations.

## Start / stop

Run it from anywhere — the script works from the checkout it lives in, not from the current
directory. The program is not bound to a project folder any more: projects are added on the web page
(Engineer launcher, the `+`) and remembered in the **data home**.

```bash
how-to/deploy/dev/launch.sh    # build + start storage → ai → blueprint → web
how-to/deploy/dev/stop.sh      # stop everything
```

A dev run has **its own home**, apart from a real install's `~/.engineer`: `<checkout>/.engineer/dev-home`
(`ENGINEER_HOME` overrides it; `.engineer/` is git-ignored), and the data home is `<home>/data` —
`engineer.db` (conversations and their session rows), `config.yaml`, `models.yaml`, `uploads/`,
`projects/` and the run files. It starts empty: `models.yaml` is written with its defaults on first start,
and the projects are imported on the page — a dev run never reads or writes the user's real conversations.
`ENGINEER_DATA` overrides just the data home, which is what the system tests use to keep their data separate. `ENGINEER_INSTANCE=<name>` runs a second instance
from the same checkout with its own pids, logs and binary path (ports are picked independently), so
two instances coexist as long as their ports differ. They share the dev home unless you give the
second one its own `ENGINEER_DATA` — sharing means one board and one set of open sessions.

`launch.sh` owns port selection: defaults are 8500 web / 8501 ai / 8502 storage / 8503 blueprint, and a taken default advances to the next free port. It builds the Go side into `.engineer/dev${ENGINEER_INSTANCE:+-<name>}/bin/engineer` — one multi-call binary that also carries the three services, started as `engineer serve-storage` / `serve-blueprint` / `serve-web` (the same binary the prod launcher ships; `serve-web` serves the shell in `workspace/web/shell/`, and `serve-blueprint` runs the blueprints in the projects the user imported in the web UI, remembered in the data home's `config.yaml`) — starts all four, and hands each one everything it needs: every service gets `--bind` + `--port`; storage gets `--home` (the data home) and answers `/log/*` — records and sessions; ai gets `--home` / `--storage`; blueprint gets `--home` (where each project's data is filed — `<home>/projects/<project>/` — and where `config.yaml` keeps the imported folders and the one in front) / `--engineer-home` (Engineer's own folder) / `--cwd` (the folder an agent works in) — the last two reach a blueprint's ai node, not its page / `--storage` / `--ai`; web gets `--home` (where the image store `uploads/` is, for `/blobs/<sha256>`) / `--shell` (the shell files) / `--blueprint` (the blueprint service's address, the only service it knows) / `--storage` / `--ai` / `--cwd`. **No service is told where the blueprints are**: the projects are the user's choice, made on the first page the shell draws (a blocking dialog, since a folder a launcher picked is not a choice) and kept in `<data home>/config.yaml` — blueprints belong to no project. More folders are imported later from the corner switcher; switching the front starts and stops nothing, and removing a project stops it and leaves its folder and databases alone. It then prints the port table, the data home and the bind host. **No service has a default address** — a leaf that invented one would silently bind a port nobody chose. There is **no port config file**.

The data home is the **only** database the stack reads, and that is the whole rule: there is no
migration step left to run. A `<checkout>/.engineer/engineer.db` from before the home existed is not
looked at by the launcher or by any service — that file is not part of the program. (The one-way move
it would have needed was done once, by hand, with code that no longer exists; a new data home simply
starts empty and projects are added on the page.)

Another project's database is likewise never imported — a newly added project starts with an empty
history.

The launcher binds `127.0.0.1` by default — this is a local tool, not a service on the office network. A service started by hand has **no** default host: `--bind` is required, so nothing is exposed by accident. `ENGINEER_BIND` overrides the bind host: `ENGINEER_BIND=0.0.0.0 how-to/deploy/dev/launch.sh` opens the stack to the whole network, `ENGINEER_BIND=<this machine's IP>` binds one interface (that is also the form that makes the printed addresses usable from another machine).

Logs and pids live under `.engineer/dev/`.

Which model a conversation runs is decided in three layers, and they come in two slots — `chat` (the conversation) and `image` (image generation) — each slot resolving on its own. Nothing writes pi's settings.

- **The session's own row in storage** (strongest) — what the `model` tool switched it to, and what `POST /ai/new` gave it at creation (`chat` / `image`, `model` being the old alias for `chat`). One layer, one storage place: a switch and a creation-time choice both land on the row, and nothing goes into the conversation's records, so a restart reads back exactly one answer. An unknown chat name is a `400` at creation and a failure in the tool, so a session cannot be born or switched onto a model nothing can serve; `image` is shape-checked only.
- **The data home's `models.yaml`** (`<data home>/models.yaml`, written with defaults on first start) — one `chat` and one `image` slot, both `provider/model-id`; there are no roles. `chat` defaults to `deepseek/deepseek-flash`; `image` is empty (read, not used yet: there is no image runtime). Only these two top-level keys are read; any other key (a `main:` / `sub:` block from before the roles were dropped, say) is ignored, not mapped onto them. Read fresh for every session built or resumed, so an edit — by hand, or by an agent with `write` / `edit` — reaches the next one, never a running conversation.
- **pi's own default** (weakest, chat only) — the `defaultProvider` / `defaultModel` in pi's settings (`~/.pi/agent/settings.json`) when pi can serve it, else the first model pi can serve. The image slot stops at `models.yaml`: no fallback, no catalog check.

A name that cannot be resolved right now (a retired model, a provider without credentials) is skipped with a warning. pi still owns the catalog and the credentials (`settings.json`, `models.json`, `auth.json`); the agent's `model` tool is a live `agent.setModel` for chat and records the choice for image. The thinking level is not stored per conversation anywhere: pi derives it per model from its own settings.

A hand-run: `cd workspace/ai && bun run src/main.ts --bind 127.0.0.1 --port 7501 --home <data home> --storage <storage url>`. **Every one of those flags is required**: ai has no default host, port, home or storage address, so a hand-run must state all four (`--stub` is the only optional one). `--home` is the program's data directory (uploaded images). ai is handed no spec and no interface docs: whatever an agent should know arrives per session as `/ai/new`'s `system`. The interface docs in `structure/docs/` are a project convention still regenerated on every dev start (`bun how-to/deploy/gen-docs.ts <checkout> <checkout>/structure/docs`; its `README.md` is kept by hand).

## Verify

`launch.sh` prints the addresses. The stack starts with nothing imported, so import a blueprints
folder first and then read it back:

```bash
curl -s http://localhost:<web port>/config.js          # addresses + projects the page gets
curl -s -X POST http://localhost:<web port>/config/projects \
  -H 'Content-Type: application/json' -d '{"path":"/absolute/blueprints/folder"}'
curl -s http://localhost:<blueprint port>/bp/<project>/<slug>/bp.js | head -1   # the page's addresses: ai, storage, home, cwd
```

An address block with the imported projects, and a `bp.js` first line with `ai`, `storage`, `home` and `cwd`, mean the stack is up. For system-level tests see `development/testing/dev/` (each `case-*/TEST.md`).
