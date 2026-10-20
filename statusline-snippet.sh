# Add to your Claude Code status line script, right after it reads stdin into $data:
#
#   data=$(cat)
#
# It saves the status line JSON (which includes rate_limits) for the GNOME extension.
mkdir -p "$HOME/.cache/claude-usage"
printf '%s' "$data" > "$HOME/.cache/claude-usage/statusline.json"
