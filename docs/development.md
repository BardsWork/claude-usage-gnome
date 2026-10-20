# Development

## Layout

| File | What it does |
|---|---|
| `claude-usage@bardswork/extension.js` | The top-bar button and menu |
| `claude-usage@bardswork/usage.js` | Reads the JSON file and formats the text. No GNOME Shell imports, so it can be unit tested with plain `gjs` |
| `claude-usage@bardswork/metadata.json` | Extension name, ID and supported GNOME versions |
| `statusline-snippet.sh` | Lines to add to your Claude Code status line script |
| `install.sh` | Links the extension into GNOME and enables it |
| `tests/usage.test.js` | Unit tests for `usage.js` |
| `tests/headless.sh` | Loads the extension in a headless GNOME Shell |
| `docs/screenshot.sh` | Regenerates `docs/screenshot.png` |

## Working on it

`install.sh` symlinks the folder into `~/.local/share/gnome-shell/extensions/`, so GNOME runs your working copy. GNOME Shell caches extension code once loaded, so to see a change:

- **Wayland:** log out and back in, or test in a nested shell instead:

  ```bash
  dbus-run-session -- gnome-shell --devkit --wayland
  ```

  (GNOME 48 and earlier: `gnome-shell --nested --wayland`.)

- **X11:** press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r` and press <kbd>Enter</kbd>.

To fake data while you work, write the file yourself:

```bash
now=$(date +%s)
mkdir -p ~/.cache/claude-usage
printf '{"rate_limits":{"five_hour":{"used_percentage":33,"resets_at":%d},"seven_day":{"used_percentage":63,"resets_at":%d}}}' \
    $((now + 7200)) $((now + 300000)) > ~/.cache/claude-usage/statusline.json
```

## Tests

Unit tests for `usage.js`. `TZ=UTC` keeps the reset-time text the same on every machine:

```bash
TZ=UTC gjs -m tests/usage.test.js
```

A load test that starts a headless GNOME Shell with a throwaway home folder, so your desktop and settings are untouched. It passes if the extension reaches `ACTIVE` with no errors logged. Run it with sample data and without:

```bash
tests/headless.sh
tests/headless.sh --no-data
```

The headless test needs GNOME Shell installed, so GitHub Actions only runs the unit tests and `shellcheck`. Run the headless test yourself before sending a pull request.

## Screenshot

`docs/screenshot.sh` starts a headless shell the same way, opens the menu and saves the top-right corner of the screen to `docs/screenshot.png`. Run it again after changing how the label or menu looks.

## Supporting another GNOME version

1. Add the version to `shell-version` in `metadata.json`.
2. Run `tests/headless.sh` on that version, and load it in a real session.
3. Note the version under Requirements in the README.

## Packaging

To build a zip for [extensions.gnome.org](https://extensions.gnome.org/upload/) or for manual install:

```bash
gnome-extensions pack claude-usage@bardswork
gnome-extensions install --force claude-usage@bardswork.shell-extension.zip
```
