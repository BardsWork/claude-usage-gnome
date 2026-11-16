// Run with: TZ=UTC gjs -m tests/usage.test.js
import GLib from 'gi://GLib';
import System from 'system';

import {
    DEFAULT_THRESHOLDS, WINDOW_SECONDS, ageText, breakdown, cacheText, fableWindow, limitLevel, limitStates, paceText, readFable, readReport,
    pendingAlerts, readReportFile, readResets, readUsage, resetGrants, resetState, resetText, resetUsableAtLimit, resetsText,
    sessionText, shareText, tokensText, windowText, worstLevel,
} from '../claude-usage@bardswork/usage.js';

let failed = 0;
function test(name, fn) {
    try {
        fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}\n     ${e.message}`);
    }
}
function equal(actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}

// 2026-10-20 12:00:00 UTC
const NOW = 1792497600;
const tmp = GLib.dir_make_tmp('claude-usage-XXXXXX');
const path = GLib.build_filenamev([tmp, 'statusline.json']);

test('windowText: no window shows a dash', () => equal(windowText(undefined, NOW), '–'));
test('windowText: rounds the percentage', () => equal(windowText({used_percentage: 33.6, resets_at: NOW + 60}, NOW), '34%'));
test('windowText: past the reset time shows 0%', () => equal(windowText({used_percentage: 80, resets_at: NOW - 1}, NOW), '0%'));
test('windowText: no reset time keeps the percentage', () => equal(windowText({used_percentage: 5}, NOW), '5%'));

test('resetText: no reset time', () => equal(resetText({used_percentage: 5}, NOW), 'unknown'));
test('resetText: past reset', () => equal(resetText({resets_at: NOW - 60}, NOW), 'already reset'));
test('resetText: hours and minutes', () => equal(resetText({resets_at: NOW + 2 * 3600 + 5 * 60}, NOW), 'Tue 14:05 (in 2h 5m)'));
test('resetText: days and hours', () => equal(resetText({resets_at: NOW + 3 * 86400 + 4 * 3600}, NOW), 'Fri 16:00 (in 3d 4h)'));

test('readUsage: missing file returns null', () => equal(readUsage(path), null));

test('readUsage: half-written file returns null', () => {
    GLib.file_set_contents(path, '{"rate_limits": {"five_');
    equal(readUsage(path), null);
});

test('readUsage: reads rate limits and modified time', () => {
    const limits = {five_hour: {used_percentage: 33, resets_at: 1}, seven_day: {used_percentage: 63, resets_at: 2}};
    GLib.file_set_contents(path, JSON.stringify({model: {id: 'x'}, rate_limits: limits}));
    const usage = readUsage(path);
    equal(usage.limits, limits);
    equal(usage.data.model, {id: 'x'});
    const now = Math.floor(GLib.DateTime.new_now_local().to_unix());
    if (Math.abs(now - usage.updated) > 5) throw new Error(`modified time ${usage.updated} is not about now (${now})`);
});

test('readUsage: no rate_limits gives empty limits', () => {
    GLib.file_set_contents(path, JSON.stringify({model: {id: 'x'}}));
    equal(readUsage(path).limits, {});
});

const report = {limits: [
    {kind: 'session', group: 'session', percent: 81, resets_at: '2026-10-20T14:00:00+00:00', scope: null},
    {kind: 'weekly_all', group: 'weekly', percent: 12, resets_at: '2026-10-23T21:00:00+00:00', scope: null},
    {kind: 'weekly_scoped', group: 'weekly', percent: 15, resets_at: '2026-10-23T21:00:00.228189+00:00',
        scope: {model: {id: null, display_name: 'Fable'}, surface: null}},
]};

test('fableWindow: picks the Fable weekly row', () => equal(fableWindow(report), {used_percentage: 15, resets_at: 1792789200}));
test('fableWindow: works with the status line helpers', () => {
    const win = fableWindow(report);
    equal(windowText(win, NOW), '15%');
    equal(resetText(win, NOW), 'Fri 21:00 (in 3d 9h)');
});
test('fableWindow: no Fable row gives null', () => equal(fableWindow({limits: report.limits.slice(0, 2)}), null));
test('fableWindow: ignores other scoped models', () => equal(fableWindow({limits: [
    {kind: 'weekly_scoped', percent: 40, resets_at: null, scope: {model: {display_name: 'Sonnet'}}},
]}), null));
test('fableWindow: no reset time', () => equal(fableWindow({limits: [
    {kind: 'weekly_scoped', percent: 3, resets_at: null, scope: {model: {display_name: 'Fable'}}},
]}), {used_percentage: 3, resets_at: null}));
test('fableWindow: missing or odd report gives null', () => {
    equal(fableWindow(null), null);
    equal(fableWindow({}), null);
    equal(fableWindow({limits: [null, 'x']}), null);
});

test('readFable: missing file returns null', () => equal(readFable(path), null));
test('readFable: reads the saved report', () => {
    GLib.file_set_contents(path, JSON.stringify(report));
    equal(readFable(path), {used_percentage: 15, resets_at: 1792789200});
});
test('readFable: half-written file returns null', () => {
    GLib.file_set_contents(path, '{"limits": [{"kind"');
    equal(readFable(path), null);
});

const grant = {
    id: 'full-reset-2610', label: 'One full limit reset', resets_total: 1, resets_left: 1,
    starts_at: '2026-10-10T21:30:00+00:00', ends_at: '2026-11-10T22:00:00+00:00',
    clears: ['five_hour', 'seven_day'], paused: false, usable_now: true, type: 'full',
};
const withResets = {...report, cedar_ember: {eligible: true, grants: [
    grant,
    {...grant, id: 'used', resets_left: 0},
    {...grant, id: 'expired', ends_at: '2026-10-20T11:00:00+00:00'},
    {...grant, id: 'paused', paused: true},
    {...grant, id: 'session', type: 'session', resets_left: 2, ends_at: null},
]}};

test('resetGrants: keeps grants with resets left', () => equal(resetGrants(withResets, NOW), [
    {kind: 'full', left: 1, ends_at: 1794348000, usable: true, blocker: null},
    {kind: '5-hour', left: 2, ends_at: null, usable: true, blocker: null},
]));
test('resetGrants: unknown type is a limit reset', () =>
    equal(resetGrants({cedar_ember: {grants: [{...grant, type: 'new_kind'}]}}, NOW), [
        {kind: 'limit', left: 1, ends_at: 1794348000, usable: true, blocker: null},
    ]));
test('resetGrants: why a grant is not usable', () => equal(resetGrants({cedar_ember: {grants: [
    {...grant, usable_now: false, unavailable_reason: 'blocked_seven_day'},
    {...grant, usable_now: false, unavailable_reason: 'something_new'},
    {...grant, usable_now: false},
]}}, NOW).map(g => [g.usable, g.blocker]), [
    [false, 'blocked by the weekly limit'], [false, 'not available right now'], [false, null],
]));
test('resetGrants: no cedar_ember or odd data gives none', () => {
    equal(resetGrants(report, NOW), []);
    equal(resetGrants(null, NOW), []);
    equal(resetGrants({cedar_ember: null}, NOW), []);
    equal(resetGrants({cedar_ember: {eligible: false, grants: []}}, NOW), []);
    equal(resetGrants({cedar_ember: {grants: [null, 'x', {resets_left: '1'}]}}, NOW), []);
});
test('resetsText: one line per grant', () => equal(resetsText(resetGrants(withResets, NOW)),
    '1 full reset, use by Tue Nov 10; 2 5-hour resets'));
test('resetsText: says why a reset is not usable', () => equal(resetsText([
    {kind: 'full', left: 1, ends_at: null, usable: false, blocker: 'cooling down'},
    {kind: 'weekly', left: 1, ends_at: null, usable: false, blocker: null},
]), '1 full reset (cooling down); 1 weekly reset (not usable yet)'));

const usable = [{kind: 'full', left: 1, ends_at: null, usable: true, blocker: null}];
test('resetState: at limit and cooldown', () => {
    equal(resetState({cedar_ember: {at_limit: true, cooldown_until: '2026-10-20T14:00:00+00:00'}}),
        {at_limit: true, cooldown_until: NOW + 7200});
    equal(resetState(null), {at_limit: false, cooldown_until: null});
    equal(resetState({cedar_ember: {at_limit: 'yes', cooldown_until: 'soon'}}), {at_limit: false, cooldown_until: null});
});
test('resetsText: at a limit with a usable reset', () => {
    const state = {at_limit: true, cooldown_until: null};
    equal(resetUsableAtLimit(usable, state), true);
    equal(resetsText(usable, state, NOW), 'at a limit, run /limit-reset · 1 full reset');
});
test('resetsText: at a limit without a usable reset', () => {
    const blocked = [{...usable[0], usable: false, blocker: 'cooling down'}];
    equal(resetUsableAtLimit(blocked, {at_limit: true}), false);
    equal(resetsText(blocked, {at_limit: true}, NOW), '1 full reset (cooling down)');
});
test('resetsText: cooldown time, only while it lasts', () => {
    equal(resetsText(usable, {at_limit: true, cooldown_until: NOW + 7200}, NOW),
        'next usable after Tue 14:00 · 1 full reset');
    equal(resetsText(usable, {at_limit: false, cooldown_until: NOW - 60}, NOW), '1 full reset');
});

const shared = {...report, weekly_scoped_shares: [
    {limit_index: 0, used_percent_of_weekly: 99, allowance_percent_of_weekly: 99},
    {limit_index: 2, used_percent_of_weekly: 7.6, allowance_percent_of_weekly: 50},
]};
test('fableWindow: adds Fable\'s share of the weekly limit', () => equal(fableWindow(shared),
    {used_percentage: 15, resets_at: 1792789200, share_used: 7.6, share_allowance: 50}));
test('fableWindow: ignores shares for other rows or with odd values', () => {
    equal(fableWindow({...report, weekly_scoped_shares: [{limit_index: 5, used_percent_of_weekly: 1, allowance_percent_of_weekly: 50}]}),
        {used_percentage: 15, resets_at: 1792789200});
    equal(fableWindow({...report, weekly_scoped_shares: [{limit_index: 2, used_percent_of_weekly: '1'}]}),
        {used_percentage: 15, resets_at: 1792789200});
    equal(fableWindow({...report, weekly_scoped_shares: 'x'}), {used_percentage: 15, resets_at: 1792789200});
});
test('shareText: share of weekly', () => {
    equal(shareText(fableWindow(shared)), '8% of weekly, cap 50%');
    equal(shareText(fableWindow(report)), '');
});

test('ageText: minutes, hours, days', () => {
    equal(ageText(30), '1 min');
    equal(ageText(4 * 60), '4 min');
    equal(ageText(119 * 60), '119 min');
    equal(ageText(3 * 3600), '3 h');
    equal(ageText(3 * 86400), '3 d');
    equal(ageText(-10), '0 min');
});

test('readResets: missing file gives none', () => {
    GLib.unlink(path);
    equal(readResets(path, NOW), []);
});
test('readResets: reads the saved report', () => {
    GLib.file_set_contents(path, JSON.stringify(withResets));
    equal(readResets(path, NOW).length, 2);
});
test('readResets: half-written file gives none', () => {
    GLib.file_set_contents(path, '{"cedar_ember": {"gra');
    equal(readResets(path, NOW), []);
});

test('readReportFile: report and modified time', () => {
    GLib.file_set_contents(path, JSON.stringify(report));
    const file = readReportFile(path);
    equal(file.report, report);
    const now = Math.floor(GLib.DateTime.new_now_local().to_unix());
    if (Math.abs(now - file.updated) > 5) throw new Error(`modified time ${file.updated} is not about now (${now})`);
});
test('readReport: missing or half-written file returns null', () => {
    GLib.unlink(path);
    equal(readReport(path), null);
    GLib.file_set_contents(path, '{"limits": [');
    equal(readReport(path), null);
});

const states = {limits: [
    {kind: 'session', percent: 81, severity: 'normal', is_active: false},
    {kind: 'weekly_all', percent: 12, severity: 'warning', is_active: true},
    {kind: 'weekly_scoped', percent: 15, severity: 'normal', scope: {model: {display_name: 'Sonnet'}}},
    {kind: 'weekly_scoped', percent: 15, scope: {model: {display_name: 'Fable'}}},
]};
test('limitStates: severity and active per window', () => equal(limitStates(states), {
    five_hour: {severity: 'normal', active: false},
    seven_day: {severity: 'warning', active: true},
    fable: {severity: null, active: false},
}));
test('limitStates: missing or odd report gives none', () => {
    equal(limitStates(null), {});
    equal(limitStates({limits: 'x'}), {});
    equal(limitStates({limits: [null, {kind: 'other'}]}), {});
});

const at = pct => ({used_percentage: pct, resets_at: NOW + 3600});
test('limitLevel: from the used percentage', () => {
    equal(limitLevel(at(50), null, NOW), 'normal');
    equal(limitLevel(at(80), null, NOW), 'warning');
    equal(limitLevel(at(95), 'normal', NOW), 'critical');
});
test('limitLevel: any severity but normal is at least a warning', () => {
    equal(limitLevel(at(10), 'warning', NOW), 'warning');
    equal(limitLevel(at(10), 'something_new', NOW), 'warning');
    equal(limitLevel(at(97), 'warning', NOW), 'critical');
});
test('limitLevel: past the reset or no window is normal', () => {
    equal(limitLevel({used_percentage: 99, resets_at: NOW - 1}, 'critical', NOW), 'normal');
    equal(limitLevel(undefined, 'warning', NOW), 'normal');
});
test('worstLevel: picks the worse', () => {
    equal(worstLevel('normal', 'warning'), 'warning');
    equal(worstLevel('critical', 'warning'), 'critical');
    equal(worstLevel(), 'normal');
});

test('breakdown: rows by share, largest first', () => equal(breakdown({seven_day_breakdown: {rows: [
    {key: 'chat', display_name: 'Chats', percent: 0},
    {key: 'claude_code', display_name: 'Claude Code', percent: 95},
    {key: 'cowork', display_name: 'Cowork', percent: 5},
]}}), [{name: 'Claude Code', percent: 95}, {name: 'Cowork', percent: 5}, {name: 'Chats', percent: 0}]));
test('breakdown: falls back to the key and skips odd rows', () => equal(breakdown({seven_day_breakdown: {rows: [
    {key: 'new_surface', percent: 7}, null, {display_name: 'x'}, {key: 'y', percent: '3'},
]}}), [{name: 'new_surface', percent: 7}]));
test('breakdown: missing gives none', () => {
    equal(breakdown(null), []);
    equal(breakdown({seven_day_breakdown: null}), []);
});

// Halfway through a 5-hour window
const half = pct => ({used_percentage: pct, resets_at: NOW + WINDOW_SECONDS.five_hour / 2});
test('paceText: below, on and above pace', () => {
    equal(paceText(half(20), WINDOW_SECONDS.five_hour, NOW), 'below pace');
    equal(paceText(half(50), WINDOW_SECONDS.five_hour, NOW), 'on pace');
    // 80% in 2.5h is 32%/h, so the last 20% takes 37.5 more minutes
    equal(paceText(half(80), WINDOW_SECONDS.five_hour, NOW), 'above pace, limit around Tue 12:37');
});
test('paceText: at the limit', () => equal(paceText(half(100), WINDOW_SECONDS.five_hour, NOW), 'at limit'));
test('paceText: nothing early in the window, after the reset or without a reset time', () => {
    equal(paceText({used_percentage: 30, resets_at: NOW + 17000}, WINDOW_SECONDS.five_hour, NOW), '');
    equal(paceText({used_percentage: 30, resets_at: NOW - 1}, WINDOW_SECONDS.five_hour, NOW), '');
    equal(paceText({used_percentage: 30}, WINDOW_SECONDS.five_hour, NOW), '');
    equal(paceText(undefined, WINDOW_SECONDS.five_hour, NOW), '');
});
test('paceText: weekly window', () => equal(
    paceText({used_percentage: 13, resets_at: NOW + 5 * 86400}, WINDOW_SECONDS.seven_day, NOW), 'below pace'));

const session = {
    workspace: {project_dir: '/home/me/code/my-repo', current_dir: '/home/me/code/my-repo/src'},
    model: {id: 'claude-opus-5-5', display_name: 'Opus 5.5'},
    context_window: {used_percentage: 16.4, context_window_size: 1000000},
    cost: {total_cost_usd: 4.7013674},
    prompt_cache: {warm: true, caching_observed: true, expires_at: NOW + 42 * 60 - 30, hit_ratio: 0.987},
};
test('tokensText: short forms', () => {
    equal(tokensText(1000000), '1M');
    equal(tokensText(1500000), '1.5M');
    equal(tokensText(200000), '200k');
    equal(tokensText(850), '850');
});
test('sessionText: project, model, context and cost', () => equal(sessionText(session),
    'my-repo · Opus 5.5 · context 16% of 1M · $4.70 at API prices'));
test('sessionText: leaves out what is missing', () => {
    equal(sessionText({model: {display_name: 'Haiku 5.5'}, context_window: {used_percentage: 3}}), 'Haiku 5.5 · context 3%');
    equal(sessionText({cwd: '/tmp/x'}), 'x');
    equal(sessionText({}), '');
    equal(sessionText(null), '');
});
test('cacheText: warm, with time left and hit ratio', () => equal(cacheText(session, NOW), 'warm for 42m · 99% hits'));
test('cacheText: over an hour left', () => equal(
    cacheText({prompt_cache: {warm: true, expires_at: NOW + 65 * 60}}, NOW), 'warm for 1h 5m'));
test('cacheText: cold after it expires', () => equal(
    cacheText({prompt_cache: {warm: true, expires_at: NOW - 3600, hit_ratio: 0.5}}, NOW), 'cold since Tue 11:00 · 50% hits'));
test('cacheText: cold when the session says so', () => equal(
    cacheText({prompt_cache: {warm: false, expires_at: NOW + 600}}, NOW), 'cold since Tue 12:00'));
test('cacheText: nothing without a cache', () => {
    equal(cacheText({}, NOW), '');
    equal(cacheText({prompt_cache: {caching_observed: false, expires_at: NOW + 60}}, NOW), '');
    equal(cacheText({prompt_cache: {warm: true, expires_at: '2026-10-20T13:00:00Z'}}, NOW), '');
});

test('limitLevel: custom thresholds', () => {
    equal(DEFAULT_THRESHOLDS, {warning: 80, critical: 95});
    equal(limitLevel(at(70), null, NOW, {warning: 60, critical: 90}), 'warning');
    equal(limitLevel(at(90), null, NOW, {warning: 60, critical: 90}), 'critical');
});

const ALL = {limits: true, resets: true, expiring: true};
const five = (pct, resets_at = NOW + 3600, now = NOW) => {
    const win = {used_percentage: pct, resets_at};
    return [{key: 'five_hour', name: '5-hour', win, level: limitLevel(win, null, now)}];
};
const titles = r => r.alerts.map(a => a.title);
test('pendingAlerts: one alert per level reached', () => {
    let r = pendingAlerts(five(50), [], {}, NOW, ALL);
    equal(titles(r), []);
    r = pendingAlerts(five(82), [], r.sent, NOW, ALL);
    equal(titles(r), ['5-hour limit at 82%']);
    equal(r.alerts[0].body, 'Resets Tue 13:00 (in 1h 0m).');
    r = pendingAlerts(five(88), [], r.sent, NOW, ALL);
    equal(titles(r), []);
    r = pendingAlerts(five(96), [], r.sent, NOW, ALL);
    equal(titles(r), ['5-hour limit at 96%']);
    r = pendingAlerts(five(97), [], r.sent, NOW, ALL);
    equal(titles(r), []);
});
test('pendingAlerts: jumping straight to critical sends one alert', () =>
    equal(titles(pendingAlerts(five(99), [], {}, NOW, ALL)), ['5-hour limit at 99%']));
test('pendingAlerts: reset after a warning, once', () => {
    let r = pendingAlerts(five(90), [], {}, NOW, ALL);
    // The saved reset time passes before Claude Code reports the new window
    const later = NOW + 3660;
    r = pendingAlerts(five(90, NOW + 3600, later), [], r.sent, later, ALL);
    equal(titles(r), ['5-hour limit has reset']);
    equal(r.alerts[0].body, 'It was at 90%.');
    r = pendingAlerts(five(90, NOW + 3600, later), [], r.sent, later, ALL);
    equal(titles(r), []);
    r = pendingAlerts(five(5, later + 18000, later), [], r.sent, later, ALL);
    equal(titles(r), []);
});
test('pendingAlerts: reset seen only as a new window', () => {
    let r = pendingAlerts(five(90, NOW - 60, NOW - 120), [], {}, NOW - 120, ALL);
    r = pendingAlerts(five(3, NOW + 18000), [], r.sent, NOW, ALL);
    equal(titles(r), ['5-hour limit has reset']);
});
test('pendingAlerts: no reset alert without a warning first', () => {
    let r = pendingAlerts(five(40), [], {}, NOW, ALL);
    r = pendingAlerts(five(40, NOW + 3600, NOW + 3660), [], r.sent, NOW + 3660, ALL);
    equal(titles(r), []);
});
test('pendingAlerts: a window missing for a refresh does not alert again', () => {
    let r = pendingAlerts(five(85), [], {}, NOW, ALL);
    r = pendingAlerts([], [], r.sent, NOW, ALL);
    r = pendingAlerts(five(85), [], r.sent, NOW, ALL);
    equal(titles(r), []);
});
test('pendingAlerts: options turn kinds off but still track them', () => {
    const off = {limits: false, resets: false, expiring: false};
    let r = pendingAlerts(five(90), [], {}, NOW, off);
    equal(titles(r), []);
    r = pendingAlerts(five(90), [], r.sent, NOW, ALL);
    equal(titles(r), []);
});
test('pendingAlerts: limit reset expiring within a day, once', () => {
    const grants = [
        {kind: 'full', left: 1, ends_at: NOW + 3 * 3600, usable: true, blocker: null},
        {kind: 'weekly', left: 1, ends_at: NOW + 3 * 86400, usable: true, blocker: null},
        {kind: '5-hour', left: 2, ends_at: null, usable: true, blocker: null},
    ];
    let r = pendingAlerts([], grants, {}, NOW, ALL);
    equal(titles(r), ['1 full reset expiring']);
    equal(r.alerts[0].body, "Use by Tue 15:00 with /limit-reset in Claude Code, or it's lost.");
    r = pendingAlerts([], grants, r.sent, NOW, ALL);
    equal(titles(r), []);
});

if (GLib.file_test(path, GLib.FileTest.EXISTS)) GLib.unlink(path);
GLib.rmdir(tmp);
print(failed ? `\n${failed} failed` : '\nall passed');
System.exit(failed ? 1 : 0);
