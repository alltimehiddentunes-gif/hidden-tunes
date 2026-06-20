# TestFlight Release Prep — Mobile Only

**Date:** 2026-06-14  
**App:** Hidden Tunes (`hidden-tunes-app`)  
**Commit audited:** `23437fd` — *Add mobile launch readiness audit*  
**Scope:** Release configuration audit only. No playback engine, queue, lock-screen, background, Desktop, TV, CarPlay, or Android Auto changes.

---

## Release readiness checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | App version / build numbers | **Action required** | Marketing `1.0.1`; iOS `buildNumber` still `1.0.0`; Android `versionCode` `3`. Bump before first TestFlight upload. |
| 2 | iOS bundle config | **Pass** | `com.hiddentunes.app`, portrait, tablet supported, `ITSAppUsesNonExemptEncryption: false` |
| 3 | Android package config | **Pass** | `com.hiddentunes.app`, adaptive icon, Hermes + New Arch |
| 4 | App icons / splash | **Pass** | `./assets/images/icon.png` (~785 KB) used for icon + splash; black splash background |
| 5 | Permissions | **Pass** | Audio playback permissions only; `RECORD_AUDIO` blocked on Android |
| 6 | Privacy wording | **Partial** | `/privacy` screen exists with support email; Profile → Privacy Policy still opens placeholder alert |
| 7 | Background audio config | **Pass** | `UIBackgroundModes: audio`, `expo-media-control` playback category, Android foreground media service |
| 8 | CarPlay entitlements absent | **Pass** | iOS `entitlements: {}` — no CarPlay keys in resolved config |
| 9 | Provider labels absent (primary UI) | **Pass** | Search/discovery/rails branded Hidden Tunes; policy screen names third parties for legal transparency only |
| 10 | Debug / dev logs production-safe | **Pass** | Runtime instrumentation off; perf overlay off; tap/search logs `__DEV__`-gated |
| 11 | No test-only UI visible | **Pass** | `PerformanceOverlay` returns null when verification disabled; admin tools role-gated |
| 12 | No broken empty screens | **Pass** | Branded `TESTER_COPY` warm-up states; launch sections hide when empty |

**Automated validation (2026-06-14):**

```bash
npm run lint                              # PASS — 0 errors
npm run typecheck                         # PASS
npx expo config --type introspect --json  # PASS
node scripts/verify-preview-config.js     # PASS — preview/production exclude expo-dev-client
```

---

## Build config status

### Version identifiers

| Field | Current value | Source | Tester release note |
|-------|---------------|--------|---------------------|
| Expo marketing version | `1.0.1` | `app.json` | Use for TestFlight “Version” column |
| iOS `CFBundleShortVersionString` | `1.0.1` | introspect | Matches marketing version |
| iOS `CFBundleVersion` (build) | `1.0.0` | `app.json` → `ios.buildNumber` | **Bump to `2`** (or `1.0.2`) before upload |
| Android `versionCode` | `3` | `app.json` | **Bump to `4`** before internal APK/AAB |
| `package.json` version | `1.0.0` | npm metadata only | Cosmetic mismatch; does not affect store builds |

`eas.json` uses `"appVersionSource": "remote"` with `"autoIncrement": true` on **preview** and **production** profiles — EAS can auto-increment build numbers on cloud builds if configured in Expo dashboard.

### iOS bundle

| Setting | Value |
|---------|-------|
| Display name | Hidden Tunes |
| Bundle ID | `com.hiddentunes.app` |
| URL scheme | `hiddentunes` |
| Orientation | Portrait (phone); iPad supports all orientations |
| Background modes | `audio` |
| Encryption export | `ITSAppUsesNonExemptEncryption: false` (standard exemption) |
| Entitlements | **Empty** — no CarPlay, no associated domains in config |
| ATS | `NSAllowsArbitraryLoads: true` (required for mixed HTTP/HTTPS catalog endpoints; document in App Store review notes if asked) |

### Android package

| Setting | Value |
|---------|-------|
| Application ID | `com.hiddentunes.app` |
| Label | Hidden Tunes |
| Adaptive icon | `./assets/images/icon.png` on `#000000` |
| Blocked permission | `RECORD_AUDIO` explicitly removed |
| Declared (runtime) | `INTERNET`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, storage (maxSdk 32) |
| Preview build type | APK (`eas.json` → `preview`) |
| Production build type | App bundle (`eas.json` → `production`) |

### Standalone vs dev client

| Profile | `expo-dev-client` plugin | Opens directly |
|---------|--------------------------|----------------|
| `developmentClient` | Included | Dev launcher + Metro |
| `preview` | **Stripped** by `app.config.js` | Hidden Tunes standalone |
| `production` | **Stripped** | Store-ready standalone |

Verified by `scripts/verify-preview-config.js`.

### Plugins (tester builds)

- `expo-router`
- `expo-media-control` — background audio + playback session
- `expo-splash-screen` — branded splash (200px logo, black background)

`expo-dev-client` remains in `app.json` for local dev but is **removed** from preview/production resolves.

### Assets

