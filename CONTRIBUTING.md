# Contributing

Bug reports, fixes and support for more GNOME versions are all welcome.

## Reporting a bug

Use the [bug report form](https://github.com/BardsWork/claude-usage-gnome/issues/new?template=bug_report.yml). Check [docs/troubleshooting.md](docs/troubleshooting.md) first; it covers the common cases.

If you include your saved status line file, paste only `rate_limits`. The full file also holds your working directory and session details.

## Sending a change

1. Fork the repo and create a branch.
2. Make your change. Keep code that doesn't need GNOME Shell in `usage.js`, so it stays unit testable.
3. Run the tests:

   ```bash
   TZ=UTC gjs -m tests/usage.test.js
   tests/headless.sh
   tests/headless.sh --no-data
   ```

4. If you changed how the label or menu looks, run `docs/screenshot.sh` to update the screenshot.
5. Add a line to `CHANGELOG.md` under "Unreleased".
6. Open a pull request.

See [docs/development.md](docs/development.md) for how the code is laid out and how to test changes in a running shell.

## Style

- Four-space indents, single quotes, semicolons.
- Comments explain why, not what.
- The extension must never read your Claude credentials or call a network API. It only reads the file the status line writes.
