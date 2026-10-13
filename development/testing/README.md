# testing — E2E cases

> Chinese is the working language for case text; this English `README.md` is the authoritative entry.

System-level test cases. One directory per case under `dev/`: `desp.yaml` (metadata) + `TEST.md` (the case itself). A case drives the real services over their real interfaces — there is no mock layer, and no test framework: a case **is** a sequence of shell blocks plus, for anything DOM-shaped, an `ego-browser` script.

`development/README.md` says what this directory is; this file says how a case is written and run.

## Running one

Read `TEST.md` top to bottom and run it top to bottom. Three sections, in order:

1. **Setup** — a scratch project root under `.engineer/<case>/`, the services this case needs, and any fixture files. Everything this case touches lives under that root; a case must never touch the real `.agents/` or `.engineer/`.
2. **Run** — the checks. Either `curl` blocks (with the expected response written out) or one `ego-browser nodejs` script that prints `{ ok, checks }`.
3. **Teardown** — `pkill` the services it started.

Prerequisites: Go, Bun, and — for the browser cases — `ego-browser` on `PATH`.

## The rule that keeps cases honest

**A case owns a block of ports, and reclaims them before it starts.**

Both halves matter, and skipping either produces the worst kind of failure — a *wrong answer* rather than a missing service:

- **Unique ports.** No two cases may share a port. When they do, a leftover process from case A keeps the port, case B's service fails to bind with `EADDRINUSE` (buried in a log nobody reads), and case B's frontend happily talks to **case A's service** — with case A's database. The checks then fail for a reason that has nothing to do with the code.
- **Reclaim first.** Each `Setup` begins by killing whatever a previous run of *this* case left behind, keyed on its own root and ports, before starting anything. Without it the second run of a case talks to the first run's database, and "recent" fills up with records from runs you have already forgotten.

  Reclaim is a `pkill -f` on a root path, so an **empty root is a loaded gun**: the pattern collapses to `serve-log --root ` and matches every service on the machine, the agent's own included. Every reclaim block therefore opens with `: "${ROOT:?...}"` (see below). Reclaim only the services this case actually starts — a case that runs just `serve-web` must not be killing `serve-log`.

The reclaim block every Setup starts with (adjust the root and ports to this case):

```bash
# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-log --root " and kills every service on the machine — including the one
# running the agent. Fail loudly instead.
: "${ROOT:?this case must set ROOT before reclaiming}"

# A leftover service keeps serving its old database, and the failure it causes
# looks like a wrong answer, not a dead service — so this happens before
# anything starts, not after.
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts --root $ROOT" 2>/dev/null || true
pkill -f "serve-web.*--port $PORT_WEB" 2>/dev/null || true
sleep 1
```

Port blocks are assigned so a case can also be run next to its neighbours; `development/testing/dev/<case>/TEST.md` states the exact numbers. If you add a case, take a block nobody uses and put the reclaim block in its Setup.

## Writing a case

- **`desp.yaml`** — `id`, one-line `description`, and the `atoms` it exercises.
- **`TEST.md`** — numbered sections, each a block to run and the expected result in prose. Prefer asserting an observable outcome (`#panes .pane` count, a response field) over an implementation detail.
- **Browser cases** end by printing `{"ok": ..., "checks": ...}`. Keep `ok` derived from `checks`; a case that fails must exit non-zero.
- **A case that cannot be deterministic** (it needs a real model provider) says so in the file and records the manual verification in the iteration record instead of guessing.

## What a case is not

- Not a unit test: it goes through the services, on their real ports.
- Not a place for fixtures the project itself needs — everything it writes belongs under `.engineer/<case>/`.
- Not the place instructions for the *project* live; that is `how-to/` and the project `AGENTS.md`.
