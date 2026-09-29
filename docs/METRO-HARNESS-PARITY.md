# Metro physical-iPhone harness — 2026-09-29

## Baseline

Workspace: `D:/HiddenTunes/Worktrees/ios-1.0.216-device-debug`.
Branch: `diagnostic/ios216-metro-parity-20260929`.
Base: `c60594c307df22177e0929b6a22ee3b3b618b846`.
Previous work is preserved on `diagnostic/ios-216-device-debug-20260929`; no reset or cleanup performed.
The row-selector optimization `fe48de82` and subsequent lifecycle fixes are absent from this baseline branch.

## Existing artifact comparison

| Property | Development | Standalone diagnostic |
| --- | --- | --- |
| EAS build | a46c04d6-deb6-47ed-863f-7ee16fce3ed3 | d3e6b23e-96cd-47b2-9127-0e1df412ad2d |
| EAS recorded commit | c60594c307df22177e0929b6a22ee3b3b618b846 | 8aff72b41f069388b63eafe31d18a961add7f8f0 |
| Runtime | 1.0.2-dev.1.0.216 | 1.0.2-preview.1.0.216 |
| Native compilation | Debug | Release |
| Bundle ID / build | com.hiddentunes.app / 1.0.216 | same |
| Xcode / SDK | 2660 (17F113) / iphoneos26.5 (23F81a) | same |
| Minimum OS | 16.4 | same |
| Background modes | audio | audio |
| ATS | arbitrary loads false, local networking true | same |
| Local discovery | local-network description and _expo._tcp | absent, expected standalone difference |
| Signed entitlements | application identifier, team identifier, carplay-audio; get-task-allow false | identical |

The commit difference between the recorded build commits is only `eas.json`. Native plugin/source and lockfile are unchanged between those commits. EAS log comparison found 125 identical dependency installation entries, including Expo 57.0.13, ExpoModulesCore 57.0.11, React-Core 0.86.2 and Hermes 250829098.0.16. Both build logs show HiddenAudioModule.m compilation.

Both downloaded IPAs contain HiddenAudioModule registration strings, loadTrack/getState selectors, HiddenAudioDiagnostic and native player-created/playing-confirmed diagnostic strings. Both have the same embedded framework names. Framework machine code is generally different across Debug and Release; binary identity is NOT claimed. Runtime module availability and successful audio must still be demonstrated on-device.

Evidence read: EAS build JSON, existing build logs, actual IPA Info.plist/Expo.plist, Mach-O signed entitlements and executable strings. Provisioning-profile entitlements were examined separately and are not confused with actual signed executable entitlements. Downloaded artifacts/logs are in the local temporary directory as `ht-216-{dev,release}.ipa` and `ht-{dev,release}-log-*.txt`; do not publish signed artifact URLs.

## Local observation plan

Only `index.js`, `metro.config.js` and `utils/metroPlaybackHarness.ts` instrument the baseline. The observer is explicitly dev/flag gated, subscribes to existing native and JS diagnostic events and performs a read-only getState. It never loads/plays/pauses/stops media. It excludes media URLs and credentials and sends bounded events only to the same LAN Metro on port 8081. No public tunnel, backend writes or OTA.

Run from this workspace with environment:

```
EXPO_PUBLIC_BUILD_PROFILE=developmentClient
EXPO_PUBLIC_METRO_HARNESS=1
REACT_NATIVE_PACKAGER_HOSTNAME=<current PC LAN address>
node --max-old-space-size=4096 node_modules/expo/bin/cli start --dev-client --host lan --port 8081 --max-workers 1
```

Current LAN address: `172.20.10.6`. Recheck address and port ownership on subsequent sessions. AfriMeetup is not this workspace and must not be used as the packager.
Events: `.expo/metro-harness.jsonl`. `host_receiver_check` is a PC-only receiver test, NOT iPhone evidence.

Required method observation: setup, loadTrack, play, pause, stop, seekTo, setVolume, getState, getProgress, getActiveTrack, addListener, removeListeners.
Listener registration alone does not prove events arrive. Native playing state does not prove audible output: owner confirmation is required.

## Gate

Metro /status and iOS bundle return HTTP 200; bundle runtime is the development runtime above. iPhone appears as com.hiddentunes.app in Metro and the owner confirms Home loaded and scrolls. Native handshake, one-tap trace, 3/3 audible songs and playback through Home/Explore/Library/Profile remain pending.

No optimization until this gate passes. No rebuild without evidence of missing native capability or a demonstrated native configuration defect. No production changes and no OTA.
