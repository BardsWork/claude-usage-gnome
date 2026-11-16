import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    DEFAULT_FILE, USAGE_REPORT_FILE, WINDOW_SECONDS, ageText, breakdown, cacheText, fableWindow, limitLevel, limitStates,
    paceText, pendingAlerts, readReportFile, readUsage, resetGrants, resetState, resetText, resetUsableAtLimit, resetsText, sessionText,
    shareText, windowText, worstLevel,
} from './usage.js';

const REFRESH_SECONDS = 30;
// Older than this, the numbers may be out of date (no Claude Code session running)
const STALE_SECONDS = 15 * 60;
// The usage report is fetched at most every 5 minutes. Much older, the fetch is probably failing
const REPORT_STALE_SECONDS = 30 * 60;
const DIMMED = 140;
const LEVEL_CLASSES = ['claude-usage-warning', 'claude-usage-critical'];

/** Colors an actor for a level from limitLevel(), and bolds it when it's the active limit. */
function setLevel(actor, level, active = false) {
    for (const c of LEVEL_CLASSES) actor.remove_style_class_name(c);
    if (level !== 'normal') actor.add_style_class_name(`claude-usage-${level}`);
    if (active) actor.add_style_class_name('claude-usage-active');
    else actor.remove_style_class_name('claude-usage-active');
}

/** A menu row's text: the percentage, any detail, the reset time and, when there is one, the pace. */
function rowText(name, win, length, now, detail = '') {
    const pace = paceText(win, length, now);
    return `${name}: ${windowText(win, now)} used${detail ? ` (${detail})` : ''}, ` +
        `resets ${resetText(win, now)}${pace ? ` · ${pace}` : ''}`;
}

