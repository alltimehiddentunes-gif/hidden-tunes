# First CarPlay Audio iOS Preview Build Result

## SUCCESS — CarPlay Audio iOS preview build (c5559f5)

| Field | Value |
| --- | --- |
| Status | **FINISHED** (successful) |
| Build ID | `9bb39d32-22dd-4cbc-bd37-ce01743a61bd` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/9bb39d32-22dd-4cbc-bd37-ce01743a61bd |
| Profile | `preview` (INTERNAL / Ad Hoc distribution) |
| Platform | iOS (device, not simulator) |
| App version | `1.0.1` |
| Build number | `1.0.171` |
| gitCommitHash (EAS) | `c5559f5d728bede455703dc1188bcc4b7e6edd59` |
| Artifact IPA | https://expo.dev/artifacts/eas/oS29nyt1YmhHS0DrOt8WneeH0vwg1zIusEJtLUda404.ipa |
| Local IPA path | `/tmp/hiddentunes-carplay-preview.ipa` |
| Created | `2026-07-18T18:22:04.460Z` |
| Completed | `2026-07-18T18:26:29.121Z` |

### Fix summary (why this build succeeded)

Commit `c5559f5` — *Fix CarPlay search delegate to use CPListItem signature*:

1. **Search results type**: `CPSearchTemplateDelegate.updatedSearchText` completion handler changed from `[any CPListTemplateItem]` back to `[CPListItem]` (matches the CarPlay SDK used on EAS).
2. **Scene disconnect selector**: `CarPlaySceneDelegate` method renamed to `didDisconnectInterfaceController` (correct `CPTemplateApplicationSceneDelegate` selector; prior `didDisconnect` did not match).

Files: `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift`, `plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift`.

### Signed entitlement verification (IPA)

Decoded `embedded.mobileprovision` with `openssl smime` and extracted the codesigned entitlements plist from the `HiddenTunes` Mach-O (`codesign` unavailable on Linux).

