# CarPlay Audit Report

Date: 2026-06-17
Repository: `/home/wills/hidden-tunes-app`
Branch observed: `carplay-scene-safe-test`
Mode: audit only; no fixes or commits performed.

## Executive Summary

Hidden Tunes is not appearing as a selectable CarPlay app icon because the latest failed EAS iOS internal build was not built from the current uncommitted working tree. EAS build `a73f890d-c5fb-459b-b7b5-15d5121cb462`, created `2026-06-16T20:54:05.121Z`, used commit `55a5231d6893e9ef345b4e33a4806e27a6d3fa71`. At that commit, `plugins/hidden-audio/index.js` actively added `com.apple.developer.playable-content`, and `HiddenAudioCarPlayManager.swift` actively used `MPPlayableContentManager` / `MPPlayableContentDataSource` / `MPPlayableContentDelegate`.

The current working tree no longer has `MPPlayableContent` matches and no longer has a literal `com.apple.developer.playable-content` match, but those changes are uncommitted and are not represented in the failed remote EAS build.

The provisioning profile error is real and separate: EAS selected the managed Ad Hoc profile `*[expo] com.hiddentunes.app AdHoc 1779796837566`, and Xcode rejected it because that profile does not include the CarPlay Audio App capability. A CarPlay app icon requires the `com.apple.developer.carplay-audio` entitlement to be present in the signed app and supported by the Apple provisioning profile. Audio playback and metadata can work through normal iOS audio/Now Playing mechanisms without the app being listed as a CarPlay app.

## Part 1 - Playable Content Audit

Commands run exactly as requested, from repo root:

```sh
grep -R "playable-content" .
grep -R "com.apple.developer.playable-content" .
grep -R "MPPlayableContent" .
```

Results in the current working tree:

- `playable-content`: 2 matches.
- `com.apple.developer.playable-content`: 0 matches.
- `MPPlayableContent`: 0 matches.

### Current Working Tree References

| Reference | File:line | Why it exists | Active or dead code |
| --- | --- | --- | --- |
| `playable-content` | `plugins/hidden-audio/index.js:151` | Constructs the old entitlement key as `"com.apple.developer." + "playable-content"` so the config plugin can delete it from entitlements. | Active config-plugin cleanup guard; not adding the entitlement. Still matches the broad grep. |
| `playable-content` | `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift:73` | Stale diagnostic payload reports `entitlementMode: "playable-content"` and `hasCarPlayAudioEntitlement: false`. | Active diagnostic in plugin source. It is not an entitlement and does not affect signing directly, but it is stale and would be copied by future prebuild/native sync unless changed. |

### Generated Native Copy Comparison

The generated file differs from the plugin source:

- `ios/HiddenTunes/HiddenAudioModule/HiddenAudioModule.swift:73` reports `entitlementMode: "carplay-audio"` and `hasCarPlayAudioEntitlement: true`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift:73` still reports `entitlementMode: "playable-content"` and `hasCarPlayAudioEntitlement: false`.

Because the config plugin copies files from `plugins/hidden-audio/ios/HiddenAudioModule` into `ios/HiddenTunes/HiddenAudioModule`, the plugin source is authoritative for future generated native syncs.

### Historical EAS Build Input

The failed EAS build was not from the current working tree. EAS build `a73f890d-c5fb-459b-b7b5-15d5121cb462` used commit `55a5231d6893e9ef345b4e33a4806e27a6d3fa71`.

At that commit:

- `plugins/hidden-audio/index.js:154` actively set `config.modResults["com.apple.developer.playable-content"] = true`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift:23` used `MPPlayableContentManager.shared()`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift:44` used `MPPlayableContentManager.shared().reloadData()`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift:160` extended `MPPlayableContentDataSource`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift:236` extended `MPPlayableContentDelegate`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift:238` referenced `MPPlayableContentManager` in the delegate callback.

Conclusion: the `com.apple.developer.playable-content requires approval from Apple` error is explained by the exact commit used by EAS. In the current working tree, the entitlement is no longer present as a literal entitlement key, but the failed EAS build predates that local state.

## Part 2 - CarPlay Entitlement Audit

Search target: `com.apple.developer.carplay-audio`.

| File:line | Source of entitlement | Active? |
| --- | --- | --- |
| `plugins/hidden-audio/index.js:150` | Expo config plugin writes `config.modResults["com.apple.developer.carplay-audio"] = true`. | Active during Expo config/prebuild. |
| `ios/HiddenTunes/HiddenTunes.entitlements:5` | Generated native entitlements plist contains `<key>com.apple.developer.carplay-audio</key><true/>`. | Active for native Xcode signing because the Xcode project points at this entitlements file. |

