# First CarPlay Audio iOS Preview Build Result

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
