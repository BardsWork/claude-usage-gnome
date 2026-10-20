import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Where the Claude Code status line hook writes its JSON (see statusline-snippet.sh). */
export const DEFAULT_FILE = GLib.build_filenamev([GLib.get_home_dir(), '.cache', 'claude-usage', 'statusline.json']);

/** Reads the saved status line JSON. Returns null if the file is missing or half written. */
export function readUsage(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const [, bytes] = file.load_contents(null);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        return {limits: data.rate_limits ?? {}, updated: info.get_modification_date_time().to_unix()};
    } catch {
        return null;
    }
}

/** A usage window ("five_hour" or "seven_day") as a short percentage. */
export function windowText(win, now) {
    if (!win) return '–';
    // After the reset time the saved percentage no longer applies
    if (win.resets_at && win.resets_at < now) return '0%';
    return `${Math.round(win.used_percentage)}%`;
}

/** When a usage window resets, in local time, plus how long until then. */
export function resetText(win, now) {
    if (!win?.resets_at) return 'unknown';
    if (win.resets_at < now) return 'already reset';
    const at = GLib.DateTime.new_from_unix_local(win.resets_at).format('%a %H:%M');
    const mins = Math.round((win.resets_at - now) / 60);
    const left = mins >= 24 * 60
        ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
        : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${at} (in ${left})`;
}
