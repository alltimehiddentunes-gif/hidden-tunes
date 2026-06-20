# Final Tester Build Package — Mobile Only

**Date:** 2026-06-14  
**App:** Hidden Tunes (`hidden-tunes-app`)  
**Package commit:** `d8da7ee14e862e14c79b9ea57ad1873f9d2972f7`  
**Branch:** `main` (synced with `origin/main`)

---

## Pre-build verification (10 checks)

| # | Check | Status |
|---|-------|--------|
| 1 | Latest commit pushed | **Pass** — `d8da7ee` = `origin/main` |
| 2 | Working tree clean (mobile) | **Pass** — `hidden-tunes-app/` has no local changes |
| 3 | Version / build numbers | **Action before first upload** — see table below |
| 4 | iOS build command documented | **Pass** — below |
| 5 | Android build command documented | **Pass** — below |
| 6 | TestFlight notes written | **Pass** — below (copy-paste ready) |
| 7 | Android internal tester notes | **Pass** — below (copy-paste ready) |
| 8 | Known issues honest + short | **Pass** — below |
| 9 | Rollback commit documented | **Pass** — below |
| 10 | Tester checklist documented | **Pass** — below |

**Note:** Repo root may contain unrelated dirty/untracked files (Desktop, scripts). They are **not** part of this mobile build. Build only from `hidden-tunes-app/` at commit `d8da7ee`.

**Automated validation (2026-06-14):**

```bash
npm run lint                              # PASS — 0 errors
npm run typecheck                         # PASS
npx expo config --type introspect --json  # PASS
```

---

## Version identifiers

| Field | Value in `app.json` | First tester build target |
|-------|---------------------|---------------------------|
| Marketing version | `1.0.1` | Keep `1.0.1` |
| iOS `buildNumber` | `1.0.0` | **`2`** (or let EAS `autoIncrement` on `preview`) |
| Android `versionCode` | `3` | **`4`** (or EAS auto-increment) |
| iOS bundle ID | `com.hiddentunes.app` | Unchanged |
| Android package | `com.hiddentunes.app` | Unchanged |
| EAS project | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` | Unchanged |

`eas.json` sets `"appVersionSource": "remote"` and `"autoIncrement": true` on **`preview`**. If remote versioning is enabled in Expo dashboard, cloud builds may bump build numbers automatically. Otherwise, edit `app.json` before running EAS.

**Recommended label for testers:** `Hidden Tunes 1.0.1 (build 2)` — adjust after EAS assigns the final build number.

---

## Pre-flight commands (run once before EAS)

```bash
cd hidden-tunes-app

git fetch origin
git checkout main
git pull origin main
# Confirm: git rev-parse HEAD → d8da7ee14e862e14c79b9ea57ad1873f9d2972f7

