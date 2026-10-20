# Claude Usage for GNOME

A GNOME Shell extension that shows your Claude plan usage in the top bar:

```
Claude 33% · 63%
```

The first number is your 5-hour session window. The second is your weekly limit. Click it to see when each one resets and how old the numbers are.

## How it works

Claude Code passes a JSON object to your [status line](https://docs.claude.com/en/docs/claude-code/statusline) script every time the status line refreshes. That JSON includes a `rate_limits` field with the same percentages `/usage` shows:

```json
"rate_limits": {
  "five_hour": { "used_percentage": 33, "resets_at": 1792534800 },
  "seven_day": { "used_percentage": 63, "resets_at": 1792875600 }
}
```

Your status line script saves that JSON to `~/.cache/claude-usage/statusline.json`, and the extension reads the file every 30 seconds. It never touches your Claude login or calls any API.

Because of this:

- The numbers only update while a Claude Code session is running. If the file is more than 15 minutes old, the label dims.
- Usage from claude.ai or the desktop app shows up the next time Claude Code refreshes its status line.
- After a window's reset time passes, it shows 0% until Claude Code reports again.
- `rate_limits` only appears when Claude Code is signed in with a Claude subscription (Pro or Max), not with an API key.

## Requirements

- GNOME Shell 50 (tested on Ubuntu 26.04). Other versions may work: add them to `shell-version` in `metadata.json` and test.
- Claude Code with a status line script. Tested with version 2.1.302.

## Install

1. Add the two lines from `statusline-snippet.sh` to your status line script, right after it reads stdin into `$data`. If you don't have a status line script yet, see the [status line docs](https://docs.claude.com/en/docs/claude-code/statusline).

2. Link and enable the extension:

   ```bash
   ./install.sh
   ```

   This symlinks `claude-usage@bardswork` into `~/.local/share/gnome-shell/extensions/`, so edits in this folder are what GNOME runs, and adds it to GNOME's enabled extensions.

3. Log out and back in. On Wayland, GNOME only finds new extensions at login.

To check it loaded:

```bash
gnome-extensions info claude-usage@bardswork    # State: ACTIVE
```

If it shows `ERROR`, look at the shell log:

```bash
journalctl --user -b | grep -i claude-usage
```

## Uninstall

```bash
gnome-extensions disable claude-usage@bardswork
rm ~/.local/share/gnome-shell/extensions/claude-usage@bardswork
```

Then remove the two lines from your status line script.

## Tests

Unit tests for the parts that don't need GNOME Shell (reading the file, formatting percentages and reset times):

```bash
TZ=UTC gjs -m tests/usage.test.js
```

A full load test that starts a headless GNOME Shell with a throwaway home folder, so your desktop and settings are untouched. It passes if the extension reaches `ACTIVE` with no errors logged. Run it with sample data and without:

```bash
tests/headless.sh
tests/headless.sh --no-data
```

## Files

| File | What it does |
|---|---|
| `claude-usage@bardswork/extension.js` | The top-bar button and menu |
| `claude-usage@bardswork/usage.js` | Reads the JSON file and formats the text |
| `claude-usage@bardswork/metadata.json` | Extension name, ID and supported GNOME versions |
| `statusline-snippet.sh` | Lines to add to your Claude Code status line script |
| `install.sh` | Links the extension into GNOME and enables it |
| `tests/` | Unit tests and the headless GNOME Shell test |
| `LICENSE` | MIT license |

## License

MIT. See `LICENSE`.
