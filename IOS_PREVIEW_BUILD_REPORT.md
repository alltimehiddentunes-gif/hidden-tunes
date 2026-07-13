# Hidden Tunes iOS Preview Build Report

## Build summary
- **Status:** `finished` (EAS confirmed)
- **EAS build ID:** `49cc9ead-693b-4b1a-87ad-237164251e83`
- **Build URL:** https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/49cc9ead-693b-4b1a-87ad-237164251e83
- **Platform:** iOS
- **Profile:** `preview`
- **Distribution:** internal (ad hoc)
- **Git commit:** `e1026c9a32b0866c8ddb754d291464a16251748c`
- **Protected tag:** `protected-clean-1.0.142-ios-preview`
- **Protected folder:** `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142-IOS-PREVIEW-PROTECTED`

## App version submitted
- App version: `1.0.1`
- iOS build number (EAS remote): `1.0.162`
- Bundle identifier: `com.hiddentunes.app`
- Expo SDK: `56.0.0`

## Command executed
```powershell
cd "C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142-IOS-PREVIEW-PROTECTED"
npx eas-cli@latest build --platform ios --profile preview --non-interactive
```

## Credentials
- **Type:** EAS remote iOS credentials (ad hoc)
- **Distribution certificate:** active (expires 2027-05-26)
- **Provisioning profile:** active (Developer Portal ID `5L2XR38W8R`)
- **Apple Team:** `299CMT9CHH`

## Registered device
- iPhone UDID in provisioning profile: `00008130-0014244621D2001C`
- **Install eligibility:** installable on registered device(s) included in the ad hoc profile only

## Validation on protected copy (pre-build)
| Check | Result |
|-------|--------|
| `git status` | clean |
| `git describe --tags --exact-match` | `protected-clean-1.0.142-ios-preview` |
| `npm ci` | passed |
| `npm run typecheck` | passed |
| `npx expo-doctor` | 2 non-blocking warnings (11 packages behind SDK 56 recommended patch versions) |
| `npx expo config --type public` | passed |

## Repair queue included in build commit lineage
- Home vertical grid overlap: `c8979a1`, `31f3491`
- TV search: `c00accf`
- Bottom tabs/footer overlap: `615d687`, `31f3491`
- TV Pause/Resume/Next/Previous: `236221b`
- TV double-loading flicker: `63a7524`
- Stabilization baseline: `1bac5d4`, `e1026c9`

## Device validation
- **Not performed in this automation session.** Physical device verification of Home/TV/shared flows remains required on the registered iPhone before treating this build as production-ready.

## Known remaining issues
- Expo Doctor reports 11 dependency patch-version drifts (non-blocking for this build).
- Physical device regression checklist not executed by Cursor in this session.

## Installation
Open on registered iPhone:
https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/49cc9ead-693b-4b1a-87ad-237164251e83
