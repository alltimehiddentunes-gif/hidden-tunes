# Build Report — ea07f16

**Date:** 2026-06-21  
**Branch:** `carplay-scene-safe-test`  
**Commit:** `ea07f16` — *Scale radio and podcast discovery with mature access*  
**EAS account:** `hiddentunes_1` (`mygermanlevel@gmail.com`)  
**Project:** `@hiddentunes_1/hidden-tunes` (`9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c`)

---

## 1. Repository state

| Check | Result |
|-------|--------|
| Branch | `carplay-scene-safe-test` |
| HEAD | `ea07f16 Scale radio and podcast discovery with mature access` |
| Working tree at build time | Clean |
| Remote | Up to date with `origin/carplay-scene-safe-test` |

Recent history:

```
ea07f16 Scale radio and podcast discovery with mature access
ec6e820 Harden mature podcast gating for shows and episodes
102b589 Add mature content consent controls
b99d202 Update radio scale target to 40k stations
8026109 Harden browsing performance and reduce heat
```

---

## 2. Pre-build validation

| Command | Result | Notes |
|---------|--------|-------|
| `npm install` | **Pass** | 894 packages; postinstall patch applied |
| `npm run typecheck` | **Pass** | `tsc --noEmit` clean |
| `npm run lint` | **Fail (known baseline)** | 177 problems (99 errors, 78 warnings) — pre-existing; not introduced by `ea07f16` |
| `npx expo-doctor` | **2 known failures** | See below |
| `git diff --check` | **Pass** | No whitespace errors |

### Known lint issues (baseline)

- **177 total** — mostly `react-hooks/*`, `@typescript-eslint/no-unused-vars`, and `import/no-duplicates`
- Representative files: `DebouncedSearchInput.tsx`, `NestedSongList.tsx`, `hiddenAudioBridge.ts`
- **No source changes made** during this release prep

### Known expo-doctor issues (baseline)

1. **`@react-navigation/native` alongside expo-router** — SDK 56 migration advisory; builds still succeed
2. **10 Expo patch version mismatches** — e.g. `expo@56.0.8` vs expected `~56.0.12`, `expo-router@56.2.8` vs `~56.2.11`

### Other npm warnings (baseline)

- `npm audit`: 12 moderate severity vulnerabilities
- EAS billing notice: 100% of included build credits used; additional builds billed pay-as-you-go

---

## 3. Apple Developer Agreement (PLA)

**Status: Resolved — no blocker for this release.**

Evidence:

- iOS production credentials fetched successfully (distribution cert + provisioning profile active)
- iOS production build `e0753eb3-f212-4ea1-9a2b-f856015a64dc` completed without PLA errors
- Prior iOS production build `a7ee448a-0972-494a-bae1-801ffa688bf2` also **FINISHED** on 2026-06-21

No Apple Program License Agreement action required before submission.

---

## 4. Android production build

| Field | Value |
|-------|-------|
| **Command** | `eas build --platform android --profile production --clear-cache --non-interactive` |
| **Build ID** | `dd29f9f3-23b8-45ee-ad85-01e009458e48` |
| **Build page** | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/dd29f9f3-23b8-45ee-ad85-01e009458e48 |
| **Status** | **FINISHED** |
| **Artifact (AAB)** | https://expo.dev/artifacts/eas/MM1Is-PjnOUdY29_vUgExuYs7WVkPrC09ntjoiMoScA.aab |
| **Profile** | `production` (store / app-bundle) |
| **App version** | 1.0.1 |
| **versionCode** | 85 (auto-incremented from 84) |
| **Git commit** | `ea07f161871e15fc94ed02d5aa301c3faf9fb98d` |
| **Started** | 2026-06-21T15:34:07Z |
| **Completed** | 2026-06-21T15:58:04Z |
| **Build duration** | ~23.3 min (queue + compile) |

EAS warnings (non-blocking):

- `android.versionCode` in app config ignored when remote version source is enabled
- Build credits exhausted for included monthly quota

---