| Check | Result |
| --- | --- |
| Signed `com.apple.developer.carplay-audio` | **`true`** (present in codesigned entitlements blob) |
| Signed `com.apple.developer.carplay-video` | **Absent** from codesigned entitlements (0 matches in binary entitlement XML) |
| Provision profile allows carplay-audio | `true` |
| Provision profile allows carplay-video | `true` (capability on Ad Hoc profile; **not** included in the app's signed entitlements) |

### Remaining manual tests (agent cannot perform)

| Test | Status |
| --- | --- |
| Install IPA / internal distribution on physical iPhone | **pending/manual** |
| Open app / smoke test on iPhone | **pending/manual** |
| Connect real CarPlay and confirm Hidden Tunes icon on car screen | **pending/manual** |
| Browse / search / play via CarPlay Audio UI | **pending/manual** |

### Final checklist answers (successful build)

| Question | Answer |
| --- | --- |
| Build status | **SUCCESS** (`FINISHED`) |
| Fix commit | `c5559f5` (`CPListItem` not `CPListTemplateItem`; `didDisconnectInterfaceController`) |
| Does signed app contain CarPlay Audio? | **Yes** — `com.apple.developer.carplay-audio` = `true` |
| Is CarPlay Video absent from signed entitlements? | **Yes** — not in codesigned entitlements (profile may still list the capability) |
| Did app install/open on iPhone? | **pending/manual** |
| Did icon appear on car screen? | **pending/manual** |
| Build URL / ID | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/9bb39d32-22dd-4cbc-bd37-ce01743a61bd (`9bb39d32-22dd-4cbc-bd37-ce01743a61bd`) |

---

# History — prior failed attempts

﻿# First CarPlay Audio iOS Preview Build Result

## Workspace / Git

| Field | Value |
| --- | --- |
| Workspace | `/home/wills/hidden-tunes-app` |
| Branch | `feature/carplay-production-ready` |
| Commit at submit | `ae14d962d6e112e5cfc73291afbcb93d472ea1ed` |
| Tree at submit | Clean |
| EAS account | `hiddentunes_1` |
| Apple Team | `299CMT9CHH` (Emmanuel Lotsu (Individual)) |

## App identity

| Field | Value |
| --- | --- |
| Bundle ID | `com.hiddentunes.app` |
| Version (`appVersion`) | `1.0.1` |
| Build number (`appBuildVersion`) | `1.0.168` (remote auto-increment from `1.0.167`) |

## Credentials / provisioning (this build)

| Field | Value |
| --- | --- |
| Distribution certificate serial | `69135400477D46D110A5FA1BAB7C2EA1` |
| Certificate expiration | Wed, 26 May 2027 13:46:17 GMT+0200 |
| Provisioning profile name | `*[expo] com.hiddentunes.app AdHoc 1779796837566` |
| Developer Portal ID | `AWGFLB26QV` |
| Profile status | active |
| Profile expiration | Wed, 26 May 2027 13:46:17 GMT+0200 |
| Provisioned devices | iPhone (UDID: `00008130-0014244621D2001C`) |
| Profile refresh | **Yes** — `--refresh-ad-hoc-provisioning-profile` accepted; EAS reported `Updated existing profile: *[expo] com.hiddentunes.app AdHoc 1779796837566` (Updated ~1 second ago at submit) |
| New profile used? | Refreshed/updated existing Ad Hoc profile (not a brand-new named profile). Credentials were re-fetched and the profile was updated immediately before upload. |

## Entitlements

| Field | Value |
| --- | --- |
| Source entitlement (repo) | `com.apple.developer.carplay-audio` = `true` in `app.json` ios entitlements, `plugins/hidden-audio/index.js` (sets audio, deletes video), and `ios/HiddenTunes/HiddenTunes.entitlements` |
| Source: carplay-video | Absent / explicitly deleted by plugin |
| Signed entitlement (IPA) | **Not verified** — build failed before producing an IPA artifact |
| Signed: carplay-audio | N/A (no IPA) |
| Signed: carplay-video absent | N/A (no IPA) |
| codesign / profile decode | Skipped — no IPA. `codesign` also unavailable on WSL/Linux for this agent. |

## Build command

```bash
cd /home/wills/hidden-tunes-app
npx eas-cli build --platform ios --profile preview --non-interactive --refresh-ad-hoc-provisioning-profile --message "First CarPlay Audio preview from ae14d96"
```

- Refresh flag: **accepted** (no fallback needed)
- Exactly one iOS preview build started (no Android / production builds)

## Build result

| Field | Value |
| --- | --- |
| Build ID | `dd1aef27-2ea5-48e1-97d3-b7e4dfd524e0` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/dd1aef27-2ea5-48e1-97d3-b7e4dfd524e0 |
| Status | **ERRORED** |
| Created | `2026-07-18T16:15:44.932Z` |
| Completed | `2026-07-18T16:19:51.977Z` |
| Error code | `XCODE_BUILD_ERROR` |
| Detected Xcode error | `type 'HiddenAudioCarPlayManager' does not conform to protocol 'CPSearchTemplateDelegate'` |
| Artifact / IPA | None (build failed) |
| Fingerprint hash | `dc28dea68983e9b0096c280c2ea3409b6d8901ca` |

## Manual test results (agent cannot perform)

| Field | Value |
| --- | --- |
| Installation result | **pending/manual** — agent cannot install on physical iPhone |
| iPhone open/smoke test | **pending/manual** |
| CarPlay appearance on car screen | **pending/manual** — agent cannot connect to physical CarPlay |

## Minimal code fix applied after failure (not rebuilt)

Concrete compile error required a minimal Swift signature update for current CarPlay SDK:

- Files: `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift` and mirrored `ios/HiddenTunes/HiddenAudioModule/HiddenAudioCarPlayManager.swift`
- Change: `CPSearchTemplateDelegate.searchTemplate(_:updatedSearchText:completionHandler:)` completion type from `[CPListItem]` to `[any CPListTemplateItem]`
- **No second EAS build was started** (task specified exactly one preview build). A follow-up preview build is required to produce an IPA and verify signed entitlements.

## Blockers

1. **Build failed** on `CPSearchTemplateDelegate` conformance (fixed in tree; not yet verified by a new EAS build).
2. No IPA → cannot confirm signed `com.apple.developer.carplay-audio` on the binary/profile for this build.
3. Physical iPhone install + real CarPlay screen checks remain user-only steps.

## Rollback

- Git source for the attempted build remains `ae14d962d6e112e5cfc73291afbcb93d472ea1ed`.
- To abandon the local Swift signature fix: restore the two `HiddenAudioCarPlayManager.swift` files from that commit.
- Remote iOS buildNumber was incremented to `1.0.168` for the failed attempt; next EAS iOS build will auto-increment further.
- Failed EAS build does not publish an installable artifact; no device rollback needed for this build ID.

## Final checklist answers

| Question | Answer |
| --- | --- |
| Was a new provisioning profile used? | Profile was **refreshed/updated** (`*[expo] com.hiddentunes.app AdHoc 1779796837566`, portal ID `AWGFLB26QV`) immediately before the build. |
| Does the signed app contain CarPlay Audio entitlement? | **Unknown / not verified** (no IPA). Source entitlements do include it. |
| Is CarPlay Video absent from the signed app? | **Unknown / not verified** (no IPA). Source removes it. |
| Did Hidden Tunes install and open normally? | **pending/manual** |
| Did the Hidden Tunes icon appear on the real car screen? | **pending/manual** |
| What exact issue remains? | Xcode compile failure on `CPSearchTemplateDelegate` blocked the preview IPA; minimal signature fix is in the working tree and needs a **new** preview build, then IPA entitlement verification + manual device/CarPlay testing. |
| Build URL / ID | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/dd1aef27-2ea5-48e1-97d3-b7e4dfd524e0 (`dd1aef27-2ea5-48e1-97d3-b7e4dfd524e0`) |

---

# Second CarPlay Audio iOS Preview Build (after CPSearchTemplateDelegate fix)

## Workspace / Git

| Field | Value |
| --- | --- |
| Workspace | `/home/wills/hidden-tunes-app` |
| Branch | `feature/carplay-production-ready` |
| Fix commit | `d492f063a5e70f6a22b26233e281ceace4134034` — *Fix CarPlay CPSearchTemplateDelegate conformance for Xcode build* |
| Prior commit on branch | `8581d3ab3b78ad4919136ab542474de4bdbaf59c` — name collision rename (`searchTabTemplate`) |
| Files in fix commit | `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift`, `services/carPlayCatalogBridge.ts` |
| Push | Windows git against WSL path (WSL HTTPS auth hung); `78629ae..d492f06` |

## What the fix commit changed

- Renamed CarPlay search tab property away from `searchTemplate` (already in `8581d3a`) so protocol methods are not shadowed.
- Kept `updatedSearchText` completion as `@escaping ([any CPListTemplateItem]) -> Void`.
- Added `searchTemplate(_:selectedResult:completionHandler:)` and stopped using `CPListItem.handler` in search results (selection via `userInfo` + `selectedResult`).
- `carPlayCatalogBridge.ts`: continues to use existing instant search for CarPlay.

## Credentials / provisioning (this build)

| Field | Value |
| --- | --- |
| Distribution certificate serial | `69135400477D46D110A5FA1BAB7C2EA1` |
| Provisioning profile | `*[expo] com.hiddentunes.app AdHoc 1779796837566` |
| Developer Portal ID | `CVD538FXQ4` |
| Profile refresh | **Yes** — `--refresh-ad-hoc-provisioning-profile`; EAS updated existing profile immediately before upload |
| Provisioned devices | iPhone (UDID: `00008130-0014244621D2001C`) |
| Build number | remote auto-increment **1.0.169 → 1.0.170** |

## Build command

```bash
cd /home/wills/hidden-tunes-app
npx eas-cli build --platform ios --profile preview --non-interactive --refresh-ad-hoc-provisioning-profile --message "CarPlay Audio preview after CPSearchTemplateDelegate fix"
```

- Exactly one iOS preview build (no Android / production).
- Waited until completion (CLI default wait).

## Build result

| Field | Value |
| --- | --- |
| Build ID | `49264ef1-d8fc-45ce-b335-cd93e8eb0c82` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/49264ef1-d8fc-45ce-b335-cd93e8eb0c82 |
| Status | **ERRORED** |
| Created | `2026-07-18T18:07:26.225Z` |
| Completed | `2026-07-18T18:11:28.005Z` |
| gitCommitHash (EAS) | `d492f063a5e70f6a22b26233e281ceace4134034` |
| appBuildVersion | `1.0.170` |
| Error code | `XCODE_BUILD_ERROR` |
| Detected Xcode error | `type 'HiddenAudioCarPlayManager' does not conform to protocol 'CPSearchTemplateDelegate'` |
| Artifact / IPA | **None** (build failed) |
| Fingerprint hash | `dc28dea68983e9b0096c280c2ea3409b6d8901ca` (same hash reported as first failed build) |

## Entitlements verification

| Field | Value |
| --- | --- |
| Signed entitlement (IPA) | **Not verified** — no IPA produced |
| Signed: `com.apple.developer.carplay-audio` | N/A |
| Signed: carplay-video absent | N/A |
| codesign / provision decode | Skipped — no IPA; `codesign` unavailable on WSL/Linux |

## Comparison to first build

| | First (`dd1aef27…`) | Second (`49264ef1…`) |
| --- | --- | --- |
| Commit | `ae14d96…` | `d492f06…` (includes search-delegate fixes) |
| Build # | `1.0.168` | `1.0.170` |
| Xcode error | `HiddenAudioCarPlayManager` does not conform to `CPSearchTemplateDelegate` | **Same** conformance error |
| IPA | No | No |

## Remaining issue

The Xcode compile error is unchanged after the Swift/TS fix commit:

> `type 'HiddenAudioCarPlayManager' does not conform to protocol 'CPSearchTemplateDelegate'`

So the conformance fix in `d492f06` did **not** satisfy the CarPlay SDK used on EAS. Next step is a deeper protocol-signature audit against the exact iOS/CarPlay SDK on the EAS image (likely still a method signature / availability mismatch), then another preview rebuild. Physical install and CarPlay screen checks remain blocked until an IPA exists.

## Final checklist answers (second attempt)

| Question | Answer |
| --- | --- |
| Was provisioning refreshed? | **Yes** (Ad Hoc profile updated immediately before upload; portal ID `CVD538FXQ4`) |
| Does signed app contain CarPlay Audio? | **Unknown / not verified** (no IPA) |
| Is CarPlay Video absent from signed app? | **Unknown / not verified** (no IPA) |
| Did app install/open on iPhone? | **pending/manual** (no IPA) |
| Did icon appear on car screen? | **pending/manual** |
| Exact remaining error | `type 'HiddenAudioCarPlayManager' does not conform to protocol 'CPSearchTemplateDelegate'` |
| Build URL / ID | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/49264ef1-d8fc-45ce-b335-cd93e8eb0c82 (`49264ef1-d8fc-45ce-b335-cd93e8eb0c82`)

