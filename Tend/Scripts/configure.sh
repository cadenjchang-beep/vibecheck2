#!/usr/bin/env bash
#
# One-shot project configuration.
#
# Replaces every placeholder identifier — bundle IDs, the iCloud container, the
# app group, the background-task IDs, the logging subsystem — with ones derived
# from your own prefix, then generates the Xcode project.
#
# These strings have to agree across project.yml, four entitlements files, four
# Info.plists and TendIdentifiers in Swift. Editing them by hand is how you end
# up with a widget that silently reads an empty store, so it happens here in one
# pass instead.
#
# Usage:
#   Scripts/configure.sh com.yourname.tend A1B2C3D4E5
#
# Safe to re-run: once the placeholders are gone there is nothing left to match.

set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX="${1:-}"
TEAM_ID="${2:-}"

OLD_PREFIX="com.tend.household"
OLD_BUNDLE_PREFIX="com.tend"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ -z "$PREFIX" ] || [ -z "$TEAM_ID" ]; then
  cat <<'USAGE'
Usage: Scripts/configure.sh <bundle-prefix> <team-id>

  bundle-prefix   Reverse-DNS identifier you control, e.g. com.yourname.tend
                  Lowercase letters, digits, hyphens and dots only.

  team-id         Your 10-character Apple Developer Team ID.
                  Find it at developer.apple.com/account -> Membership.

Example:
  Scripts/configure.sh com.cadenchang.tend A1B2C3D4E5
USAGE
  exit 1
fi

# Apple rejects anything else, and finding out at archive time is expensive.
if ! printf '%s' "$PREFIX" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'; then
  fail "Bundle prefix '$PREFIX' isn't valid. Use lowercase reverse-DNS, e.g. com.yourname.tend"
fi

if ! printf '%s' "$TEAM_ID" | grep -Eq '^[A-Z0-9]{10}$'; then
  fail "Team ID '$TEAM_ID' doesn't look right — it's 10 uppercase letters and digits."
fi

# `perl -pi` behaves identically on macOS and Linux, unlike `sed -i`. Passing the
# strings through the environment avoids any quoting surprises.
replace_everywhere() {
  local from="$1" to="$2"
  local files
  # This script must exclude itself: bash reads a script incrementally, and
  # rewriting it to a different length mid-run makes the shell resume at a
  # meaningless byte offset. The .md files are excluded so the documentation
  # keeps describing the original placeholders.
  files="$(grep -rl --exclude-dir=.git --exclude-dir=.build --exclude='*.md' \
             --exclude='configure.sh' -F "$from" . || true)"
  [ -n "$files" ] || return 0
  printf '%s\n' "$files" | while IFS= read -r file; do
    FROM="$from" TO="$to" perl -pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "$file"
  done
}

bold "Setting identifiers to $PREFIX"
# Order matters: the longer, more specific string is replaced first, otherwise
# the shorter one would rewrite half of it and leave a mangled result.
replace_everywhere "$OLD_PREFIX" "$PREFIX"
replace_everywhere "bundleIdPrefix: $OLD_BUNDLE_PREFIX" "bundleIdPrefix: ${PREFIX%.*}"

bold "Setting development team to $TEAM_ID"
replace_everywhere "DEVELOPMENT_TEAM: TEAMID" "DEVELOPMENT_TEAM: $TEAM_ID"

cat <<EOF

$(bold "Register these with Apple before you build")

  developer.apple.com/account -> Certificates, Identifiers & Profiles

  1. iCloud Containers -> +      iCloud.$PREFIX
  2. App Groups        -> +      group.$PREFIX
  3. App IDs           -> + (five of them)

       $PREFIX
       $PREFIX.widgets
       $PREFIX.share
       $PREFIX.watchkitapp
       $PREFIX.watchkitapp.complications

     Every one of the five needs iCloud (with the container above) and App
     Groups (with the group above) ticked. The main app also needs Push
     Notifications.

EOF

if command -v xcodegen >/dev/null 2>&1; then
  bold "Generating Tend.xcodeproj"
  xcodegen generate
  echo
  echo "Next:  open Tend.xcodeproj"
else
  echo "xcodegen isn't installed. Run:"
  echo "  brew install xcodegen && cd $(pwd) && xcodegen generate"
fi
