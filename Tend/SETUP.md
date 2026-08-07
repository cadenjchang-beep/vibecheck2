# Setting up Tend

Six steps. Steps 1 and 3 are on Apple's websites and can't be scripted;
everything else is a command.

---

## 0. Start this now — it's the long pole

Enrol in the [Apple Developer Program](https://developer.apple.com/programs).
It's $99/year and approval can take a day or two. CloudKit, App Groups and
TestFlight all require it; a free account cannot use any of them.

While you wait, install the tools:

```bash
xcode-select --install
brew install xcodegen
```

…and install **Xcode 16 or later** from the Mac App Store. Open it once so it
can finish installing components.

---

## 1. Get your Team ID

[developer.apple.com/account](https://developer.apple.com/account) → **Membership**.
It's 10 characters, like `A1B2C3D4E5`.

---

## 2. Configure the project

Pick a bundle prefix you control — `com.yourname.tend` — then:

```bash
git clone https://github.com/cadenjchang-beep/vibecheck2.git
cd vibecheck2
git checkout claude/tend-household-app-psrmsd
cd Tend
Scripts/configure.sh com.yourname.tend A1B2C3D4E5
```

That rewrites every identifier — bundle IDs, iCloud container, app group,
background-task IDs — consistently across `project.yml`, the entitlements, the
Info.plists and the Swift source, then generates `Tend.xcodeproj`.

It finishes by printing the exact list of identifiers for the next step. Keep
that output on screen.

---

## 3. Register those identifiers with Apple

[developer.apple.com/account](https://developer.apple.com/account) →
**Certificates, Identifiers & Profiles**. Create, in this order:

1. **iCloud Containers** → `iCloud.com.yourname.tend`
2. **App Groups** → `group.com.yourname.tend`
3. **App IDs** → five of them, exactly as the script printed. Each needs
   **iCloud** (pointing at the container) and **App Groups** ticked. The main
   app also needs **Push Notifications**.

The five App IDs are the step people skip. Skip it and the widget, the Watch app
and the share extension quietly read an empty store — they don't error, they
just show nothing.

---

## 4. Open it and sign in

```bash
open Tend.xcodeproj
```

- **Xcode → Settings → Accounts → +** and add your Apple ID.
- For each of the five targets: **Signing & Capabilities** → tick *Automatically
  manage signing* → pick your team.

---

## 5. Build

Logic tests first — no simulator, no signing needed:

```bash
cd TendKit && swift test
```

Then ⌘B in Xcode.

**Expect compiler errors.** This code has never been through a compiler. Fix
them in the source files; you only need to re-run `xcodegen generate` if you add
or remove files.

---

## 6. Run it — with two accounts

Run on a simulator (⌘R) and sign into iCloud in the simulator's Settings app.

Then boot a **second** simulator signed into a **different** Apple ID, install
there too, and walk through `Scripts/two-device-sync-check.sh`.

One Apple ID tests almost nothing here. The entire product is the second person.

---

# Then: shipping

Once it builds and syncs, in order:

1. **Artwork.** Drop a 1024×1024 PNG into
   `Apps/Tend/Assets.xcassets/AppIcon.appiconset/`, add
   `"filename" : "<yourfile>.png"` to its `Contents.json`, and do the same for
   `Apps/TendWatch/`. The catalogues are already wired up and the accent colour
   is already Tend's sage — only the icon image is missing.

2. **Deploy the CloudKit schema.** [icloud.developer.apple.com](https://icloud.developer.apple.com)
   → your container → **Deploy Schema to Production**.

   Until you do, development builds sync fine and every TestFlight and App Store
   build syncs nothing. This is the most common way a CloudKit app ships broken.
   Redo it after any schema change.

3. **Create the app record** at [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
   You'll need screenshots, a privacy policy URL, and a support URL. For privacy
   labels, **Data Not Collected** is accurate — everything stays in the user's
   own iCloud database and never reaches you.

4. **Decide about Tend+.** Either create the three subscription products, or
   delete the Tend+ section from `SettingsScreen.swift` for v1. A paywall
   pointing at products that don't exist is a guaranteed rejection.

5. **Archive and upload.** Destination *Any iOS Device* → **Product → Archive**
   → **Distribute App → App Store Connect**.

6. **Beta with real households**, not just yourself. Watch the crash-free rate.

7. **Submit** — and in the review notes, say explicitly that household sharing
   needs a second iCloud account, with step-by-step instructions. A reviewer who
   can't make the headline feature work will reject it.
