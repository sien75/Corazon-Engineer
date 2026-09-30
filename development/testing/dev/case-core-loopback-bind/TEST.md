# Test: core-loopback-bind

The four services are local-only: they must listen on `127.0.0.1`, not on every
interface. Exposing them is opt-in, through the launcher's `ENGINEER_BIND`
environment variable (and `--bind` on a service run directly). This case checks
both halves from the user's point of view — what is reachable, and how to change
it deliberately.

Sources of truth: `how-to/deploy/prod/launch.go` (owns the bind host and hands
it down), `how-to/deploy/dev/launch.sh` (same, for dev), and each service's own
default (`workspace/log`, `workspace/static`, `workspace/web/server` — all three
started as subcommands of the merged `engineer` binary — plus
`workspace/ai/src/main.ts`).

## ⚠️ Open-up checks are opt-in

Sections **2** and **3b** bind to `0.0.0.0`. That is exactly the behaviour a
corporate endpoint agent flags: on an Ant-managed machine (Aspect/星点) it raises
its alarm — observed, once per service, four in total. That is why the default
is loopback.

**Do not run them as part of a routine pass.** Run one only when you
deliberately need to re-verify the open path, and expect the alarm. Sections
**1** and **3a** are the default run: they touch nothing outside this machine.

## Setup

Run from the project root (the directory holding `engineer.yaml`).

```bash
# the four ports the launcher printed
ports() { awk '/^  (web|ai|static|log)/{n=split($2,a,":"); print a[n]}' /tmp/engineer-dev.out | sort -n; }

# what is listening on them: process, host and port. Looked up by the printed
# port, not by process name — dev runs ai as `bun`, not `engineer-ai`.
lsof_bind() {
  for p in $(ports); do lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1, $9}'; done
}
```

Ports are the launcher's to pick and it advances on conflict, so every check below
reads the address **the launcher printed** instead of assuming the defaults.

## 1. the dev stack listens on loopback only  (default run)

```bash
how-to/deploy/dev/launch.sh | tee /tmp/engineer-dev.out
lsof_bind
```

Expected: four lines, one per service, **every one of them `127.0.0.1:<port>`** —
host `127.0.0.1`, and the four ports are exactly the ones `/tmp/engineer-dev.out`
printed (defaults 8500–8503, advanced on conflict). **No line may show
`*:<port>`, and no line may show a host other than `127.0.0.1`.** Do not assert
particular port numbers.

The stack still works locally — the web address the launcher printed answers:

```bash
WEB=$(awk '/^  web/{print $2}' /tmp/engineer-dev.out); echo "web: $WEB"
curl -s -o /dev/null -w '%{http_code}\n' "$WEB/"
curl -s "$WEB/config.js"
```

Expected: `200`, and a `window.ENGINEER = {...}` body whose three URLs point at
`localhost:<port>` — the ports the launcher printed for static / ai / log
(not necessarily 8502 / 8501 / 8503).

## 2. ENGINEER_BIND=0.0.0.0 opens it to the whole network  (opt-in, ⚠️ triggers the alarm)

```bash
how-to/deploy/dev/stop.sh
ENGINEER_BIND=0.0.0.0 how-to/deploy/dev/launch.sh | tee /tmp/engineer-dev.out
lsof_bind
```

Expected: the same four lines, now all `*:<port>` — the host changed from
`127.0.0.1` to every interface, and the ports are again the ones the launcher
printed (the behaviour is available on purpose, and only when asked for). The
launcher's banner must say which host it bound:

```
engineer dev up — project: ...
  web     http://localhost:8500      # ports as printed, may be advanced
  ...
  bind    0.0.0.0
```

Dev prints `localhost` rather than an address another machine could use. For
that, pass the interface instead — `ENGINEER_BIND=0.0.0.0` is the whole-network
form, `ENGINEER_BIND=<this machine's IP>` the one-interface form; the **prod**
launcher detects the outward IP itself and prints it.

## 3a. a service run on its own defaults to loopback  (default run)

Here nothing chooses a port for us — the test does, so 8600 is this test's own
choice, not a default being asserted. The default under test is the **host**:
no launcher, no `--bind` → `127.0.0.1`.

```bash
how-to/deploy/dev/stop.sh

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-web 8600 --root "$(cd workspace/web && pwd)" &
sleep 1; lsof -nP -iTCP:8600 -sTCP:LISTEN
```

Expected: one line for `/tmp/engineer`, `TCP 127.0.0.1:8600 (LISTEN)`. (The
process name in `lsof` is the binary's basename: with the merged binary all four
services report as `engineer`.)

## 3b. --bind 0.0.0.0 opens a single service  (opt-in, ⚠️ triggers the alarm)

```bash
/tmp/engineer serve-web 8601 --root "$(cd workspace/web && pwd)" --bind 0.0.0.0 &
sleep 1; lsof -nP -iTCP:8601 -sTCP:LISTEN
```

Expected: `TCP *:8601 (LISTEN)` — `--bind` is how a single service is opened up
without the launcher.

## 4. teardown

```bash
pkill -f '/tmp/engineer serve-web 86'
how-to/deploy/dev/stop.sh
```
