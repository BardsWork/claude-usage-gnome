#!/bin/bash
# Regenerates the images in docs/: starts a headless GNOME Shell with a throwaway home
# folder and sample data, then captures
#   screenshot.png      the menu, with every row showing
#   notification.png    a limit notification
#   settings.png        the settings page
#   social-preview.png  the GitHub social preview, built around screenshot.png
# Needs --unsafe-mode so the Screenshot and Eval D-Bus calls are allowed.
set -euo pipefail

uuid="claude-usage@bardswork"
repo="$(cd "$(dirname "$0")/.." && pwd)"
docs="$repo/docs"
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
glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/schemas"

# Sample data: a weekly limit at a warning, with the optional usage report
now=$(date +%s)
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S+00:00; }
export now
statusline() {
    printf '{"rate_limits":{"five_hour":{"used_percentage":%d,"resets_at":%d},"seven_day":{"used_percentage":82,"resets_at":%d}},%s,"prompt_cache":{"warm":true,"caching_observed":true,"expires_at":%d,"hit_ratio":0.97}}' \
        "$1" $((now + 7980)) $((now + 300000)) \
        '"workspace":{"project_dir":"/home/me/code/my-app"},"model":{"display_name":"Opus 5.5"},"context_window":{"used_percentage":16,"context_window_size":1000000},"cost":{"total_cost_usd":4.7}' \
        $((now + 2520)) > "$XDG_CACHE_HOME/claude-usage/statusline.json"
    touch -d '-2 minutes' "$XDG_CACHE_HOME/claude-usage/statusline.json"
}
export -f statusline
statusline 33
week=$(iso $((now + 300000)))
cat > "$XDG_CACHE_HOME/claude-usage/usage.json" <<EOF
{
  "limits": [
    {"kind": "session", "percent": 33, "severity": "normal", "is_active": false},
    {"kind": "weekly_all", "percent": 82, "severity": "warning", "is_active": true},
    {"kind": "weekly_scoped", "percent": 15, "resets_at": "$week", "severity": "normal", "scope": {"model": {"display_name": "Fable"}}}
  ],
  "weekly_scoped_shares": [{"limit_index": 2, "used_percent_of_weekly": 7, "allowance_percent_of_weekly": 50}],
  "seven_day_breakdown": {"rows": [
    {"display_name": "Claude Code", "percent": 88}, {"display_name": "Chats", "percent": 9}, {"display_name": "Cowork", "percent": 3}
  ]},
  "cedar_ember": {"at_limit": false, "grants": [{"type": "full", "resets_left": 1, "usable_now": true, "ends_at": "$(iso $((now + 20 * 86400)))"}]}
}
EOF
touch -d '-3 minutes' "$XDG_CACHE_HOME/claude-usage/usage.json"

eval_js() { gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.gnome.Shell.Eval "$1"; }
shot() { gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell/Screenshot -m org.gnome.Shell.Screenshot.Screenshot false false "$1" > /dev/null; }
export -f eval_js shot
# Services the session starts inherit its output, so it goes to a file rather than a pipe
dbus-run-session -- bash -c "
    gsettings set org.gnome.shell enabled-extensions \"['$uuid']\"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.desktop.interface color-scheme prefer-dark
    # A plain background, so the crops have no stray wallpaper in them
    gsettings set org.gnome.desktop.background picture-options none
    gsettings set org.gnome.desktop.background primary-color '#241f31'
    gnome-shell --headless --wayland --no-x11 --unsafe-mode --virtual-monitor 1280x900 > '$sandbox/shell.log' 2>&1 &
    shell=\$!
    for _ in \$(seq 30); do
        gnome-extensions info $uuid 2>/dev/null | grep -q 'State: ACTIVE' && break
        sleep 1
    done
    sleep 3

    # The menu, with the weekly-by-surface submenu open. Prints the area to crop.
    eval_js \"Main.overview.hide();
        Main.panel.statusArea.dateMenu.hide();
        const b = Main.panel.statusArea['$uuid'];
        b.menu.open(false);
        b.menu._getMenuItems().find(i => i.setSubmenuShown).setSubmenuShown(true);\" > /dev/null
    sleep 2
    eval_js \"const b = Main.panel.statusArea['$uuid'];
        const [mx, my] = b.menu.actor.get_transformed_position();
        const [mw, mh] = b.menu.actor.get_transformed_size();
        const [bx] = b.get_transformed_position();
        [Math.floor(Math.min(mx, bx)), Math.ceil(my + mh)].join(' ')\" > '$sandbox/menu-area.txt'
    shot '$sandbox/menu.png'

    # The settings page
    eval_js \"Main.panel.statusArea['$uuid'].menu.close(false)\" > /dev/null
    gnome-extensions prefs $uuid > /dev/null 2>&1 &
    sleep 6
    eval_js \"const w = global.get_window_actors().map(a => a.meta_window).find(w => w.get_title() === 'Claude Usage');
        const r = w.get_frame_rect(); [r.x, r.y, r.width, r.height].join(' ')\" > '$sandbox/prefs-area.txt'
    shot '$sandbox/prefs.png'
    eval_js \"global.get_window_actors().map(a => a.meta_window).find(w => w.get_title() === 'Claude Usage').delete(global.get_current_time())\" > /dev/null
    sleep 1

    # A notification: the 5-hour window jumps past the critical percentage
    statusline 96
    eval_js \"Main.extensionManager.lookup('$uuid').stateObj._refresh()\" > /dev/null
    sleep 2
    shot '$sandbox/notification.png'

    kill \$shell; wait \$shell 2>/dev/null || true
