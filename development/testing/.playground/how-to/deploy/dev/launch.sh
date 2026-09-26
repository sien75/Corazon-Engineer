#!/bin/sh
# Playground dev launcher — picks a free port and starts the demo-service atom.
# The port lives here, not in a config file.
PORT=9000
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
exec ./demo-service --port "$PORT"