export default class ClaudeUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChanged = this._settings.connect('changed', () => this._refresh());
        // What has been notified already. Null until the first refresh, which only records the
        // state so logging in doesn't notify about limits reached earlier.
        this._sent = null;
        this._button = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._label = new St.Label({text: 'Claude …', y_align: Clutter.ActorAlign.CENTER});
        this._button.add_child(this._label);

        this._fiveItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._weekItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        // Only shown when the saved usage report has this week's split by surface
        this._breakdownItem = new PopupMenu.PopupSubMenuMenuItem('Weekly by surface');
        this._breakdownItem.visible = false;
        // Only shown when the status line hook has saved a usage report with a Fable window
        this._fableItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._fableItem.visible = false;
        // Only shown when the saved usage report lists limit resets left to use
        this._resetsItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._resetsItem.visible = false;
        // The Claude Code session that refreshed the status line last, when the JSON has it
        this._sessionSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this._sessionItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._cacheItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        for (const item of [this._sessionSeparator, this._sessionItem, this._cacheItem]) item.visible = false;
        this._ageItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._button.menu.addMenuItem(this._fiveItem);
        this._button.menu.addMenuItem(this._weekItem);
        this._button.menu.addMenuItem(this._breakdownItem);
        this._button.menu.addMenuItem(this._fableItem);
        this._button.menu.addMenuItem(this._resetsItem);
        this._button.menu.addMenuItem(this._sessionSeparator);
        this._button.menu.addMenuItem(this._sessionItem);
        this._button.menu.addMenuItem(this._cacheItem);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._button.menu.addMenuItem(this._ageItem);

        Main.panel.addToStatusArea(this.uuid, this._button);

        // A button to the preferences at the bottom of the menu
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._button.menu.addAction('Settings', () => this.openPreferences());

        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = null;
        if (this._settingsChanged) this._settings.disconnect(this._settingsChanged);
        this._settingsChanged = null;
        this._settings = null;
        this._sent = null;
        this._source?.destroy();
        this._source = null;
        this._button?.destroy();
        this._button = null;
    }

    _refresh() {
        const usage = readUsage(DEFAULT_FILE);
        if (!usage) {
            this._label.text = 'Claude –';
            this._fiveItem.label.text = '';
            this._weekItem.label.text = '';
            setLevel(this._label, 'normal');
            this._breakdownItem.visible = false;
            this._fableItem.visible = false;
            this._resetsItem.visible = false;
            for (const item of [this._sessionSeparator, this._sessionItem, this._cacheItem]) item.visible = false;
            this._ageItem.label.text = 'No data yet: start Claude Code';
            return;
        }
        const now = Math.floor(GLib.DateTime.new_now_local().to_unix());
        const {five_hour: five, seven_day: week} = usage.limits;
        const age = now - usage.updated;

        const reportFile = readReportFile(USAGE_REPORT_FILE);
        const report = reportFile?.report ?? null;
        const reportAge = reportFile ? now - reportFile.updated : null;
        // Rows from the usage report dim when it's much older than it should be
        const reportOpacity = reportAge !== null && reportAge > REPORT_STALE_SECONDS ? DIMMED : 255;
        const states = limitStates(report);
        const fable = fableWindow(report);
        const thresholds = {
            warning: this._settings.get_int('warning-percent'),
            critical: this._settings.get_int('critical-percent'),
        };
        const fiveLevel = limitLevel(five, states.five_hour?.severity, now, thresholds);
        const weekLevel = limitLevel(week, states.seven_day?.severity, now, thresholds);
        const fableLevel = limitLevel(fable, states.fable?.severity, now, thresholds);

        this._label.text = `Claude ${windowText(five, now)} · ${windowText(week, now)}`;
        this._label.opacity = age > STALE_SECONDS ? DIMMED : 255;
        setLevel(this._label, worstLevel(fiveLevel, weekLevel));

        this._fiveItem.label.text = rowText('5-hour', five, WINDOW_SECONDS.five_hour, now);
        setLevel(this._fiveItem.label, fiveLevel, states.five_hour?.active);
        this._weekItem.label.text = rowText('Weekly', week, WINDOW_SECONDS.seven_day, now);
        setLevel(this._weekItem.label, weekLevel, states.seven_day?.active);

        const surfaces = breakdown(report);
        this._breakdownItem.visible = surfaces.length > 0;
        this._breakdownItem.opacity = reportOpacity;
        this._breakdownItem.menu.removeAll();
        for (const {name, percent} of surfaces)
            this._breakdownItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(`${name}: ${Math.round(percent)}%`, {reactive: false}));

        this._fableItem.visible = fable !== null;
        this._fableItem.opacity = reportOpacity;
        if (fable) {
            this._fableItem.label.text = rowText('Fable weekly', fable, WINDOW_SECONDS.seven_day, now, shareText(fable));
            setLevel(this._fableItem.label, fableLevel, states.fable?.active);
        }
        const resets = resetGrants(report, now);
        const state = resetState(report);
        this._resetsItem.visible = resets.length > 0;
        this._resetsItem.opacity = reportOpacity;
        if (resets.length) {
            this._resetsItem.label.text = `Limit resets: ${resetsText(resets, state, now)}`;
            // At a limit with a reset you can use is when this row matters
            setLevel(this._resetsItem.label, resetUsableAtLimit(resets, state) ? 'warning' : 'normal');
        }

        const showSession = this._settings.get_boolean('show-session');
        const session = showSession ? sessionText(usage.data) : '';
        const cache = showSession ? cacheText(usage.data, now) : '';
        this._sessionItem.visible = session !== '';
        this._sessionItem.label.text = session;
        this._cacheItem.visible = cache !== '';
        this._cacheItem.label.text = `Prompt cache: ${cache}`;
        this._sessionSeparator.visible = session !== '' || cache !== '';
        // An old status line means the session has probably ended
        for (const item of [this._sessionItem, this._cacheItem]) item.opacity = age > STALE_SECONDS ? DIMMED : 255;

        const reportText = reportAge === null ? '' : ` · usage report ${ageText(reportAge)} ago`;
        this._ageItem.label.text = `Updated ${ageText(age)} ago (from Claude Code)${reportText}`;

        // Old numbers would notify about a state that may have changed since
        if (age <= STALE_SECONDS) {
            this._notify([
                {key: 'five_hour', name: '5-hour', win: five, level: fiveLevel},
                {key: 'seven_day', name: 'Weekly', win: week, level: weekLevel},
                ...fable ? [{key: 'fable', name: 'Fable weekly', win: fable, level: fableLevel}] : [],
            ], resets, now);
        }
    }

    _notify(windows, grants, now) {
        const options = {
            limits: this._settings.get_boolean('notify-limits'),
            resets: this._settings.get_boolean('notify-resets'),
            expiring: this._settings.get_boolean('notify-expiring'),
        };
        const first = this._sent === null;
        const {alerts, sent} = pendingAlerts(windows, grants, this._sent ?? {}, now, options);
        this._sent = sent;
        if (first) return;
        for (const {title, body} of alerts) {
            const source = this._notificationSource();
            source.addNotification(new MessageTray.Notification({source, title, body}));
        }
    }

    /** The message tray source the notifications show under, made when first needed. */
    _notificationSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({title: this.metadata.name, iconName: 'dialog-information-symbolic'});
            this._source.connect('destroy', () => {
                this._source = null;
            });
            Main.messageTray.add(this._source);
        }
        return this._source;
    }
}