Xcode project evidence:

- `ios/HiddenTunes.xcodeproj/project.pbxproj:348` has `CODE_SIGN_ENTITLEMENTS = HiddenTunes/HiddenTunes.entitlements`.
- `ios/HiddenTunes.xcodeproj/project.pbxproj:377` has `CODE_SIGN_ENTITLEMENTS = HiddenTunes/HiddenTunes.entitlements`.

Expo introspection evidence:

- `npx expo config --type introspect --json` shows `ios.entitlements["com.apple.developer.carplay-audio"]: true`.
- The same introspection output shows the CarPlay scene manifest and `UIBackgroundModes: ["audio"]`.

Generated native file evidence:

- `ios/HiddenTunes/HiddenTunes.entitlements:5-6` contains the CarPlay Audio entitlement.

Conclusion: the app requests `com.apple.developer.carplay-audio` in current local config and generated native files. The provisioning profile must also support the same entitlement, and the EAS-selected profile does not.

## Part 3 - Provisioning Profile Audit

### Local Files Inspected

- `eas.json`
- `credentials.json`
- `app.json`
- `app.config.js`
- Xcode project signing settings
- Repo search for provisioning profile settings and the failing profile name

### Findings

- `credentials.json` is missing. There is no local credentials file pinning a provisioning profile.
- `eas.json` defines `developmentClient`, `preview`, and `production` profiles. The `preview` profile uses `distribution: "internal"`, which maps to an Ad Hoc style iOS build.
- `eas.json` does not set `credentialsSource`, `provisioningProfilePath`, `teamId`, or any explicit local provisioning profile mapping.
- Repo search found no local occurrence of `*[expo] com.hiddentunes.app AdHoc 1779796837566` or `1779796837566` outside the fetched EAS build JSON in `/tmp`.
- Xcode project uses automatic bundle identifier/signing inputs from Expo-generated native project settings and points at `HiddenTunes/HiddenTunes.entitlements`.

### EAS Remote Evidence

Read-only command run:

```sh
npx eas-cli@latest build:list -p ios --distribution internal --limit 5 --json --non-interactive
```

The latest failed internal iOS build in the returned JSON:

- Build id: `a73f890d-c5fb-459b-b7b5-15d5121cb462`
- Status: `ERRORED`
- Build profile: `preview`
- Distribution: `INTERNAL`
- Created: `2026-06-16T20:54:05.121Z`
- Git commit: `55a5231d6893e9ef345b4e33a4806e27a6d3fa71`
- Error includes profile `*[expo] com.hiddentunes.app AdHoc 1779796837566`.

The same EAS build list also shows multiple recent preview/internal builds with the same failing profile name and the same playable-content error.

### Questions Answered

- Is this profile still attached on EAS servers?
  - Confirmed for the failed EAS build records: EAS selected `*[expo] com.hiddentunes.app AdHoc 1779796837566` for those preview/internal builds. I could not non-interactively display the live credentials inventory because `eas credentials -p ios` failed at an interactive profile-selection prompt. Based on the build records, the profile was attached at build time.

- Is EAS caching credentials?
  - The evidence points to EAS-managed remote credentials being reused for preview/internal builds. `eas build --help` exposes `--refresh-ad-hoc-provisioning-profile`, which exists specifically because managed Ad Hoc profiles may need refreshing. No local `credentials.json` is controlling this.

- Is a build profile referencing old credentials?
  - No explicit old credential reference exists in `eas.json`. The `preview` profile selects internal distribution; EAS then chooses managed Ad Hoc credentials for `com.hiddentunes.app`.

- Is a `credentials.json` involved?
  - No. `credentials.json` is absent.

- Is a provisioning profile mapping being generated incorrectly?
  - No local provisioning profile mapping is present. The failing mapping appears to be EAS-managed remote credential selection for the `preview` internal iOS build.

Conclusion: the provisioning profile error is not caused by local `eas.json` or `credentials.json`. It is caused by EAS selecting a managed Ad Hoc profile that does not include the CarPlay Audio App capability while the current app entitlements request that capability.

## Part 4 - CarPlay Scene Audit

