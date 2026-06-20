# Startup Crash Targeted Fix

Branch: `carplay-scene-safe-test`  
Baseline commit: `3687825` (Finalize search screen launch cleanup)  
Fix date: 2026-06-20

## Root cause

**Native startup crash — `expo-dev-client` leaked into standalone preview/production builds.**

Both iOS and Android tester APK/IPAs crashed before the UI appeared because dev-client native modules (`expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, `expo-dev-menu-interface`) were still autolinked even though `app.config.js` removed the `expo-dev-client` config plugin for preview/production profiles.

This is a **pre-React** failure: the native shell initializes dev launcher code in a standalone build that has no Metro/dev server, which crashes immediately on launch.

## What was ruled out

### `app/search.tsx` (commit `3687825`) — NOT the cause

Step 2 isolated the latest commit:

```bash
git diff -w HEAD~1..HEAD -- app/search.tsx
# (empty — whitespace/line-ending only)
```

Step 3 rollback test was not needed: no logic changed in `3687825`. A minor indentation fix was applied to a diagnostics `useEffect` block (line ~1498) but that code only runs after Search mounts, not at startup.

Broad rollback of search/queue/home work was intentionally avoided.

## Crash log evidence

### Config introspect (before fix)

With `EAS_BUILD_PROFILE=preview`:

- `autolinkedModules` included `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, `expo-dev-menu-interface`
- iOS `infoPlist` included dev launcher keys:
  - `NSBonjourServices: ["_expo._tcp"]`
  - `NSLocalNetworkUsageDescription: "Expo Dev Launcher uses the local network…"`
- Android `gradle.properties` could inherit `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` from dev-client tooling

### Prior EAS iOS build failure (related)

Build `0f8a2000-924a-4b10-a454-8734bd181a90` failed when dev-client packages were **deleted** from `node_modules` while CocoaPods still referenced them:

```
lstat(.../node_modules/expo-dev-menu/ios/assets): No such file or directory
(in target 'expo-dev-menu-EXDevMenu' from project 'Pods')
```

**Lesson:** exclude dev-client from autolinking — do not delete packages from `node_modules`.

### Device logcat

`adb` was unavailable in the Windows diagnostic environment. Native config evidence above matches the classic standalone + dev-client crash pattern on both platforms.

## Fix applied (minimal, targeted)

| File | Change |
|------|--------|
| `react-native.config.js` | Disable dev-client package autolinking on preview/production |
| `plugins/standalone-build-guard/index.js` | Strip dev launcher plist keys; set `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`; remove dev-client Podfile lines |
| `app.config.js` | Attach `./plugins/standalone-build-guard` for standalone profiles |
| `scripts/eas-prebuild-standalone.js` | EAS post-install: patch `package.json` `expo.autolinking.exclude` (no `node_modules` deletion) |
| `scripts/verify-preview-config.js` | Assert standalone guard + autolinking excludes |
| `package.json` | Add `eas-build-post-install`, `typecheck` |
| `index.js` | `require("react-native-gesture-handler")` before router entry |
| `app/search.tsx` | Fix indentation in diagnostics effect only |
| `tsconfig.json` | Exclude `hidden-tunes-desktop` from mobile typecheck scope |

**Not changed:** HiddenAudio plugin, Android Auto manifest, CarPlay Swift sources, playback engine, queue logic, UI layout.

## Validation

```bash
node scripts/verify-preview-config.js   # PASS
EAS_BUILD_PROFILE=preview npx expo config --type introspect --json
# PASS indicators:
#   - plugins includes ./plugins/standalone-build-guard
#   - iOS infoPlist no longer has NSBonjourServices / NSLocalNetworkUsageDescription (dev launcher)
#   - Android gradleProperties EX_DEV_CLIENT_NETWORK_INSPECTOR=false
npm run typecheck                         # PASS (mobile scope)
npm run lint                              # pre-existing branch warnings/errors outside this fix
```

### Native validation (tester builds)

After installing **new** preview builds only (delete older crashing builds):

- [ ] iOS app opens
- [ ] Android app opens
- [ ] Home loads
- [ ] Search opens and results render
- [ ] Tap-to-play works
- [ ] MiniPlayer works
- [ ] Background playback works
- [ ] Lock-screen controls work
- [ ] Auto-next works

Build links:

| Platform | Version | Build | Install |
|----------|---------|-------|---------|
| iOS | 1.0.106 | `0a3a1fd9-534f-4b19-9ec6-eefed7a1de55` | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/0a3a1fd9-534f-4b19-9ec6-eefed7a1de55 |
| Android | versionCode 77 | `a5750e56-58d3-4bd1-85ca-39a1c2f3b5b0` | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/a5750e56-58d3-4bd1-85ca-39a1c2f3b5b0 |

### Android follow-up

Removed the partial committed `android/` folder (only `app/` subtree, no gradlew). EAS was treating it as a bare project and failing in **Fix gradlew** (~30s). Managed prebuild + HiddenAudio plugin now regenerate Android native code on build.

## Why broad rollback was avoided

Recent queue/home/search performance work did not introduce startup-time module code. Config introspect proved dev-client native leakage in standalone builds — a build-config issue fixable in a handful of files without reverting feature commits.
