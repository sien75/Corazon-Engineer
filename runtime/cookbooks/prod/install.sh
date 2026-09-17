#!/bin/sh
# corazon install / upgrade — replaces software only.
set -e
CORAZON_HOME="${CORAZON_HOME:-$HOME/.corazon}"
SRC="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SRC")"          # corazon-<ver>-<os>-<arch>
APPS="$CORAZON_HOME/apps"

# 1. tool dirs
mkdir -p "$APPS/versions" "$CORAZON_HOME/bin"

# 2. stop any instance of the currently-installed version (all projects)
[ -L "$APPS/current" ] && pkill -f "$APPS/current/bin/corazon-" 2>/dev/null || true

# 3. install this version (re-install of the same version replaces its own dir)
rm -rf "$APPS/versions/$NAME"
cp -R "$SRC" "$APPS/versions/$NAME"

# 4. flip current — the upgrade switch
ln -sfn "$APPS/versions/$NAME" "$APPS/current"

# 5. the corazon command
cat > "$CORAZON_HOME/bin/corazon" <<'SHIM'
#!/bin/sh
CORAZON_HOME="${CORAZON_HOME:-$HOME/.corazon}"
CUR="$CORAZON_HOME/apps/current"
need() { [ -L "$CUR" ] || { echo "corazon: not installed"; exit 1; }; }
case "${1:-}" in
  ""|start) need; exec "$CUR/start.sh" ;;
  status)
    need
    D="$PWD/.corazon/run"
    for s in log static ai web; do
      if [ -f "$D/$s.pid" ] && kill -0 "$(cat "$D/$s.pid")" 2>/dev/null; then
        echo "$s: running (pid $(cat "$D/$s.pid"))"
      else
        echo "$s: stopped"
      fi
    done ;;
  version) need; basename "$(readlink "$CUR")" ;;
  uninstall)
    need; pkill -f "$CUR/bin/corazon-" 2>/dev/null || true
    rm -rf "$CORAZON_HOME/apps" "$CORAZON_HOME/bin"
    rm -f /usr/local/bin/corazon 2>/dev/null || true
    if [ "${2:-}" = "--purge" ]; then
      rm -rf "$CORAZON_HOME"
      echo "corazon uninstalled (purged)"
    else
      echo "corazon uninstalled"
    fi ;;
  *) echo "usage: corazon [start|status|version|uninstall [--purge]]"; exit 1 ;;
esac
SHIM
chmod +x "$CORAZON_HOME/bin/corazon"

# 6. put corazon on PATH when possible, otherwise tell the user how
if [ -w /usr/local/bin ]; then
  ln -sfn "$CORAZON_HOME/bin/corazon" /usr/local/bin/corazon
else
  echo "add to your shell profile:  export PATH=\"$CORAZON_HOME/bin:\$PATH\""
fi

echo "corazon installed: $NAME"
echo "run: corazon   (Ctrl-C to stop)"
