import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Where the Claude Code status line hook writes its JSON (see statusline-snippet.sh). */
export const DEFAULT_FILE = GLib.build_filenamev([GLib.get_home_dir(), '.cache', 'claude-usage', 'statusline.json']);

/** Where the status line hook saves claude.ai's usage report, which has the Fable window. */
export const USAGE_REPORT_FILE = GLib.build_filenamev([GLib.get_home_dir(), '.cache', 'claude-usage', 'usage.json']);

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

/**
 * The Fable weekly window from a saved usage report, in the same shape as the status line's
 * windows ({used_percentage, resets_at} in Unix seconds). Null if there isn't one.
 */
export function fableWindow(report) {
    const row = (report?.limits ?? []).find(l =>
        l?.kind === 'weekly_scoped' && /^fable\b/i.test(String(l.scope?.model?.display_name ?? '')));
    if (typeof row?.percent !== 'number') return null;
    const resets = row.resets_at ? GLib.DateTime.new_from_iso8601(row.resets_at, null) : null;
    return {used_percentage: row.percent, resets_at: resets ? resets.to_unix() : null};
}

/** Reads the saved usage report. Null if the file is missing or half written. */
export function readReport(path) {
    try {
        const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

/** Reads the Fable weekly window from the saved usage report. Null if missing or unreadable. */
export function readFable(path) {
    return fableWindow(readReport(path));
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

const RESET_KINDS = {session: '5-hour', weekly: 'weekly', full: 'full'};

/**
 * The limit resets left to use (the ones /limit-reset spends), from a saved usage report's
 * cedar_ember field: [{kind, left, ends_at}] with ends_at in Unix seconds or null. Grants that
 * are used up, paused or past their end date are left out. Empty if there are none.
 */
export function resetGrants(report, now) {
    const grants = report?.cedar_ember?.grants;
    if (!Array.isArray(grants)) return [];
    return grants.flatMap(g => {
        if (!Number.isInteger(g?.resets_left) || g.resets_left < 1 || g.paused) return [];
        const ends = g.ends_at ? GLib.DateTime.new_from_iso8601(g.ends_at, null) : null;
        const ends_at = ends ? ends.to_unix() : null;
        if (ends_at !== null && ends_at <= now) return [];
        return [{kind: RESET_KINDS[g.type] ?? 'limit', left: g.resets_left, ends_at}];
    });
}

/** Reads the limit resets left from the saved usage report. Empty if missing or unreadable. */
export function readResets(path, now) {
    return resetGrants(readReport(path), now);
}

/** Limit resets as one line, for example "1 full reset, use by Thu Dec 10". */
export function resetsText(grants) {
    return grants.map(g => {
        const what = `${g.left} ${g.kind} reset${g.left === 1 ? '' : 's'}`;
        if (g.ends_at === null) return what;
        return `${what}, use by ${GLib.DateTime.new_from_unix_local(g.ends_at).format('%a %b %-d')}`;
    }).join('; ');
}

/** Window lengths in seconds, for the pace. */
export const WINDOW_SECONDS = {five_hour: 5 * 3600, seven_day: 7 * 86400};

const LEVELS = ['normal', 'warning', 'critical'];
// Used percentages at which a window counts as a warning or critical without a server severity
const WARNING_PERCENT = 80;
const CRITICAL_PERCENT = 95;

/**
 * The server's severity and whether it's the limit that applies now, for the session, weekly
 * and Fable rows of a saved usage report: {five_hour, seven_day, fable}, each
 * {severity, active} or missing.
 */
export function limitStates(report) {
    const states = {};
    for (const l of Array.isArray(report?.limits) ? report.limits : []) {
        let key = null;
        if (l?.kind === 'session') key = 'five_hour';
        else if (l?.kind === 'weekly_all') key = 'seven_day';
        else if (l?.kind === 'weekly_scoped' && /^fable\b/i.test(String(l.scope?.model?.display_name ?? ''))) key = 'fable';
        if (key && !states[key])
            states[key] = {severity: typeof l.severity === 'string' ? l.severity : null, active: l.is_active === true};
    }
    return states;
}

/**
 * How close a window is to its limit: 'normal', 'warning' or 'critical'. The worse of the
 * server's severity (anything but 'normal' counts as a warning) and the used percentage.
 */
export function limitLevel(win, severity, now) {
    if (!win || (win.resets_at && win.resets_at < now)) return 'normal';
    const pct = win.used_percentage;
    let level = pct >= CRITICAL_PERCENT ? 2 : pct >= WARNING_PERCENT ? 1 : 0;
    if (typeof severity === 'string' && severity !== 'normal') level = Math.max(level, 1);
    return LEVELS[level];
}

/** The worse of several levels from limitLevel(). */
export function worstLevel(...levels) {
    return LEVELS[Math.max(0, ...levels.map(l => LEVELS.indexOf(l)))];
}

/** Where this week's usage went, by surface: [{name, percent}], largest first. Empty if none. */
export function breakdown(report) {
    const rows = report?.seven_day_breakdown?.rows;
    if (!Array.isArray(rows)) return [];
    return rows
        .filter(r => typeof r?.percent === 'number' && typeof (r.display_name ?? r.key) === 'string')
        .map(r => ({name: r.display_name ?? r.key, percent: r.percent}))
        .sort((a, b) => b.percent - a.percent);
}

/**
 * Whether a window is being used faster than it refills: '' when it's too early in the window
 * to tell or the window is unknown, else 'below pace', 'on pace', 'at limit', or 'above pace'
 * with the time it would hit the limit at this rate.
 */
export function paceText(win, length, now) {
    if (!win?.resets_at || !length || win.resets_at < now) return '';
    const elapsed = length - (win.resets_at - now);
    // Too early in the window, the ratio is noise
    if (elapsed < length * 0.1) return '';
    const used = win.used_percentage;
    if (used >= 100) return 'at limit';
    const ratio = used / (elapsed / length * 100);
    if (ratio < 0.9) return 'below pace';
    if (ratio <= 1.1) return 'on pace';
    // Above pace always hits the limit before the reset: (100 - used) / rate < time left
    const hitAt = Math.round(now + (100 - used) / (used / elapsed));
    return `above pace, limit around ${GLib.DateTime.new_from_unix_local(hitAt).format('%a %H:%M')}`;
}
