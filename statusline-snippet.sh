# Source this from your Claude Code status line script, right after it reads stdin into $data:
#
#   data=$(cat)
#   source ~/claude-usage-gnome/statusline-snippet.sh
#
# Sourcing it keeps it up to date with git pull. It saves the status line JSON (which
# includes rate_limits) for the GNOME extension.
mkdir -p "$HOME/.cache/claude-usage"
printf '%s' "$data" > "$HOME/.cache/claude-usage/statusline.json"

# Optional, for the Fable weekly and limit resets rows (needs curl and jq). The status line
# JSON has neither, so this fetches the usage report /usage shows, using Claude Code's own
# sign-in, at most every 5 minutes. It runs in the background so the status line never waits.
# cedar_ember=1 adds the limit resets /limit-reset uses. The server only lists them for
# requests that carry Claude Code's User-Agent, so the version comes from the status line JSON.
(
    dir="$HOME/.cache/claude-usage"
    [[ -z $(find "$dir/usage.attempt" -mmin -5 2>/dev/null) ]] || exit 0
    touch "$dir/usage.attempt"
    token=$(jq -r '.claudeAiOauth.accessToken // empty' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json")
    [[ -n $token ]] || exit 0
    version=$(jq -r '.version // "unknown"' <<< "$data")
    # Headers go through stdin so the token doesn't show up in the process list
    # No skip_spend=1: without spend, the report has no extra usage
    printf 'Authorization: Bearer %s\nanthropic-beta: oauth-2025-04-20\nUser-Agent: claude-cli/%s (external, cli)\n' "$token" "$version" |
        curl -sf -m 10 -H @- -o "$dir/usage.json.tmp" 'https://api.anthropic.com/api/oauth/usage?cedar_ember=1' &&
        jq -e '.limits' "$dir/usage.json.tmp" > /dev/null &&
        mv "$dir/usage.json.tmp" "$dir/usage.json"
) > /dev/null 2>&1 &
