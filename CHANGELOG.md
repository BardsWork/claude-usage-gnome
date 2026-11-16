# Changelog

## Unreleased

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
