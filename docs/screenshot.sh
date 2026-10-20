#!/bin/bash
# Regenerates docs/screenshot.png: starts a headless GNOME Shell with a throwaway home
# folder and sample data, opens the extension's menu and captures the top-right corner.
# Needs --unsafe-mode so the Screenshot and Eval D-Bus calls are allowed.
set -euo pipefail

uuid="claude-usage@bardswork"
repo="$(cd "$(dirname "$0")/.." && pwd)"
out="$repo/docs/screenshot.png"
# Kept short: the Wayland socket path inside it must fit in 108 bytes
sandbox=$(mktemp -d)
cleanup() {
    for _ in 1 2 3 4 5; do
        for m in "$sandbox/run/doc" "$sandbox/run/gvfs"; do fusermount3 -u -q "$m" 2>/dev/null || true; done
        rm -rf "$sandbox" 2>/dev/null && return
        sleep 1
    done
}
trap cleanup EXIT

export HOME="$sandbox/home"
export XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share" XDG_CACHE_HOME="$HOME/.cache"
export XDG_RUNTIME_DIR="$sandbox/run"
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_CACHE_HOME/claude-usage" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
cp -r "$repo/$uuid" "$XDG_DATA_HOME/gnome-shell/extensions/"

now=$(date +%s)
data="$XDG_CACHE_HOME/claude-usage/statusline.json"
printf '{"rate_limits":{"five_hour":{"used_percentage":33,"resets_at":%d},"seven_day":{"used_percentage":63,"resets_at":%d}}}' \
    $((now + 7980)) $((now + 300000)) > "$data"
touch -d '-2 minutes' "$data"

call() { gdbus call --session -d org.gnome.Shell "$@" > /dev/null; }
export -f call
dbus-run-session -- bash -c "
    gsettings set org.gnome.shell enabled-extensions \"['$uuid']\"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.desktop.interface color-scheme prefer-dark
    gnome-shell --headless --wayland --no-x11 --unsafe-mode --virtual-monitor 1280x800 > '$sandbox/shell.log' 2>&1 &
    shell=\$!
    for _ in \$(seq 30); do
        gnome-extensions info $uuid 2>/dev/null | grep -q 'State: ACTIVE' && break
        sleep 1
    done
    sleep 3
    call -o /org/gnome/Shell -m org.gnome.Shell.Eval \"Main.overview.hide(); Main.panel.statusArea['$uuid'].menu.open();\"
    sleep 2
    call -o /org/gnome/Shell/Screenshot -m org.gnome.Shell.Screenshot.Screenshot false false '$sandbox/full.png'
    kill \$shell; wait \$shell 2>/dev/null || true
" > "$sandbox/session.log" 2>&1

gjs -c "
    imports.gi.versions.GdkPixbuf = '2.0';
    const {Pixbuf} = imports.gi.GdkPixbuf;
    Pixbuf.new_from_file('$sandbox/full.png').new_subpixbuf(580, 0, 700, 200).savev('$out', 'png', [], []);
"
echo "Wrote $out"
