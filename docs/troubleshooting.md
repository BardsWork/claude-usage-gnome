# Troubleshooting

Start with these two commands. Most problems show up in one of them.

```bash
gnome-extensions info claude-usage@bardswork        # should say State: ACTIVE
jq .rate_limits ~/.cache/claude-usage/statusline.json
```

## The top bar shows `Claude –` and the menu says "No data yet"

The extension can't read `~/.cache/claude-usage/statusline.json`. Either the file doesn't exist yet or it doesn't hold valid JSON.

1. Check that Claude Code runs your status line script. `~/.claude/settings.json` should have a `statusLine` entry:

   ```json
   {
     "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" }
   }
   ```

2. Check that the two lines from `statusline-snippet.sh` come **after** the line that reads stdin (`data=$(cat)`). If they come before it, `$data` is empty and the file holds nothing.

3. Start a Claude Code session and send one message. The status line refreshes after each response, and the file should appear:

   ```bash
   ls -l ~/.cache/claude-usage/statusline.json
   ```

## The label shows `–` for one or both numbers

The file exists, but `rate_limits` is missing or doesn't include that window. Run:

```bash
jq .rate_limits ~/.cache/claude-usage/statusline.json
```

If it prints `null`, Claude Code isn't reporting plan limits. That happens when it is signed in with an API key instead of a Claude Pro or Max subscription. Run `/login` in Claude Code and pick your subscription account.

## The label is dimmed

The numbers are more than 15 minutes old. No Claude Code session has refreshed its status line since then. It brightens again the next time one does.

## A number shows 0% when I know I've used some

The reset time saved in the file has passed, so the extension treats that window as reset. Usage you've had since then shows up the next time Claude Code refreshes its status line.

## Usage from claude.ai or the desktop app isn't counted

It is, but only after Claude Code reports again. The extension only knows what the last Claude Code status line refresh said.

## State is `ERROR`

Look at the shell log for the reason:

```bash
journalctl --user -b | grep -i claude-usage
```

Please [open an issue](https://github.com/BardsWork/claude-usage-gnome/issues/new?template=bug_report.yml) with the output.

## State is `OUT OF DATE`, or the extension isn't listed for my GNOME version

`metadata.json` lists the GNOME Shell versions the extension is known to work on, currently only 50. To try it on another version, add yours to `shell-version`:

```bash
gnome-shell --version
```

```json
"shell-version": ["49", "50"]
```

Then log out and back in. If it works, a pull request adding the version is welcome. Versions before 45 won't work: the extension uses ES modules, which GNOME added in 45.

## Nothing appears after `./install.sh`

- **Wayland:** GNOME only finds new extensions at login. Log out and back in.
- **X11:** press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r` and press <kbd>Enter</kbd> to restart the shell.
- Check that user extensions aren't turned off as a whole:

  ```bash
  gsettings get org.gnome.shell disable-user-extensions   # should be false
  ```

## I run several Claude Code sessions at once

That's fine. They all write to the same file, and they all report the same account's limits, so whichever refreshed last is current.
