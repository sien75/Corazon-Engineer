#!/bin/sh
# stop the dev stack started by launch.sh
ROOT="$PWD"
D="$ROOT/.corazon/dev"
if [ ! -d "$D" ]; then
  echo "nothing to stop (no $D)"
  exit 0
fi
for s in web ai static log; do
  if [ -f "$D/$s.pid" ]; then
    kill "$(cat "$D/$s.pid")" 2>/dev/null && echo "$s stopped"
    rm -f "$D/$s.pid"
  fi
done
