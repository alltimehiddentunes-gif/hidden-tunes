# Production Build Safety Check — Mobile Only

**Date:** 2026-06-14  
**App:** Hidden Tunes (`hidden-tunes-app`)  
**Commit audited:** `ff74faa` — *Prepare mobile app for tester release*  
**Scope:** Build configuration and release safety audit only. No playback engine, queue, Desktop, TV, CarPlay, or Android Auto changes.

---

## Go / no-go recommendation

### **GO — for internal tester builds (`preview` profile)**

The mobile app can safely produce **standalone tester binaries** when built through EAS **`preview`** (iOS TestFlight internal / Android APK). Config guards prevent the most common release mistakes: dev launcher in standalone builds, CarPlay entitlements, microphone permission, and always-on perf overlays.

### **CONDITIONAL GO — for store `production` profile**

Use **`production`** only after:

1. iOS/Android build numbers incremented (or EAS remote auto-increment confirmed active)
2. One successful **`preview`** device QA pass (playback, background, lock-screen)
3. App Store Connect metadata + privacy link path verified

### **NO-GO — if any of these are true**

| Blocker | Why |
|---------|-----|
| Building with **`developmentClient`** profile for testers | Ships Metro launcher, not Hidden Tunes standalone |
| Reusing iOS build number `1.0.0` on TestFlight | Apple rejects duplicate `CFBundleVersion` |
| Expecting CarPlay or Android Auto in this build | Not configured; would fail review scope expectations |
| Using **Expo Go** for playback QA | Native `HiddenAudio` / RNTP not available |

---

## Automated validation (2026-06-14)

```bash
npm run lint                              # PASS — 0 errors, 35 pre-existing warnings
npm run typecheck                         # PASS
npx expo config --type introspect --json  # PASS — isDebug: false
node scripts/verify-preview-config.js     # PASS
```

---