| Asset | Path | Status |
|-------|------|--------|
| App icon | `assets/images/icon.png` | Present |
| Splash | Same icon, contain, `#000000` | Present |
| Favicon (web) | Same icon | N/A for mobile store |

**Note:** Icon doubles as splash logo (acceptable for early adopters). Dedicated splash artwork can wait.

### Environment / API

- Catalog API default: `https://hidden-tunes-api.onrender.com` (`hiddenTunesApi.ts`)
- Supabase auth env vars optional (`EXPO_PUBLIC_SUPABASE_*`); app runs without account
- No secrets committed in `app.json` / `eas.json`

---

## Item-by-item audit detail

### 1–3. Version and bundle IDs

Ready structurally. **Blocker is operational:** first TestFlight binary must use a **new** iOS build number. Recommend editing `app.json` before cloud build:

```json
"ios": { "buildNumber": "2" },
"android": { "versionCode": 4 }
```

Or rely on EAS remote auto-increment after linking project settings.

### 4. Icons and splash

Configured consistently. Splash uses `expo-splash-screen` plugin with dark black background — matches app chrome.

### 5. Permissions

Appropriate for a streaming music app:

- **iOS:** background audio only (no microphone, no location in config)
- **Android:** media playback foreground service; microphone explicitly blocked

`SYSTEM_ALERT_WINDOW` may appear in generated Android manifest (Expo tooling); not user-facing for testers.

### 6. Privacy wording

**In-app policy screen** (`app/privacy.tsx`):

- No “free/legal source” language
- Names Audius, Internet Archive, YouTube in **legal disclosure** section (acceptable)
- Contact: `support@hiddentunes.com`
- Last updated: May 6, 2026

**Gap:** Profile → **Privacy Policy** calls `openPlaceholder("Privacy Policy")` instead of `router.push("/privacy")`. Testers tapping Profile will not see the real policy until fixed.

**App Store Connect:** paste policy URL or in-app text; ensure Privacy Nutrition Labels match “no account, optional usage data” stance.

### 7. Background audio

Triple-layer config aligned:

1. `app.json` → `ios.infoPlist.UIBackgroundModes: ["audio"]`
2. `app.config.js` merges `UIBackgroundModes: ["audio"]` on iOS
3. `expo-media-control` plugin → `enableBackgroundAudio: true`, `audioSessionCategory: "playback"`
4. Android manifest includes `FOREGROUND_SERVICE_MEDIA_PLAYBACK`

Playback engine unchanged — config supports existing HiddenAudio + RNTP stack.

### 8. CarPlay entitlements

**Pass.** Resolved Expo introspect shows `"entitlements": {}`. No `com.apple.developer.carplay-*` keys. No CarPlay scene manifests in repo. Safe for TestFlight without CarPlay review scope.

### 9. Provider labels

| Surface | Status |
|---------|--------|
| Search filters / row badges | Hidden Tunes only (`search-provider-branding-audit.md`) |
| Home / Explore / launch rails | Hidden Tunes only |
| Radio / video / podcast discovery | Hidden Tunes kicker + sanitized subtitles |
| Smart Radio fallback rows | “Hidden Tunes” / “Hidden Tunes TV” product lines — not third-party chips |
| Privacy policy | Third-party names for legal transparency only |
| Favorites YouTube items | Badge reads “Hidden Tunes TV” |

No “Jamendo”, “Audius”, or “Archive.org” chips in primary discovery UI. Jamendo module is unwired dead code.

### 10. Debug / dev logs

| System | Production behavior |
|--------|---------------------|
| `ENABLE_RUNTIME_INSTRUMENTATION` | `false` — no 60s summary logs |
| `ENABLE_HEAVY_PERF_DIAGNOSTICS` | `false` — no perf overlay |
| `PerformanceOverlay` | Renders `null` when verification disabled |
| Home/Explore stage logs | `__DEV__` only |
| Search tap traces | `__DEV__` only |
| `hiddenTunesApi` dev logger | `__DEV__` only |
| `playback-diagnostics` route | Deep link only; not linked from Profile for default users |

**Residual production logs:** occasional unguarded `console.log` in `genre.tsx`, `album/[id].tsx`, `playlist/[id].tsx` on load errors — low volume, no PII; acceptable for first tester build. Gate in a future hygiene pass.

### 11. Test-only UI

| UI | Visibility |
|----|------------|
| Performance overlay | Hidden (verification off) |
| Admin dashboard links | Only when `userRole` is `admin` or `owner` |
| Uploader / artist dashboards | Role-gated |
| `/playback-diagnostics` | Manual route; not in tab bar |
| Dev client menu | **Not shipped** in preview/production builds |

Default early-adopter tester (listener role) sees standard tabs + discovery entries only.

### 12. Empty screens

All major surfaces use branded copy via `TESTER_COPY` or section-specific empty panels:

- Home catalog empty → “Your listening room is getting ready…”
- Search no match → branded guidance + emotional world chips
- Video / podcast / radio categories → per-room empty + pull to refresh
- Launch content sections → **hidden** when empty (not broken rails)

