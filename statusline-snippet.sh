# Add to your Claude Code status line script, right after it reads stdin into $data:
#
#   data=$(cat)
#
# It saves the status line JSON (which includes rate_limits) for the GNOME extension.
mkdir -p "$HOME/.cache/claude-usage"
printf '%s' "$data" > "$HOME/.cache/claude-usage/statusline.json"

# Optional, for the Fable weekly row (needs curl and jq). The status line JSON has no
# Fable window, so this fetches the usage report /usage shows, using Claude Code's own
# sign-in, at most every 5 minutes. It runs in the background so the status line never waits.
(
    dir="$HOME/.cache/claude-usage"
    [[ -z $(find "$dir/usage.attempt" -mmin -5 2>/dev/null) ]] || exit 0
    touch "$dir/usage.attempt"
    token=$(jq -r '.claudeAiOauth.accessToken // empty' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json")
    [[ -n $token ]] || exit 0
    # Headers go through stdin so the token doesn't show up in the process list
    printf 'Authorization: Bearer %s\nanthropic-beta: oauth-2025-04-20\n' "$token" |
        curl -sf -m 10 -H @- -o "$dir/usage.json.tmp" 'https://api.anthropic.com/api/oauth/usage?skip_spend=1' &&
        jq -e '.limits' "$dir/usage.json.tmp" > /dev/null &&
        mv "$dir/usage.json.tmp" "$dir/usage.json"
) > /dev/null 2>&1 &
