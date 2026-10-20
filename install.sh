#!/bin/bash
# Links the extension into GNOME's extensions folder and enables it at next login.
set -euo pipefail

uuid="claude-usage@bardswork"
src="$(cd "$(dirname "$0")" && pwd)/$uuid"
dest="$HOME/.local/share/gnome-shell/extensions/$uuid"

mkdir -p "$(dirname "$dest")"
rm -rf "$dest"
ln -s "$src" "$dest"

enabled=$(gsettings get org.gnome.shell enabled-extensions)
if [[ "$enabled" != *"'$uuid'"* ]]; then
    if [[ "$enabled" == "@as []" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$uuid']"
    else
        gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$uuid']"
    fi
fi

echo "Linked $dest -> $src"
echo "Log out and back in (Wayland) to load it."
