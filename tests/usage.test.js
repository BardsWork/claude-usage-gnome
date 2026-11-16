// Run with: TZ=UTC gjs -m tests/usage.test.js
import GLib from 'gi://GLib';
import System from 'system';

import {
    WINDOW_SECONDS, breakdown, fableWindow, limitLevel, limitStates, paceText, readFable, readReport, readResets,
    readUsage, resetGrants, resetText, resetsText, windowText, worstLevel,
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
    {kind: 'full', left: 1, ends_at: 1794348000},
    {kind: '5-hour', left: 2, ends_at: null},
]));
test('resetGrants: unknown type is a limit reset', () =>
    equal(resetGrants({cedar_ember: {grants: [{...grant, type: 'new_kind'}]}}, NOW), [
        {kind: 'limit', left: 1, ends_at: 1794348000},
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

if (GLib.file_test(path, GLib.FileTest.EXISTS)) GLib.unlink(path);
GLib.rmdir(tmp);
print(failed ? `\n${failed} failed` : '\nall passed');
System.exit(failed ? 1 : 0);
