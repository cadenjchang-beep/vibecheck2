#!/usr/bin/env bash
#
# Phase 0 / Phase 1 Definition of Done, as a runnable check.
#
#   Phase 0: two simulators share a household, and one can leave cleanly
#            without data loss on either side.
#   Phase 1: a checked-off item appears on the second device in under 2 seconds.
#
# XCTest cannot drive two simulators from one test process, so the two-device
# half of the critical path lives here rather than in TendUITests.
#
# Prerequisites:
#   - Two simulators signed into two *different* iCloud accounts. This is the
#     part people skip, and it is the part that matters: a share cannot be
#     meaningfully tested against a single Apple ID.
#   - xcodegen generate has been run and Tend.xcodeproj exists.
#
# Usage:
#   Scripts/two-device-sync-check.sh "iPhone 15 Pro" "iPhone 15"

set -euo pipefail

DEVICE_A="${1:-iPhone 15 Pro}"
DEVICE_B="${2:-iPhone 15}"
BUNDLE_ID="com.tend.household"
SCHEME="Tend"

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }

udid_for() {
  xcrun simctl list devices available --json \
    | python3 -c "
import json,sys
name = sys.argv[1]
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for device in devices:
        if device['name'] == name:
            print(device['udid'])
            sys.exit(0)
sys.exit('No available simulator named ' + name)
" "$1"
}

UDID_A="$(udid_for "$DEVICE_A")"
UDID_B="$(udid_for "$DEVICE_B")"

log "Device A: $DEVICE_A ($UDID_A)"
log "Device B: $DEVICE_B ($UDID_B)"

log "Booting both simulators"
xcrun simctl boot "$UDID_A" || true
xcrun simctl boot "$UDID_B" || true

log "Building"
xcodebuild -project Tend.xcodeproj -scheme "$SCHEME" \
  -destination "id=$UDID_A" -configuration Debug build \
  -derivedDataPath .build >/dev/null

APP_PATH="$(find .build/Build/Products/Debug-iphonesimulator -maxdepth 1 -name 'Tend.app' | head -1)"
[ -n "$APP_PATH" ] || { echo "Could not find the built app"; exit 1; }

for udid in "$UDID_A" "$UDID_B"; do
  log "Installing on $udid"
  xcrun simctl install "$udid" "$APP_PATH"
done

cat <<'MANUAL'

The rest is deliberately manual, because the things worth checking here are the
things an automated harness would paper over:

  1. On device A: finish onboarding, then Settings → Household → Invite with
     iCloud. Send the link to the Apple ID signed into device B.

  2. On device B: accept the invite. Confirm the household's events, lists and
     tasks arrive — and that device B's *own* previous data (if any) is still
     there.

  3. Check an item off on device A and start a stopwatch. It must appear checked
     on device B in under 2 seconds with both devices foregrounded.
     (Phase 1 Definition of Done.)

  4. Check a *different* item off on each device at the same moment. Both must
     end up checked. This is the per-item-record guarantee from §2 — if either
     one loses, the records are wrong, not the sync.

  5. On device B: Settings → Household → Leave this household.
     - Device B must keep its local copy, marked read-only, with an export
       button that produces valid JSON.
     - Device A must show device B as removed and lose nothing.
     (Phase 0 Definition of Done.)

  6. On device A: remove a participant from the share. Repeat the checks in
     step 5 from the other direction.

  7. Sign device B out of iCloud and back in as a *different* Apple ID mid-
     session. The previous account's household must disappear immediately —
     before any screen renders it — and must come back on signing in again.
     (§6, account switching.)

MANUAL