Podcast episode tap shows intentional “coming soon” alert — not a blank screen.

---

## Remaining App Store / TestFlight blockers

| Priority | Blocker | Action |
|----------|---------|--------|
| **P0** | iOS build number not incremented | Set `ios.buildNumber` to `2+` or use EAS auto-increment before upload |
| **P0** | Device QA on **preview** standalone build | Confirm lock-screen, background, auto-next on real hardware (not Expo Go) |
| **P0** | Production catalog API reachable | Cold launch should populate Home after refresh; verify Render API uptime |
| **P1** | Profile Privacy Policy → placeholder | Wire to `/privacy` or remove until linked (App Store expects working policy access) |
| **P1** | App Store Connect metadata | Screenshots, description, age rating, encryption questionnaire (already `false`) |
| **P1** | Tester communication | Document that podcast episodes + live radio streams are browse-only in v1.0.1 |
| **P2** | `NSAllowsArbitraryLoads` | Prepare reviewer note if Apple asks about ATS exception |
| **P2** | Align `package.json` version to `1.0.1` | Housekeeping only |

**Not blockers for early-adopter TestFlight:**

- Podcast in-app playback
- Live radio stream playback
- CarPlay / Android Auto
- Dedicated marketing splash art separate from icon

---

## Recommended build command

Run from `hidden-tunes-app/` after bumping build numbers (or confirming EAS remote versioning):

```bash
# 1. Validate
npm run lint
npm run typecheck
npx expo config --type introspect --json
node scripts/verify-preview-config.js

# 2. iOS TestFlight (internal early adopters)
eas build --platform ios --profile preview

# 3. Android internal testers (optional parallel)
eas build --platform android --profile preview

# 4. After QA passes → submit iOS to TestFlight
eas submit --platform ios --profile production
```

**Use `preview` profile first** — internal distribution, standalone app, no dev launcher, APK on Android.

**Do not use Expo Go** for playback QA — native `HiddenAudio` module required.

**Package scripts (shortcuts):**

```bash
npm run build:preview:ios
npm run build:preview:android
```

### Suggested TestFlight cohort copy

> Hidden Tunes 1.0.1 (early adopter) — music streaming, discovery, search, smart recommendations, video browse, podcast browse, and radio browse. Play songs from Home, Search, and playlists. Podcast episodes and live radio streams are browse-only in this build.

---

## Rollback plan

### If a TestFlight build is bad (crashers, playback regression)

1. **Stop distribution** — App Store Connect → TestFlight → disable the bad build for external/internal groups.
2. **Revert code** — identify last good commit (currently `23437fd` or prior `516fb3a`):
   ```bash
   git checkout <good-commit-sha>
   # or revert specific bad commit
   git revert <bad-commit-sha>
   ```
3. **Increment build number** — never reuse a failed build number on iOS; bump `ios.buildNumber` / Android `versionCode`.
4. **Rebuild** — `eas build --platform ios --profile preview` from known-good tree.
5. **Upload new binary** — assign new build to tester group; post release notes explaining rollback.
6. **Keep previous good IPA** — EAS build artifacts remain in Expo dashboard for re-submit if needed.

### If backend/catalog causes empty app (not a client bug)

1. Roll forward client only if cache mitigations fail — no binary rollback needed.
2. Restore API / CDN; testers pull-to-refresh Home.
3. Communicate via TestFlight release notes — no emergency store rollback required.

### If Apple rejects binary

| Rejection reason | Response |
|------------------|----------|
| Missing privacy policy link | Fix Profile → `/privacy`, resubmit |
| ATS / arbitrary loads | Document HTTPS catalog + required exceptions |
| Background audio misuse | Demo music playback in review notes + screen recording |
| Incomplete functionality | Clarify early-adopter scope; hide or label browse-only features in metadata |

### Emergency hotfix branch workflow

```bash
git checkout -b hotfix/testflight-1.0.1.1 main
# minimal fix only
git commit -m "Fix TestFlight blocker: <short description>"
eas build --platform ios --profile preview
eas submit --platform ios
```

---

## Pre-upload manual matrix (one device per platform)

| Step | Pass criteria |
|------|---------------|
| Cold launch | Splash → tabs; no crash |
| Home | Content or branded warm-up; scroll smooth |
| Play song | MiniPlayer; lock-screen controls |
| Background | Audio continues 2+ minutes |
| Auto-next | Second track starts |
| Search | Results + tap plays |
| Profile → Privacy | **Currently fails** — placeholder; fix before wide TestFlight |
| No dev overlay | No “Perf Verify” box on screen |
| No provider chips | Search/Home clean |

---

## Related docs

- `mobile-launch-readiness-audit.md` — feature-phase readiness (87/100)
- `launch-stability-audit.md` — Phase 1 playback stability
- `search-provider-branding-audit.md` — Search branding
- `scripts/verify-preview-config.js` — standalone build guard

---

**Sign-off:** Config and automated checks are **ready for preview build** after build-number bump and Profile privacy link fix. Physical device QA is the final gate before inviting early adopters on TestFlight.
