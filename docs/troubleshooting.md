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

2. Check that the lines from `statusline-snippet.sh` come **after** the line that reads stdin (`data=$(cat)`). If they come before it, `$data` is empty and the file holds nothing.

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

## The menu has no Fable row

The row only shows when `~/.cache/claude-usage/usage.json` exists and has a Fable weekly window. Check:

```bash
jq '.limits[] | select(.kind == "weekly_scoped")' ~/.cache/claude-usage/usage.json
```

- **No such file:** your status line script doesn't have the Fable block from `statusline-snippet.sh`, or `curl` or `jq` is missing. The block tries at most once every 5 minutes. To retry now, run `rm ~/.cache/claude-usage/usage.attempt` and send a message in Claude Code.
- **Nothing printed:** your plan has no separate Fable weekly limit, so there's nothing to show.
- **The file stopped updating:** Claude Code's saved token may have expired. It refreshes the token on its own the next time it calls the API, so the next fetch usually works.

## The menu has no limit resets row

The row only shows when the saved usage report lists a reset you can still use. Check:

```bash
jq '.cedar_ember | {eligible, ineligible_reason, grants: [.grants[]? | {label, resets_left, ends_at}]}' ~/.cache/claude-usage/usage.json
```

- **No such file:** see [The menu has no Fable row](#the-menu-has-no-fable-row). Both rows come from the same fetch.
- **`eligible` is `null`:** the report has no `cedar_ember` field, because your status line script has the older Fable block. Copy the block from the current `statusline-snippet.sh`, which asks for `cedar_ember=1`.
- **`ineligible_reason` is `surface` or `cli_version`:** the request didn't send Claude Code's User-Agent, or the version in it was missing. Copy the current block, and check that `jq -r .version ~/.cache/claude-usage/statusline.json` prints a version.
- **No grants, or `resets_left` is 0 everywhere:** you have no resets to use right now, so there's nothing to show.

## The Fable, resets or weekly-by-surface rows are dimmed

The usage report they come from is more than 30 minutes old. The menu's last row says how old it is. The fetch runs at most every 5 minutes while Claude Code is running, so the report is either out of date because no session has run for a while, or the fetch is failing. To retry now, run `rm ~/.cache/claude-usage/usage.attempt` and send a message in Claude Code. If it stays old, see [The menu has no Fable row](#the-menu-has-no-fable-row) for the checks.

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