## Safety checklist (14 items)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | iOS build config | **Pass** | `com.hiddentunes.app`, portrait, `UIBackgroundModes: audio`, encryption exempt false |
| 2 | Android build config | **Pass** | `com.hiddentunes.app`, Hermes, New Arch, adaptive icon |
| 3 | EAS / native profiles | **Pass** | `developmentClient` / `preview` / `production` in `eas.json`; `app.config.js` strips dev client on preview+production |
| 4 | Bundle identifiers | **Pass** | iOS + Android both `com.hiddentunes.app` |
| 5 | Version / build numbers | **Action** | Marketing `1.0.1`; iOS build `1.0.0`; Android `versionCode` `3` — bump before upload |
| 6 | Permissions | **Pass** | Playback-appropriate; `RECORD_AUDIO` blocked on Android |
| 7 | Entitlements | **Pass** | iOS `entitlements: {}` — empty |
| 8 | Background audio | **Pass** | InfoPlist + `expo-media-control` plugin + Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` |
| 9 | CarPlay removed/disabled | **Pass** | No CarPlay keys, no native CarPlay code, no entitlements |
| 10 | Android Auto not required | **Pass** | No automotive manifest entries or AA SDK |
| 11 | Debug flags disabled | **Pass** | All `ENABLE_*` diagnostics false; instrumentation gated on `__DEV__` |
| 12 | Provider branding hidden | **Pass** | Primary UI Hidden Tunes-branded (see `search-provider-branding-audit.md`) |
| 13 | Test-only screens hidden | **Pass** | Perf overlay off; admin/uploader role-gated; diagnostics route not linked |
| 14 | Environment variables documented | **Pass** | See table below; no committed `.env` secrets |

---

## iOS readiness

| Item | Value | Tester-safe? |
|------|-------|--------------|
| Display name | Hidden Tunes | Yes |
| Bundle ID | `com.hiddentunes.app` | Yes — must match App Store Connect + provisioning profile |
| Marketing version | `1.0.1` (`CFBundleShortVersionString`) | Yes |
| Build number | `1.0.0` (`CFBundleVersion`) | **Bump before TestFlight** |
| URL schemes | `hiddentunes`, `com.hiddentunes.app`, `exp+hidden-tunes` | Yes |
| Background modes | `audio` only | Yes — required for music |
| Encryption | `ITSAppUsesNonExemptEncryption: false` | Yes — standard exemption |
| Entitlements | `{}` (empty) | Yes — **no CarPlay**, no push, no iCloud |
| ATS | `NSAllowArbitraryLoads: true` | **Risk** — document for App Review if questioned |
| Native playback | HiddenAudio (iOS); RNTP disabled on iOS (`USE_NATIVE_TRACK_PLAYER_ON_IOS: false`) | By design — do not flip without QA |
| Simulator builds | `simulator: false` in EAS | Yes — device builds only |

### iOS signing / provisioning risks

| Risk | Mitigation |
|------|------------|
| Bundle ID mismatch with Apple Developer portal | Confirm `com.hiddentunes.app` exists under team `hiddentunes_1` / EAS project `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| Expired distribution certificate | EAS manages credentials when using Expo cloud signing; verify in [expo.dev](https://expo.dev) → Credentials |
| First TestFlight upload | Complete export compliance (encryption already declared false in Info.plist) |
| Background audio rejection | Include reviewer note: music streaming app; demo tap-to-play + lock-screen |
| Duplicate build number | Set `ios.buildNumber` to `2+` or enable EAS `autoIncrement` + remote version source |

---

## Android readiness

| Item | Value | Tester-safe? |
|------|-------|--------------|
| Application ID | `com.hiddentunes.app` | Yes |
| `versionCode` | `3` | **Bump to `4+`** for new Play internal track |
| Build type (preview) | APK | Yes — sideload / internal testing |
| Build type (production) | App bundle (AAB) | Yes — Play Store |
| Blocked permission | `RECORD_AUDIO` removed via `tools:node="remove"` | Yes |
| Foreground service | `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Yes — required for background audio |
| RNTP | Enabled on Android (`USE_NATIVE_TRACK_PLAYER: true`) | Yes — lock-screen on Android |
| New Architecture | `newArchEnabled: true` | Yes — monitor for native regressions on first build |
| Edge-to-edge | Enabled | Yes — cosmetic only |

### Android signing risks

| Risk | Mitigation |
|------|------------|
| Keystore not configured in EAS | Run first `eas build` interactively or upload keystore to EAS credentials |
| Wrong package name on Play Console | Must match `com.hiddentunes.app` exactly |
| `SYSTEM_ALERT_WINDOW` in manifest | Expo tooling artifact; not user-facing in release |
| `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` in generated gradle | Dev-client tooling flag in template; **low risk** for standalone release but note if Play flags debug features |

---

## EAS build profiles

Defined in `eas.json`:

| Profile | Dev client | Distribution | Android output | Env |
|---------|------------|--------------|----------------|-----|
| `developmentClient` | **Yes** | internal | APK | `EXPO_PUBLIC_BUILD_PROFILE=developmentClient` |
| `preview` | **No** | internal | APK | `EXPO_PUBLIC_BUILD_PROFILE=preview` |
| `production` | **No** | store | AAB | `EXPO_PUBLIC_BUILD_PROFILE=production` |

`app.config.js` behavior:

- Reads `process.env.EAS_BUILD_PROFILE`
- **Removes** `expo-dev-client` plugin when profile ≠ `developmentClient`
- Sets `extra.isStandaloneBuild: true` / `isDevClientBuild: false` for preview + production
- Injects `expo-splash-screen` if missing
- Forces `UIBackgroundModes: ["audio"]` on iOS merge

Guard script: `node scripts/verify-preview-config.js` — run before every release build.

`eas.json` uses `"appVersionSource": "remote"` with `"autoIncrement": true` on preview/production. Confirm remote versioning is configured in Expo dashboard or bump `app.json` manually.

**No `submit` block in `eas.json`** — submit commands use CLI defaults / interactive credentials.

---

## Config risks

| Severity | Risk | Detail | Action |
|----------|------|--------|--------|
| **High** | Stale iOS build number | `buildNumber: "1.0.0"` | Bump before TestFlight |
| **High** | Wrong EAS profile | `developmentClient` ships dev launcher | Always use `preview` for testers |
| **Medium** | `NSAllowsArbitraryLoads: true` | Mixed HTTP/HTTPS catalog endpoints | Reviewer note; tighten ATS post-launch if possible |
| **Medium** | Profile → Privacy placeholder | `/privacy` exists but Profile menu uses alert | Wire before wide TestFlight (see `testflight-release-prep.md`) |
| **Medium** | Hardcoded API base URL | `https://hidden-tunes-api.onrender.com` in `hiddenTunesApi.ts` | Ensure production API is live; no staging URL leak |
| **Low** | Unguarded `console.log` | `genre.tsx`, `album/[id].tsx`, `onboardingPrewarm.ts`, `downloads.ts` on errors | Acceptable for v1; gate in hygiene pass |
| **Low** | `package.json` version `1.0.0` vs app `1.0.1` | npm metadata only | Align when convenient |
| **Low** | Icon reused as splash | Same PNG for icon + splash | OK for early adopters |
| **Info** | `playbackCriticalLogs` | Defined, **unused** in codebase | No production log spam |
| **Info** | Expo Updates | `EXUpdatesEnabled: false` | No OTA surprises in tester builds |

---

## Debug flags and test UI

### Compile-time / runtime flags (`utils/devDiagnostics.ts`, `constants/playbackConfig.ts`)

| Flag | Value | Production effect |
|------|-------|-------------------|
| `ENABLE_BASIC_PERF_DIAGNOSTICS` | `false` | Off |
| `ENABLE_HEAVY_PERF_DIAGNOSTICS` | `false` | Performance overlay hidden |
| `ENABLE_RUNTIME_INSTRUMENTATION` | `false` | No 60s RNTP/render summary logs |
| `ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS` | `false` | Off |
| `USE_NATIVE_TRACK_PLAYER_ON_IOS` | `false` | iOS uses HiddenAudio only |

All instrumentation helpers check `__DEV__` before logging. `PerformanceOverlay` returns `null` when verification disabled.

### Test-only routes (not in tab bar)

| Route | Exposure |
|-------|----------|
| `/playback-diagnostics` | Manual deep link only |
| `/admin-dashboard` | Profile menu when role = `admin` / `owner` |
| `/uploader-dashboard` | Profile when role = `uploader` / `artist` |
| Default listener testers | Standard tabs only |

### CarPlay / Android Auto

| Platform | Status |
|----------|--------|
| CarPlay | **Not present** — no entitlements, no Swift CarPlay scenes, no `MPPlayableContent` usage in mobile app |
| Android Auto | **Not present** — no `androidx.car` / automotive manifest metadata |

Tester builds do **not** require CarPlay or Android Auto capability declarations.

---

## Provider branding

Primary surfaces (Home, Explore, Search, discovery rails) show **Hidden Tunes** only. Internal `source` fields retain `hidden-tunes` / `audius` / `archive` for debugging but are not shown as UI badges.

Exceptions (acceptable):

- `privacy.tsx` — legal disclosure of third-party APIs
- Radio YouTube fallback rows — **Hidden Tunes TV** product line, not provider chips
- Favorites YouTube items — **Hidden Tunes TV** badge

See `docs/search-provider-branding-audit.md`.

---

## Environment variables

No `.env` files are committed. Build-time and runtime variables:

| Variable | Set by | Required? | Purpose |
|----------|--------|-----------|---------|
| `EAS_BUILD_PROFILE` | EAS / `eas.json` per profile | Cloud builds | Drives `app.config.js` dev-client stripping |
| `EXPO_PUBLIC_BUILD_PROFILE` | `eas.json` env | Optional | `developmentClient` / `preview` / `production` label for app code |
| `EXPO_PUBLIC_SUPABASE_URL` | EAS secrets (optional) | No | Auth when Supabase enabled |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | EAS secrets (optional) | No | Auth anon key |
| `EXPO_METRO_PORT` / `RCT_METRO_PORT` | Local dev scripts | No | Metro tunnel only |
| `CI` / `EXPO_NO_TELEMETRY` | `start-expo-tunnel.js` | No | Local dev only |

**Hardcoded production endpoints (not env-driven):**

- Catalog API: `https://hidden-tunes-api.onrender.com` (`services/hiddenTunesApi.ts`)
- Lyrics API: same host

To override API for a staging build, set EAS env + code support (not implemented — **do not point testers at localhost**).

Recommended EAS secrets (if auth needed later):

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
```

---

## Build commands

### Pre-flight (every build)

```bash
cd hidden-tunes-app

npm run lint
npm run typecheck
npx expo config --type introspect --json
node scripts/verify-preview-config.js
```

Optional: bump versions in `app.json` before cloud build if not using remote auto-increment:

```json
"ios": { "buildNumber": "2" },
"android": { "versionCode": 4 }
```

### Tester builds (recommended)

```bash
# iOS → TestFlight internal
eas build --platform ios --profile preview

# Android → internal APK
eas build --platform android --profile preview
```

Shortcuts:

```bash
npm run build:preview:ios
npm run build:preview:android
```

### Store production (after preview QA)

```bash
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit when ready
eas submit --platform ios
eas submit --platform android
```

### Do **not** use for testers

```bash
eas build --profile developmentClient   # Dev launcher + Metro dependency
expo start                                # Expo Go — no native playback module QA
```

---

## Rollback plan

### Bad binary on TestFlight / internal track

1. **Stop distribution** — disable build for tester groups in App Store Connect / Play Console.
2. **Identify last good commit** — e.g. `ff74faa` or prior green build in EAS dashboard.
3. **Revert if needed:**
   ```bash
   git checkout <good-sha>
   # or
   git revert <bad-sha>
   ```
4. **Increment build numbers** — never reuse failed iOS `CFBundleVersion` or Android `versionCode`.
5. **Rebuild preview:**
   ```bash
   eas build --platform ios --profile preview
   ```
6. **Upload + notify testers** with rollback release notes.

### Config-only mistake (no binary shipped)

1. Fix `app.json` / `eas.json` / `app.config.js`.
2. Re-run `node scripts/verify-preview-config.js`.
3. Commit fix; rebuild.

### Signing / credential failure

1. Check EAS dashboard → Project → Credentials.
2. Regenerate iOS distribution cert or Android keystore **only through EAS** (avoid local keystore drift).
3. Re-run build; do not change bundle ID.

### Backend outage (not a build rollback)

1. Client shows branded warm-up empty states — no binary rollback required.
2. Restore API; testers pull-to-refresh.

---

## Post-build smoke test (required once per platform)

| Step | Pass |
|------|------|
| App opens to tabs (not dev launcher) | Standalone Hidden Tunes |
| No “Perf Verify” overlay | Hidden |
| Play song → MiniPlayer | Works |
| Background 2+ min | Audio continues |
| Lock-screen controls | Play/pause/skip |
| Search → tap song | Plays |
| No Audius/Jamendo/Archive chips | Hidden Tunes UI |

---

## Related docs

- `testflight-release-prep.md` — TestFlight checklist + privacy gap
- `mobile-launch-readiness-audit.md` — Feature readiness 87/100
- `launch-stability-audit.md` — Playback stability
- `scripts/verify-preview-config.js` — Standalone build guard

---

**Signed off:** Config is **safe for EAS `preview` tester builds** after build-number increment and pre-flight script pass. Physical device QA remains the final gate before inviting early adopters.
