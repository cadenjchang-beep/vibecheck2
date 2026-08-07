# Tend

*The app that carries what you're carrying in your head.*

A native iOS 17+ household app built around mental load rather than around a
shared calendar. Calendars are a solved problem; the unsolved one is the
invisible tracking work that falls disproportionately on one person. Three
things follow from that, and they shape every decision in this codebase:

1. **Capture has to be near-zero-friction.** A thought that takes ten seconds to
   log doesn't get logged. Hence the single global "+", the natural-language
   parser, the list field that keeps focus, and four ways to add something
   without opening the app.
2. **Imbalance should be visible without being a scoreboard.** Load View shows
   the shape of the week, in household order, with no rank and no verdict.
3. **Re-entry is a top contributor and worth attacking directly.** Hence the
   Share Extension, recipe import, and Shared with You.

---

## Build

**Start at [SETUP.md](SETUP.md)** — it walks the whole thing from nothing,
including the parts on Apple's websites that can't be scripted.

The short version:

```bash
brew install xcodegen
cd Tend
Scripts/configure.sh com.yourname.tend YOURTEAMID
open Tend.xcodeproj
```

`configure.sh` replaces every placeholder identifier — bundle IDs, the iCloud
container, the app group, the background-task IDs — consistently across
`project.yml`, the entitlements, the Info.plists and the Swift source, then
generates the project. Those strings have to agree with each other and with what
you register in the Developer portal; CloudKit will not provision against the
placeholders.

The Xcode project itself is generated rather than committed — a five-target
`.pbxproj` is a merge-conflict machine and is not reviewable.

Run the logic tests without Xcode:

```bash
cd Tend/TendKit && swift test
```

---

## Layout

```
Tend/
├── TendKit/                     Shared Swift package — every target links it
│   └── Sources/TendKit/
│       ├── Models/              Versioned schema, migration plan, container
│       ├── Recurrence/          RRULE subset + expansion + edit-scope splitting
│       ├── Parsing/             Natural-language quick add, aisle categoriser
│       ├── Sync/                CloudKit error policy, retry queue, account
│       │                        monitor, shared-zone sync engine, record mapper
│       ├── Sharing/             CKShare lifecycle, membership resolution, export
│       ├── Pulse/               Recap generation + background scheduling
│       ├── Load/                Load View computation
│       ├── Intents/             App Intents (Siri, widgets, Shortcuts)
│       ├── Routing/             The one URL scheme every target shares
│       ├── Services/            Stores, meal planner, importers, lock, StoreKit
│       └── Design/              Spacing, motion, member palette, empty states
├── Apps/
│   ├── Tend/                    Main app (SwiftUI)
│   ├── TendWidgets/             Widgets + Live Activity
│   ├── TendWatch/               Watch app + complications
│   └── TendShareExtension/      Share sheet capture
├── Support/                     Info.plists and entitlements
├── Scripts/                     Two-device sync/leave verification
└── Tests/TendUITests/           Critical-path UI tests
```

Everything shared lives in `TendKit` — models, sync, App Intents, and the
deep-link router — so the widget, the Watch app and the share extension agree by
construction rather than by convention. A check-off from a Home Screen widget
goes through the same `ListStore.setChecked` the app uses, which is why it lands
in Load View correctly instead of being an untracked write.

---

## Two architecture decisions worth knowing about

### 1. SwiftData mirroring covers the private database only

The brief specifies `.modelContainer(for:cloudKitDatabase:)` **and** CKShare
across Apple IDs. On iOS 17 those two are not the same mechanism: SwiftData's
automatic mirroring syncs the private database and has no public API for
`CKShare` or the shared database. Building only the first half would produce an
app that syncs across *your* devices and silently fails the moment a second
person is invited — exactly the "nasty surprise" §12.1 warns about.

So sharing is split:

| Concern | Mechanism |
| --- | --- |
| Your own copy, offline-first, one record per object | SwiftData automatic mirroring, private DB (`TendModelContainer`) |
| The household's zone and its `CKShare` | `HouseholdShareController` (zone-wide share, `CKShare(recordZoneID:)`) |
| A participant's view of someone else's household | `SharedZoneSyncEngine` (`CKSyncEngine` over the shared DB) into the same local store |

Views, widgets and the Watch app read one local store and never know which half
produced a row. Zone-wide sharing is what makes "everything in this household is
shared, one CloudKit record per item" true without hanging every event off a
share root.

### 2. Recurrence logic runs on value types, not `@Model` objects

`RecurrenceEngine` takes an `EventSnapshot` and returns a `SeriesMutation`
describing every write an edit implies. `EventStore` applies that mutation in one
save. Two consequences: the highest-risk logic in the app is unit-testable
without a `ModelContainer`, and a "this and future" split can't half-apply.

