import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClaudeUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Tall enough to show every setting without scrolling
        window.set_default_size(620, 680);
        const page = new Adw.PreferencesPage();
        window.add(page);

        const switchRow = (key, title, subtitle) => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };
        const percentRow = (key, title, subtitle) => {
            const row = new Adw.SpinRow({
                title, subtitle,
                adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 5}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        const limits = new Adw.PreferencesGroup({
            title: 'Limits',
            description: 'When the label and menu rows turn yellow or red, and when notifications are sent.',
        });
        limits.add(percentRow('warning-percent', 'Warning', 'Percent used'));
        limits.add(percentRow('critical-percent', 'Critical', 'Percent used'));
        page.add(limits);

        const notifications = new Adw.PreferencesGroup({
            title: 'Notifications',
            description: 'Only while Claude Code is running, since that is when the numbers update.',
        });
        notifications.add(switchRow('notify-limits', 'Near a limit', 'When a window reaches the warning or critical percentage'));
        notifications.add(switchRow('notify-resets', 'Limit has reset', 'When a window that reached a warning resets'));
        notifications.add(switchRow('notify-expiring', 'Limit reset expiring',
            'When an unused limit reset runs out within a day. Needs the usage report fetch'));
        page.add(notifications);

        const menu = new Adw.PreferencesGroup({title: 'Menu'});
        menu.add(switchRow('show-session', 'Current session', 'Project, model, context, cost and prompt cache'));
        page.add(menu);

        // GTK focuses the first number, which arrow keys would then change by accident
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            window.set_focus(null);
            return GLib.SOURCE_REMOVE;
        });
    }
}