" > "$sandbox/session.log" 2>&1

# Eval replies look like (true, '"580 412"')
area() { grep -o "'\"[0-9 ]*\"'" "$1" | tr -d "'\""; }
read -r menu_x menu_bottom < <(area "$sandbox/menu-area.txt")
read -r prefs_x prefs_y prefs_w prefs_h < <(area "$sandbox/prefs-area.txt")

# gjs can't read a module from stdin, so each script goes in a file first
cat > "$sandbox/crop.js" <<EOF
import GdkPixbuf from 'gi://GdkPixbuf';
const crop = (src, x, y, w, h, out) => GdkPixbuf.Pixbuf.new_from_file(src).new_subpixbuf(x, y, w, h).savev(out, 'png', [], []);
const menuX = Math.max(0, $menu_x - 24);
crop('$sandbox/menu.png', menuX, 0, 1280 - menuX, Math.min(900, $menu_bottom + 24), '$docs/screenshot.png');
crop('$sandbox/notification.png', 360, 24, 560, 128, '$docs/notification.png');
crop('$sandbox/prefs.png', $prefs_x, $prefs_y, $prefs_w, Math.min($prefs_h, 900 - $prefs_y), '$docs/settings.png');
EOF
gjs -m "$sandbox/crop.js"

# The social preview: title and tagline on the left, the menu screenshot on the right
cat > "$sandbox/preview.js" <<EOF
import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';

const W = 1280, H = 640, PAD = 56;
const surface = new Cairo.ImageSurface(Cairo.Format.RGB24, W, H);
const cr = new Cairo.Context(surface);
cr.setSourceRGB(0.118, 0.118, 0.125);
cr.paint();

// The menu, as tall as fits, on the right
const shot = Cairo.ImageSurface.createFromPNG('$docs/screenshot.png');
const scale = Math.min((H - 2 * PAD) / shot.getHeight(), 640 / shot.getWidth());
const sw = shot.getWidth() * scale, sh = shot.getHeight() * scale;
const sx = W - PAD - sw, sy = (H - sh) / 2;
cr.save();
cr.translate(sx, sy);
cr.scale(scale, scale);
cr.setSourceSurface(shot, 0, 0);
cr.paint();
cr.restore();
cr.setSourceRGB(0.3, 0.3, 0.32);
cr.setLineWidth(2);
cr.rectangle(sx - 1, sy - 1, sw + 2, sh + 2);
cr.stroke();

// Text on the left, wrapped to the space beside the menu
let y = 0;
const blocks = [];
function text(str, font, gray, gapAfter) {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(Pango.FontDescription.from_string(font));
    layout.set_width((sx - 2 * PAD) * Pango.SCALE);
    layout.set_wrap(Pango.WrapMode.WORD);
    layout.set_text(str, -1);
    const [, logical] = layout.get_pixel_extents();
    blocks.push({layout, gray, y});
    y += logical.height + gapAfter;
}
text('Claude Usage for GNOME', 'Ubuntu Bold 52', 0.96, 24);
text('Your Claude plan limits, in the top bar', 'Ubuntu 22', 0.75, 36);
text('Limits · pace · resets · alerts', 'Ubuntu 18', 0.6, 10);
text('GNOME Shell 50 · Claude Code', 'Ubuntu 18', 0.6, 10);
text('No API key needed', 'Ubuntu 18', 0.6, 0);
const top = (H - y) / 2;
for (const b of blocks) {
    cr.setSourceRGB(b.gray, b.gray, b.gray);
    cr.moveTo(PAD, top + b.y);
    PangoCairo.show_layout(cr, b.layout);
}
surface.writeToPNG('$docs/social-preview.png');
EOF
gjs -m "$sandbox/preview.js"
echo "Wrote $docs/screenshot.png, notification.png, settings.png and social-preview.png"
