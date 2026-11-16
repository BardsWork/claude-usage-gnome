# Changelog

## Unreleased

- Notifications when a window reaches the warning or critical percentage, when a window that reached a warning resets, and when an unused limit reset runs out within a day ([#13](https://github.com/BardsWork/claude-usage-gnome/issues/13)).
- Settings page (menu → Settings): warning and critical percentages, each kind of notification, and the current session rows. `install.sh` now compiles the settings schema, so run it again after updating.
- Current session rows: project, model, context used and cost at API prices for the session that refreshed the status line last ([#10](https://github.com/BardsWork/claude-usage-gnome/issues/10)), and how long its prompt cache stays warm, with the hit ratio ([#11](https://github.com/BardsWork/claude-usage-gnome/issues/11)).
- Fable row shows Fable's share of the weekly limit, for example `7% of weekly, cap 50%` ([#7](https://github.com/BardsWork/claude-usage-gnome/issues/7)).
- Limit resets row says when you're at a limit with a reset you can use (and turns yellow), when resets are cooling down, and why a reset can't be used yet ([#8](https://github.com/BardsWork/claude-usage-gnome/issues/8)).
- Last menu row shows the usage report's age, and the rows from it dim when it's more than 30 minutes old ([#14](https://github.com/BardsWork/claude-usage-gnome/issues/14)).
- Label and menu rows turn yellow or red near a limit: at 80% and 95% used, or when the usage report marks a limit as anything other than normal. The limit that applies right now is shown in bold. Separate colors for light and dark shell styles ([#5](https://github.com/BardsWork/claude-usage-gnome/issues/5)).
- "Weekly by surface" submenu with where this week's usage went (Claude Code, chats, Cowork), from the usage report ([#6](https://github.com/BardsWork/claude-usage-gnome/issues/6)).
- Pace on each row: below, on or above pace, and when you'd hit the limit at the current rate ([#12](https://github.com/BardsWork/claude-usage-gnome/issues/12)).
- Limit resets row in the menu, with how many resets of each kind you have left and when they run out. The status line snippet's optional fetch now asks for them and sends Claude Code's User-Agent, which the server needs before it lists them ([#3](https://github.com/BardsWork/claude-usage-gnome/issues/3)).
- Fable weekly row in the menu, with its percentage and reset time. The status line snippet has an optional block that fetches claude.ai's usage report, which is the only place this window shows up ([#1](https://github.com/BardsWork/claude-usage-gnome/issues/1)).

## 0.1.0 (2026-10-20)

First release.

- Top-bar label with the 5-hour and weekly usage percentages.
- Menu with each window's reset time and how old the numbers are.
- Label dims when the numbers are more than 15 minutes old.
- Supports GNOME Shell 50.
