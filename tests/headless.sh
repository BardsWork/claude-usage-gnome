#!/bin/bash
# Loads the extension in a headless GNOME Shell with a throwaway home folder, so the
# real desktop and settings are untouched. Passes if the extension reaches ACTIVE and
# the shell logs no errors for it.
set -euo pipefail

uuid="claude-usage@bardswork"
repo="$(cd "$(dirname "$0")/.." && pwd)"
sandbox=$(mktemp -d)
# The document portal (run/doc) and gvfs (run/gvfs) mount folders in the sandbox and can
# still hold them for a moment after the session ends
cleanup() {
    for _ in 1 2 3 4 5; do
        for m in "$sandbox/run/doc" "$sandbox/run/gvfs"; do fusermount3 -u -q "$m" 2>/dev/null || true; done
        rm -rf "$sandbox" 2>/dev/null && return
        sleep 1
    done
    echo "warning: could not remove $sandbox" >&2
}
trap cleanup EXIT

export HOME="$sandbox/home"
export XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share" XDG_CACHE_HOME="$HOME/.cache"
export XDG_RUNTIME_DIR="$sandbox/run"
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_CACHE_HOME/claude-usage" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
cp -r "$repo/$uuid" "$XDG_DATA_HOME/gnome-shell/extensions/"

if [[ "${1:-}" != "--no-data" ]]; then
    now=$(date +%s)
    printf '{"rate_limits":{"five_hour":{"used_percentage":33,"resets_at":%d},"seven_day":{"used_percentage":63,"resets_at":%d}}}' \
        $((now + 7200)) $((now + 300000)) > "$XDG_CACHE_HOME/claude-usage/statusline.json"
fi

dbus-run-session -- bash -c "
    gsettings set org.gnome.shell enabled-extensions \"['$uuid']\"
    gsettings set org.gnome.shell disable-user-extensions false
    gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800 > '$sandbox/shell.log' 2>&1 &
    shell=\$!
    for _ in \$(seq 30); do
        gnome-extensions info $uuid 2>/dev/null | grep -q 'State: ACTIVE' && break
        sleep 1
    done
    gnome-extensions info $uuid > '$sandbox/info.txt' 2>&1 || true
    kill \$shell; wait \$shell 2>/dev/null || true
" > "$sandbox/session.log" 2>&1

cat "$sandbox/info.txt"
errors=$(grep -i -E "$uuid|claude|JS ERROR|SyntaxError|ImportError" "$sandbox/shell.log" || true)
if grep -q 'State: ACTIVE' "$sandbox/info.txt" && [[ -z "$errors" ]]; then
    echo "PASS: extension loaded and active, no errors logged"
else
    echo "FAIL"
    echo "--- shell log matches ---"; echo "${errors:-none}"
    echo "--- shell log tail ---"; tail -30 "$sandbox/shell.log"
    exit 1
fi
