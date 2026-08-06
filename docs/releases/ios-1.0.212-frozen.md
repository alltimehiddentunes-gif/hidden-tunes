# iOS 1.0.212 Frozen Production Baseline

Status: **IOS 1.0.212 — FROZEN**

This document records the known-good iOS and CarPlay production baseline approved after successful real-device and CarPlay testing. Android Auto work must preserve this baseline exactly.

## Release identity

- App version: `1.0.2`
- iOS build number: `1.0.212`
- Bundle identifier: `com.hiddentunes.app`
- Production source SHA: `83c1906004c04340dedb58f3921ee39df088040a`
- Production EAS build ID: `40ad4922-9a26-45ec-b5a8-5da6db6e1533`
- Development EAS build ID: `b964bd23-37a1-4cd1-8340-544a42f7b6a3`
- TestFlight submission ID: `b206598d-d380-413e-b362-60bb163f0673`
- Xcode: `26.4.1` (`17E202`)
- iPhoneOS SDK: `26.4`

## Verified iOS and CarPlay state

- Real-device iOS testing: passed and approved
- CarPlay testing: passed and approved
- CarPlay audio entitlement: present (`com.apple.developer.carplay-audio`)
- CarPlay video entitlement: absent
- Scene manifest: one `CPTemplateApplicationSceneSessionRoleApplication` CarPlay template scene and one phone scene
- Unsupported `UIWindowSceneSessionRoleCarPlay`: absent
- CarPlay delegates: `CarPlaySceneDelegate` and `PhoneSceneDelegate` present
- Unsupported `CPSearchTemplate`: absent
- CarPlay Search: bounded native `CPListTemplate`

## Protected systems

The following are frozen unless the reopening criteria below are satisfied:

- iOS app configuration, build identity, runtime, entitlements, and scene configuration
- CarPlay scene delegates, hierarchy, Search, artwork, scrolling, connection, reconnect, and steering controls
- HiddenAudio iOS implementation, playback handoff, interruption handling, and lock-screen integration
- Tap-to-play critical path
- Phone music and radio playback
- Podcast and audiobook playback and continuation
- Emotional transition intelligence and bounded endless continuation
- Queue/domain ownership and mature-content authority

Android-only files may change when required and tested. Shared TypeScript changes must preserve the behavior above, avoid changing generated iOS-native output, document their shared impact, and pass the complete iOS/CarPlay regression gate before commit.

## Reopening criteria

Reopen this baseline only for:

1. A reproducible production defect.
2. A crash supported by logs or a crash report.
3. An App Store compliance requirement.
4. A security or privacy vulnerability.
5. A dependency or SDK issue directly affecting the active iOS runtime.
6. A separately authorized iOS release.

Cleanup, speculative optimization, Android parity, code style, and opportunistic refactoring are not valid reasons.

## Shared-change regression gate

After any shared-file change, verify TypeScript, iOS ownership, generated production configuration, CarPlay plugin generation/idempotence, Search, hierarchy, artwork, scrolling, controls, catalogue/media resolution, mature visibility, tap ordering, rapid-tap protection, queue/domain guards, playback handoff, progress cadence, radio, podcasts, audiobooks, emotional continuation, and `git diff --check`.

If any frozen regression appears, do not commit the shared change. Repair the regression first and do not create an iOS build automatically.

## Rollback reference

The immutable source reference for the approved production artifact is:

`83c1906004c04340dedb58f3921ee39df088040a`

Use that SHA to compare or restore the known-good implementation only under separately authorized recovery procedures. Do not reset, revert, or discard the baseline as part of routine Android work.
