// Run with: TZ=UTC gjs -m tests/usage.test.js
import GLib from 'gi://GLib';
import System from 'system';

import {fableWindow, readFable, readUsage, resetText, windowText} from '../claude-usage@bardswork/usage.js';

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

GLib.unlink(path);
GLib.rmdir(tmp);
print(failed ? `\n${failed} failed` : '\nall passed');
System.exit(failed ? 1 : 0);
