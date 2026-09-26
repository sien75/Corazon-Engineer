#!/bin/sh
# engineer install / upgrade — replaces software only.
set -e
ENGINEER_HOME="${ENGINEER_HOME:-$HOME/.engineer}"
SRC="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SRC")"          # engineer-<ver>-<os>-<arch>
APPS="$ENGINEER_HOME/apps"

# 1. tool dirs
mkdir -p "$APPS/versions" "$ENGINEER_HOME/bin"

# 2. stop any instance of the currently-installed version (all projects).
#    Resolve `current` first: the launcher runs its services from the real
#    apps/versions/<ver>/ dir, not through the symlink.
if [ -L "$APPS/current" ]; then
  CUR_REAL="$(cd "$APPS/current" 2>/dev/null && pwd -P || true)"
  [ -n "$CUR_REAL" ] && pkill -f "$CUR_REAL/bin/engineer-" 2>/dev/null || true
fi

# 3. install this version (re-install of the same version replaces its own dir)
rm -rf "$APPS/versions/$NAME"
cp -R "$SRC" "$APPS/versions/$NAME"

# 4. flip current — the upgrade switch
ln -sfn "$APPS/versions/$NAME" "$APPS/current"

# 5. the engineer command — a symlink to the current version's launcher.
#    The launcher is a native binary on purpose: the terminal's foreground
#    process is then named "engineer", so terminals that title tabs from the
#    process name (VS Code, notably) show "engineer" with no configuration.
ln -sfn "$APPS/current/bin/engineer" "$ENGINEER_HOME/bin/engineer"

# 6. prune old versions — keep the current one plus the most recent others,
#    so at most KEEP versions stay installed. Never remove the version `current`
#    points at.
KEEP=3
CUR_NAME="$(basename "$(readlink "$APPS/current" 2>/dev/null || echo "$NAME")")"
i=0
for v in $(cd "$APPS/versions" && ls -1t); do
  [ -d "$APPS/versions/$v" ] || continue
  if [ "$v" = "$CUR_NAME" ]; then continue; fi
  i=$((i + 1))
  if [ "$i" -lt "$KEEP" ]; then continue; fi
  rm -rf "$APPS/versions/$v"
done

# 7. put engineer on PATH when possible, otherwise tell the user how
if [ -w /usr/local/bin ]; then
  ln -sfn "$ENGINEER_HOME/bin/engineer" /usr/local/bin/engineer
else
  echo "add to your shell profile:  export PATH=\"$ENGINEER_HOME/bin:\$PATH\""
fi

echo "engineer installed: $NAME"
echo "run: engineer   (Ctrl-C to stop)"
