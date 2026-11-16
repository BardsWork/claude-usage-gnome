import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    DEFAULT_FILE, USAGE_REPORT_FILE, WINDOW_SECONDS, breakdown, fableWindow, limitLevel, limitStates, paceText,
    readReport, readUsage, resetGrants, resetText, resetsText, windowText, worstLevel,
} from './usage.js';

const REFRESH_SECONDS = 30;
// Older than this, the numbers may be out of date (no Claude Code session running)
const STALE_SECONDS = 15 * 60;
const LEVEL_CLASSES = ['claude-usage-warning', 'claude-usage-critical'];

/** Colors an actor for a level from limitLevel(), and bolds it when it's the active limit. */
function setLevel(actor, level, active = false) {
    for (const c of LEVEL_CLASSES) actor.remove_style_class_name(c);
    if (level !== 'normal') actor.add_style_class_name(`claude-usage-${level}`);
    if (active) actor.add_style_class_name('claude-usage-active');
    else actor.remove_style_class_name('claude-usage-active');
}

/** A menu row's text: the percentage, the reset time and, when there is one, the pace. */
function rowText(name, win, length, now) {
    const pace = paceText(win, length, now);
    return `${name}: ${windowText(win, now)} used, resets ${resetText(win, now)}${pace ? ` · ${pace}` : ''}`;
}

export default class ClaudeUsageExtension extends Extension {
    enable() {
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
        this._ageItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._button.menu.addMenuItem(this._fiveItem);
        this._button.menu.addMenuItem(this._weekItem);
        this._button.menu.addMenuItem(this._breakdownItem);
        this._button.menu.addMenuItem(this._fableItem);
        this._button.menu.addMenuItem(this._resetsItem);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._button.menu.addMenuItem(this._ageItem);

        Main.panel.addToStatusArea(this.uuid, this._button);

        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = null;
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
            this._ageItem.label.text = 'No data yet: start Claude Code';
            return;
        }
        const now = Math.floor(GLib.DateTime.new_now_local().to_unix());
        const {five_hour: five, seven_day: week} = usage.limits;
        const age = now - usage.updated;

        const report = readReport(USAGE_REPORT_FILE);
        const states = limitStates(report);
        const fable = fableWindow(report);
        const fiveLevel = limitLevel(five, states.five_hour?.severity, now);
        const weekLevel = limitLevel(week, states.seven_day?.severity, now);

        this._label.text = `Claude ${windowText(five, now)} · ${windowText(week, now)}`;
        this._label.opacity = age > STALE_SECONDS ? 140 : 255;
        setLevel(this._label, worstLevel(fiveLevel, weekLevel));

        this._fiveItem.label.text = rowText('5-hour', five, WINDOW_SECONDS.five_hour, now);
        setLevel(this._fiveItem.label, fiveLevel, states.five_hour?.active);
        this._weekItem.label.text = rowText('Weekly', week, WINDOW_SECONDS.seven_day, now);
        setLevel(this._weekItem.label, weekLevel, states.seven_day?.active);

        const surfaces = breakdown(report);
        this._breakdownItem.visible = surfaces.length > 0;
        this._breakdownItem.menu.removeAll();
        for (const {name, percent} of surfaces)
            this._breakdownItem.menu.addMenuItem(new PopupMenu.PopupMenuItem(`${name}: ${Math.round(percent)}%`, {reactive: false}));

        this._fableItem.visible = fable !== null;
        if (fable) {
            this._fableItem.label.text = rowText('Fable weekly', fable, WINDOW_SECONDS.seven_day, now);
            setLevel(this._fableItem.label, limitLevel(fable, states.fable?.severity, now), states.fable?.active);
        }
        const resets = resetGrants(report, now);
        this._resetsItem.visible = resets.length > 0;
        if (resets.length) this._resetsItem.label.text = `Limit resets: ${resetsText(resets)}`;

        this._ageItem.label.text = `Updated ${Math.round(age / 60)} min ago (from Claude Code)`;
    }
}
