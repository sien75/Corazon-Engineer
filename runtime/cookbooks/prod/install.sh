#!/bin/sh
# corazon install / upgrade — replaces software only.
set -e
CORAZON_HOME="${CORAZON_HOME:-$HOME/.corazon}"
SRC="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SRC")"          # corazon-<ver>-<os>-<arch>
APPS="$CORAZON_HOME/apps"

# 1. tool dirs
mkdir -p "$APPS/versions" "$CORAZON_HOME/bin"

# 2. stop any instance of the currently-installed version (all projects).
#    Resolve `current` first: the launcher runs its services from the real
#    apps/versions/<ver>/ dir, not through the symlink.
if [ -L "$APPS/current" ]; then
  CUR_REAL="$(cd "$APPS/current" 2>/dev/null && pwd -P || true)"
  [ -n "$CUR_REAL" ] && pkill -f "$CUR_REAL/bin/corazon-" 2>/dev/null || true
fi

# 3. install this version (re-install of the same version replaces its own dir)
rm -rf "$APPS/versions/$NAME"
cp -R "$SRC" "$APPS/versions/$NAME"

# 4. flip current — the upgrade switch
ln -sfn "$APPS/versions/$NAME" "$APPS/current"

# 5. the corazon command — a symlink to the current version's launcher.
#    The launcher is a native binary on purpose: the terminal's foreground
#    process is then named "corazon", so terminals that title tabs from the
#    process name (VS Code, notably) show "corazon" with no configuration.
ln -sfn "$APPS/current/bin/corazon" "$CORAZON_HOME/bin/corazon"

# 6. put corazon on PATH when possible, otherwise tell the user how
if [ -w /usr/local/bin ]; then
  ln -sfn "$CORAZON_HOME/bin/corazon" /usr/local/bin/corazon
else
  echo "add to your shell profile:  export PATH=\"$CORAZON_HOME/bin:\$PATH\""
fi

echo "corazon installed: $NAME"
echo "run: corazon   (Ctrl-C to stop)"
