#!/usr/bin/env bash
# Installs fx-autoconfig (profile side) and links Zen Tree Tabs into a Zen profile.
# Usage: ./install.sh [path/to/zen/profile]
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"
zen_install="${ZEN_INSTALL_DIR:-/opt/zen-browser-bin}"

profile="${1:-}"
if [[ -z "$profile" ]]; then
  # Prefer the current XDG location, then the older ~/.zen layout.
  for zen_root in "${XDG_CONFIG_HOME:-$HOME/.config}/zen" "$HOME/.zen"; do
    [[ -f "$zen_root/installs.ini" ]] || continue
    rel="$(awk -F= '/^Default=/{sub(/\r$/, "", $2); print $2; exit}' "$zen_root/installs.ini")"
    [[ -n "$rel" ]] || continue
    candidate="$rel"
    [[ "$candidate" = /* ]] || candidate="$zen_root/$candidate"
    if [[ -d "$candidate" ]]; then
      profile="$candidate"
      break
    fi
  done
  if [[ -z "$profile" ]]; then
    echo "No Zen profile found. Open about:profiles in Zen and pass its Root Directory:" >&2
    printf '  %q "/path/to/zen/profile"\n' "$0" >&2
    exit 1
  fi
fi
[[ -d "$profile" ]] || { echo "Profile not found: $profile" >&2; exit 1; }
echo "Profile: $profile"

fxac="$repo/vendor/fx-autoconfig"
if [[ ! -d "$fxac" ]]; then
  git clone --depth 1 https://github.com/MrOtherGuy/fx-autoconfig.git "$fxac"
fi

chrome="$profile/chrome"
mkdir -p "$chrome/JS" "$chrome/resources" "$chrome/utils"
cp -r "$fxac/profile/chrome/utils/." "$chrome/utils/"
ln -sfn "$repo/src/zen-tree-tabs.uc.js" "$chrome/JS/zen-tree-tabs.uc.js"
ln -sfn "$repo/src/zen-tree-tabs.css" "$chrome/resources/zen-tree-tabs.css"
rm -f "$chrome/CSS/zen-tree-tabs.uc.css" # Older layout; the script loads its own CSS now.
echo "Profile side installed."

if [[ -f "$zen_install/config.js" && -f "$zen_install/defaults/pref/config-prefs.js" ]]; then
  echo "Both program loader files are present in $zen_install."
else
  echo
  echo "Program loader incomplete in $zen_install; installation is not finished."
  echo "Run this one command to install both loader files (needs root):"
  printf '  sudo cp -rv -- %q %q\n' "$fxac/program/." "$zen_install/"
fi
echo
echo "Then restart Zen. Afterwards, edits reload with Ctrl+Alt+Shift+R (no restart,"
echo "no cache clearing). If the script doesn't load at all, open about:support and"
echo "use 'Clear startup cache…' once."
