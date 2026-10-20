import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DEFAULT_FILE, readUsage, resetText, windowText} from './usage.js';

const REFRESH_SECONDS = 30;
// Older than this, the numbers may be out of date (no Claude Code session running)
const STALE_SECONDS = 15 * 60;

export default class ClaudeUsageExtension extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._label = new St.Label({text: 'Claude …', y_align: Clutter.ActorAlign.CENTER});
        this._button.add_child(this._label);

        this._fiveItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._weekItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._ageItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._button.menu.addMenuItem(this._fiveItem);
        this._button.menu.addMenuItem(this._weekItem);
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
            this._ageItem.label.text = 'No data yet: start Claude Code';
            return;
        }
        const now = Math.floor(GLib.DateTime.new_now_local().to_unix());
        const {five_hour: five, seven_day: week} = usage.limits;
        const age = now - usage.updated;

        this._label.text = `Claude ${windowText(five, now)} · ${windowText(week, now)}`;
        this._label.opacity = age > STALE_SECONDS ? 140 : 255;

        this._fiveItem.label.text = `5-hour: ${windowText(five, now)} used, resets ${resetText(five, now)}`;
        this._weekItem.label.text = `Weekly: ${windowText(week, now)} used, resets ${resetText(week, now)}`;
        this._ageItem.label.text = `Updated ${Math.round(age / 60)} min ago (from Claude Code)`;
    }
}