## 5. iOS production build

| Field | Value |
|-------|-------|
| **Command** | `eas build --platform ios --profile production --clear-cache --non-interactive` |
| **Build ID** | `e0753eb3-f212-4ea1-9a2b-f856015a64dc` |
| **Build page** | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/e0753eb3-f212-4ea1-9a2b-f856015a64dc |
| **Status** | **FINISHED** |
| **Artifact (IPA)** | https://expo.dev/artifacts/eas/5RildAa-dOP-Ke_YISp7YQOLOtmHI3F1GYvZpANoGJY.ipa |
| **Profile** | `production` (App Store) |
| **App version** | 1.0.1 |
| **Build number** | 1.0.116 (auto-incremented from 1.0.115) |
| **Bundle ID** | `com.hiddentunes.app` |
| **Git commit** | `ea07f161871e15fc94ed02d5aa301c3faf9fb98d` |
| **Started** | 2026-06-21T15:40:28Z |
| **Completed** | 2026-06-21T15:45:13Z |
| **Build duration** | ~4.8 min (queue + compile) |

Credentials used:

- Distribution certificate (expires 2027-05-26)
- App Store provisioning profile (active, updated same day)
- App Store Connect API key from EAS credentials service

---

## 6. Release submission commands (manual — not executed)

### Android — Google Play upload

Submit the finished AAB by build ID:

```bash
cd /home/wills/hidden-tunes-app
eas submit --platform android --id dd29f9f3-23b8-45ee-ad85-01e009458e48 --non-interactive
```

Or submit the latest Android production build:

```bash
eas submit --platform android --latest --non-interactive
```

Or submit the artifact URL directly:

```bash
eas submit --platform android --url "https://expo.dev/artifacts/eas/MM1Is-PjnOUdY29_vUgExuYs7WVkPrC09ntjoiMoScA.aab" --non-interactive
```

Package: `com.hiddentunes.app` · Track: production (configure in Play Console / submit profile if needed).

### iOS — TestFlight / App Store Connect

Submit the finished IPA by build ID:

```bash
cd /home/wills/hidden-tunes-app
eas submit --platform ios --id e0753eb3-f212-4ea1-9a2b-f856015a64dc --non-interactive
```

Or submit the latest iOS production build:

```bash
eas submit --platform ios --latest --non-interactive
```

Optional — add internal TestFlight group and release notes:

```bash
eas submit --platform ios --id e0753eb3-f212-4ea1-9a2b-f856015a64dc \
  --groups "Internal Testers" \
  --what-to-test "Radio/podcast discovery at 40/page, mature content gating, deferred search sections." \
  --non-interactive
```

---

## 7. Known blockers

| Blocker | Status |
|---------|--------|
| Apple PLA / Developer Agreement | **None** — builds succeeded |
| Android production build | **None** — FINISHED |
| iOS production build | **None** — FINISHED |
| Source code changes required | **None** |

---

## 8. Next recommended actions

1. **Commit this report** (optional): `git add docs/build-report-ea07f16.md && git commit -m "Add build report for ea07f16 release"`
2. **Submit Android AAB** to Google Play internal/production track using commands above
3. **Submit iOS IPA** to TestFlight using `eas submit --platform ios --id e0753eb3-f212-4ea1-9a2b-f856015a64dc`
4. **Smoke test on device** after TestFlight/Play install:
   - Music, radio, podcast, and video playback unchanged
   - Radio/podcast discovery loads 40 items then paginates
   - Mature content OFF by default; consent required when enabled
   - Main search shows music first; podcasts/radio deferred at bottom
5. **Schedule dependency hygiene** (non-blocking): `npx expo install --check` to align SDK 56 patch versions; evaluate removing `@react-navigation/native` per expo-doctor

---

## 9. Scope preserved

No source code was modified during release prep. Unchanged:

- HiddenAudio / playback / queue architecture
- CarPlay / Android Auto / Desktop
- Premium UI and animations
- Radio, podcast, video, mature-content, and search behavior