---

## Phase status against the brief's Definitions of Done

| Phase | State | Notes |
| --- | --- | --- |
| **0 — Foundation** | Code complete, **unverified on device** | Multi-target spec, versioned schema + migration plan, CKShare create/accept/remove/leave, account-switch handling, export-on-leave. The DoD ("two simulators share a household and one leaves cleanly") requires two Apple IDs and real hardware — `Scripts/two-device-sync-check.sh` walks it. |
| **1 — Calendar & Lists** | Code complete | Day/week/month/list views, per-member colour, recurrence with explicit edit scope, item-level records, single-tap add that keeps focus, aisle grouping, onboarding ending in the native invite flow. Sub-2s sync is a device measurement, not a code claim. |
| **2 — Tasks & Meals** | Code complete | Assignment, recurrence (completing a recurring task rolls it forward and preserves the completed instance for Load View), weekly meal grid, recipe box, JSON-LD URL import, VisionKit scan import, one-tap de-duplicated grocery generation. |
| **3 — Signature Layer** | Code complete | Pulse (background-generated, read-only at display time), Load View, interactive widgets, Siri/App Intents, Watch app + complications, natural-language quick add, Share Extension. Three no-app-launch paths exist: Siri, widget button, share sheet. |
| **4 — Polish** | Partial | Live Activities, location reminders and Face ID lock are built. Shared with You, the full accessibility audit and App Store prep are **not** — see below. |

### Not built

Named explicitly rather than left to be discovered:

- **Shared with You** (`SharedWithYou` framework). Needs an associated domain
  and a highlight-center implementation; it is a genuinely separate piece of
  work from the Share Extension that covers the same problem.
- **EventKit two-way sync.** `Event.eventKitIdentifier` exists for it; the
  mirroring itself does not. Two-way calendar sync has its own duplicate- and
  loop-avoidance design that shouldn't be hand-waved into a v1.
- **SharePlay, receipt scanning, StandBy layout** — the brief's own stretch list.
- **App icon and asset catalogue.** `project.yml` references `AppIcon`; the
  artwork is not in the repo.
- **StoreKit product configuration.** `TendPlusStore` expects three product IDs
  that have to exist in App Store Connect (and a `.storekit` file for local
  testing).
- **Localisation.** The parser's vocabulary is English; other locales degrade to
  `NSDataDetector` (which is localised) rather than breaking. Strings are not
  extracted.

### Verified vs. claimed

The logic in `TendKit` is covered by tests (recurrence, edit scope, parser,
categoriser, Pulse, Load, deep links). **Nothing here has been compiled or run** —
it was written in a Linux environment with no Swift toolchain, Xcode or
simulator. Expect a first-build pass to surface ordinary compiler complaints.
Nothing about sync timing, background-task behaviour or CloudKit provisioning
can be claimed until it runs on real devices.

---

## Testing

```bash
cd TendKit && swift test          # parser, recurrence, Pulse, Load, routing
```

- **Unit tests** cover the two highest-risk, least-visible surfaces the brief
  calls out — the natural-language parser and recurrence, including all three
  edit scopes, COUNT/UNTIL splitting, and exception-date shifting.
- **UI tests** (`Tests/TendUITests`) drive the single-device critical path.
- **Two-device verification** (`Scripts/two-device-sync-check.sh`) covers share,
  concurrent check-off, leave, removal and iCloud account switching. It is
  partly manual on purpose: the steps that matter are the ones an automated
  harness would paper over.
- **Previews** use `TendModelContainer.preview()`, which loads a realistic
  household — an empty preview tells you nothing about whether a week view works.

---

## Notes on the signature features

**Pulse** is generated by a `BGTaskScheduler` task and stored as a `PulseDigest`,
so opening the widget is a read rather than a query. The scheduler is treated as
a hint, not a promise: Pulse also regenerates on foreground, and the widget
carries a stale-content fallback instead of a blank state.

**Load View** is where the product's point of view lives, so the rules are
enforced in the type, not just the view (`LoadSummary`): household order rather
than volume order, no rank/score/target/streak/delta, descriptive observations
only ("Most of the list check-offs came from Sam this time"), and a caveat that
never leaves the screen — *"This is only what Tend can see. Plenty of the work at
home doesn't get logged anywhere."* Counts come from `completedBy`/`completedAt`,
which is why those fields are written in exactly one place per model.

**Every entry point deep-links to a thing, not to the app.** `DeepLink` is a
single enum with a round-trip test over every case, shared by the app, both
widget bundles, the Live Activity and the Watch complications.