| Item | Result | Evidence |
| --- | --- | --- |
| `CarPlaySceneDelegate` exists | PASS | `plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift:4`; generated copy also exists at `ios/HiddenTunes/HiddenAudioModule/CarPlaySceneDelegate.swift:4`. |
| CarPlay scene manifest exists | PASS | `plugins/hidden-audio/index.js:163-174`; generated `ios/HiddenTunes/Info.plist:73-91`. |
| `CPTemplateApplicationSceneDelegate` is registered correctly | PASS | `plugins/hidden-audio/index.js:166-170` registers `CPTemplateApplicationSceneSessionRoleApplication`, `CPTemplateApplicationScene`, and `$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate`; generated `ios/HiddenTunes/Info.plist:79-87` matches. |
| Basic `CPListTemplate` root exists | PASS | `plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift:9-19` creates a `CPListTemplate` titled `Hidden Tunes` with item `Hidden Tunes is connected`. |
| `HiddenAudioCarPlayManager` is wired correctly | PARTIAL | The manager exists and can set the same static template if `connect` is called, but the current `CarPlaySceneDelegate` no longer calls `HiddenAudioCarPlayManager.shared.connect(interfaceController)`. For the static no-JS CarPlay test, this is acceptable. For manager wiring specifically, delegate-to-manager wiring is currently absent. |
| No `MPPlayableContent` dependencies remain | PASS in current working tree | `grep -R "MPPlayableContent" .` returned 0 matches. At the failed EAS commit, this was FAIL. |
| No `playable-content` entitlement remains | PASS in current working tree | `grep -R "com.apple.developer.playable-content" .` returned 0 matches. At the failed EAS commit, this was FAIL. |

## Part 5 - Root Cause Analysis

### Why Hidden Tunes can play audio through CarPlay

Evidence:

- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift:486-487` activates `AVAudioSession.sharedInstance()`.
- `plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift:918-928` updates `MPNowPlayingInfoCenter.default().nowPlayingInfo` and artwork.
- `app.json:20-22`, `app.config.js:49`, and `plugins/hidden-audio/index.js:159-161` ensure `UIBackgroundModes` includes `audio`.

Interpretation: audio output and vehicle metadata can work through the normal iOS audio session, background audio mode, remote command center, and Now Playing metadata path. This does not require the app to appear as a CarPlay app icon.

### Why Hidden Tunes can show metadata/artwork on the vehicle

Evidence:

- `HiddenAudioModule.swift:918-928` writes Now Playing metadata and artwork through `MPNowPlayingInfoCenter`.
- `HiddenAudioModule.swift:1038-1043` updates elapsed playback/progress in the same Now Playing info center.

Interpretation: the vehicle can display media metadata/artwork from iOS Now Playing even when the app is not registered as a selectable CarPlay app.

### Why Hidden Tunes does not appear as a selectable CarPlay app icon

Evidence:

- The failed EAS build requested CarPlay Audio App entitlement but signed with profile `*[expo] com.hiddentunes.app AdHoc 1779796837566`, which EAS/Xcode reports does not include the CarPlay Audio App capability.
- The same failed build also included `com.apple.developer.playable-content`, which Xcode reports requires Apple approval.
- The failed build used commit `55a5231d6893e9ef345b4e33a4806e27a6d3fa71`, where `playable-content` and `MPPlayableContent` were still active.
- The current CarPlay scene manifest and delegate are local/uncommitted on branch `carplay-scene-safe-test` and were not part of that failed remote build.

Interpretation: a CarPlay app icon requires a successful signed iOS build whose entitlements and provisioning profile both include the approved CarPlay Audio App capability, plus a registered CarPlay scene. The current failed EAS build never produced such an installable binary because signing failed. Existing installed builds can still play audio and show Now Playing metadata, but they are not signed as CarPlay audio apps with a compatible profile, so they do not appear in iPhone Settings -> General -> CarPlay -> Vehicle -> Customize.

## Final Determination

The two EAS errors have different immediate causes:

1. `Provisioning Profile ... does not support the CarPlay Audio App capability`
   - Current local config requests `com.apple.developer.carplay-audio`.
   - EAS selected managed Ad Hoc profile `*[expo] com.hiddentunes.app AdHoc 1779796837566`.
   - That profile does not contain the CarPlay Audio App capability.

2. `Entitlement com.apple.developer.playable-content requires approval from Apple`
   - The failed EAS build was made from commit `55a5231d...` where the plugin actively added `com.apple.developer.playable-content`.
   - Current working tree no longer has that entitlement as a literal key, but it has not been committed and was not used by the failed EAS build.

Primary root cause for current non-appearance as a CarPlay app icon: no successful installed iOS build exists that is signed with a provisioning profile containing `com.apple.developer.carplay-audio` and built from the corrected CarPlay scene/entitlement state.