npm run lint
npm run typecheck
npx expo config --type introspect --json
node scripts/verify-preview-config.js
```

Optional manual bump in `app.json` if not using EAS remote auto-increment:

```json
"ios": { "buildNumber": "2" },
"android": { "versionCode": 4 }
```

---

## iOS tester build command

**Profile:** `preview` (standalone app, internal distribution, **not** dev client)

```bash
cd hidden-tunes-app
eas build --platform ios --profile preview
```

Shortcut:

```bash
npm run build:preview:ios
```

After build completes:

1. Download IPA from [expo.dev](https://expo.dev) → project **hidden-tunes**
2. Submit to TestFlight (if not auto-submitted):
   ```bash
   eas submit --platform ios --latest
   ```
3. App Store Connect → TestFlight → add **internal** testers → paste release notes below

**Do not use:** `developmentClient` profile or Expo Go for this tester cohort.

---

## Android tester build command

**Profile:** `preview` (standalone APK, internal sideload)

```bash
cd hidden-tunes-app
eas build --platform android --profile preview
```

Shortcut:

```bash
npm run build:preview:android
```

After build completes:

1. Download APK from EAS build page
2. Distribute via email, Drive, or internal track (Firebase App Distribution, etc.)
3. Send **Android internal tester notes** below
4. Testers may need “Install unknown apps” enabled for sideload

**Do not use:** `production` AAB for sideload testers unless using Play internal testing.

---

## TestFlight release notes (copy-paste)

**What’s New — Hidden Tunes 1.0.1 (Early Adopter)**

Hidden Tunes is ready for early listening tests. This build focuses on **music streaming and discovery**.

**Try this:**
- Home — scroll recommendations, Trending Now, Featured Playlists
- Search — find a song and tap to play
- Explore — worlds, genres, moods
- MiniPlayer — play/pause while browsing
- Lock your phone — music should continue; use lock-screen controls
- Queue — skip tracks; auto-next should advance

**Also in this build:**
- Hidden Tunes Radio (station browse)
- Hidden Tunes Videos (category browse → video player)
- Hidden Tunes Podcasts (browse shows and episodes)
- Smart recommendations (Recommended For You, Because You Played, etc.)

**Please report:**
- Crashes, frozen screens, or songs that won’t play
- Lock-screen / background playback issues
- Search results that feel wrong or empty after refresh

**Not in this build yet:**
- Podcast episode playback (tap shows a coming-soon message)
- Live internet-radio stream playback (opens listening-room fallback)
- CarPlay and Android Auto

**Need internet** for catalog and search. Pull down on Home to refresh if the catalog looks empty.

Thank you for testing Hidden Tunes.

---

## Android internal tester notes (copy-paste)

**Hidden Tunes 1.0.1 — Early Adopter APK**

Install the attached APK (allow installs from this source if prompted).

**Focus:** music play, search, discovery, background playback, lock-screen controls.

**Quick test:** open app → play a song from Home → lock phone → confirm audio continues → unlock and skip next track.

**Browse-only (not full playback yet):** podcast episodes, live radio streams.

**Not supported:** Expo Go, CarPlay, Android Auto.

If Home looks empty, pull to refresh on a good connection.

Send feedback: crashes, playback stops, search misses, UI glitches.

---

## Known issues (honest, short)

| Issue | Impact | Workaround |
|-------|--------|------------|
| Profile → Privacy Policy opens placeholder | Policy not linked from Profile menu | Open isn’t required for core test; full text at route `/privacy` if deep-linked |
| Podcast episode tap | Alert only — no in-app podcast player | Expected for v1.0.1; browse shows/episodes still testable |
| Live radio “Tune in” | No direct stream playback | Use listening-room fallback or Smart Radio for music |
| Thin catalog on first launch | Branded “warming up” empty copy | Pull to refresh; ensure API online |
| iOS lock-screen | Uses HiddenAudio path (RNTP off on iOS by design) | Report skip/pause bugs specifically on iOS |
| Some discovery rooms sparse | Tags/backend seeding | Empty rooms show Hidden Tunes copy, not broken UI |
| First TestFlight upload | `buildNumber` was `1.0.0` in repo | EAS auto-increment or manual bump to `2` before upload |

No fake songs are injected. No third-party provider badges on Home, Search, or Explore rails.

---

## Rollback plan

### Known-good source commit (this package)

```
d8da7ee14e862e14c79b9ea57ad1873f9d2972f7
Add production build safety check
```

### Previous stable mobile commits (if rollback needed)

| Commit | Message |
|--------|---------|
| `ff74faa` | Prepare mobile app for tester release |
| `23437fd` | Add mobile launch readiness audit |
| `516fb3a` | Polish launch content layer for mobile release |

### Rollback procedure

1. **Stop distribution** — disable bad build in TestFlight / recall APK link.
2. **Checkout known-good commit:**
   ```bash
   cd hidden-tunes-app
   git fetch origin
   git checkout d8da7ee14e862e14c79b9ea57ad1873f9d2972f7
   ```
   Or an earlier row from the table above if `d8da7ee` introduced the regression.
3. **Increment build numbers** — never reuse a rejected iOS build number.
4. **Re-run pre-flight** (lint, typecheck, `verify-preview-config.js`).
5. **Rebuild:**
   ```bash
   eas build --platform ios --profile preview
   eas build --platform android --profile preview
   ```
6. **Notify testers** with rollback note and new build link.

### Backend-only outage (no binary rollback)

If the app opens but catalog is empty, restore `https://hidden-tunes-api.onrender.com` — testers pull-to-refresh Home.

---

## Manual test checklist (testers + QA)

Run on **real devices** after installing preview build. Do **not** use Expo Go.

### Launch and discovery

- [ ] Cold launch → splash → tabs without crash
- [ ] Home loads content or branded warm-up message within one refresh
- [ ] Scroll Home and Explore smoothly (no severe jank)
- [ ] Search finds a common song; tap plays

### Playback core

- [ ] Tap song → MiniPlayer appears and audio starts
- [ ] Play / pause from MiniPlayer
- [ ] Full player screen opens and controls work
- [ ] Auto-next advances to next track in queue
- [ ] Background 2+ minutes — audio continues
- [ ] Lock-screen play / pause / skip work (platform-specific)

### Launch content rails

- [ ] Featured Playlist opens and Play All works
- [ ] Smart Radio chip opens listening room
- [ ] Continue Exploring chips open Videos / Podcasts / Radio entry

### Browse-only surfaces (expected limitations)

- [ ] Podcast episode tap shows coming-soon alert (not a crash)
- [ ] Radio station “Tune in” shows fallback (not a crash)
- [ ] Video category opens WebView player

### Branding and polish

- [ ] No Audius / Archive / Jamendo labels on Home or Search
- [ ] No “Perf Verify” debug overlay
- [ ] App opens as Hidden Tunes (not Expo dev launcher)

### Report failures with

Device model, OS version, steps, song/search query if relevant, screenshot or screen recording if possible.

---

## Related docs

- `production-build-safety-check.md` — config safety + go/no-go
- `testflight-release-prep.md` — TestFlight prep checklist
- `mobile-launch-readiness-audit.md` — feature readiness (87/100)
- `scripts/verify-preview-config.js` — standalone build guard

---

**Package status:** Ready to run EAS **`preview`** builds from `d8da7ee` after build-number increment (manual or EAS auto). Invite testers only after one internal QA pass on each platform.
