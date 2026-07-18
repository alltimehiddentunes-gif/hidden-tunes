# CarPlay Video Follow-up

## Approved status

Apple has approved the **CarPlay Video** entitlement for Hidden Tunes.

This document parks video work. The current production CarPlay implementation is **Audio only**.

## Likely entitlement key / config

- Entitlement key (expected): `com.apple.developer.carplay-video = true`
- App ID capability: **CarPlay Video** on `com.hiddentunes.app`
- Must be enabled on the App ID and included in regenerated provisioning profiles
- Do not enable until audio CarPlay is verified stable on a real head unit

## Parked-only safety requirement

CarPlay Video playback is subject to Apple’s **parked / motion** restrictions:

- Video UI and playback must respect CarPlay video safety rules
- Do not allow distracting video interaction while driving
- Follow Apple’s current CarPlay Video HIG and entitlement review guidance

## Separation from audio architecture

Keep video isolated from the audio stack:

- Do **not** merge video into `HiddenAudio` AVPlayer ownership
- Do **not** replace audio CarPlay templates with video templates
- Prefer a separate video scene/template path and playback controller
- Audio Now Playing / queue / MiniPlayer / lock-screen behavior must remain untouched

## Review considerations

- Entitlement usage must match actual video CarPlay features shown in review
- Provide clear parked-only behavior evidence
- Avoid claiming video CarPlay support in App Store metadata until implemented and tested
- Keep provider branding out of CarPlay surfaces (Hidden Tunes only)

## Future implementation sequence

1. Confirm audio CarPlay is stable (icon, templates, play/pause, next/prev, disconnect safety)
2. Enable CarPlay Video on App ID `com.hiddentunes.app`
3. Regenerate provisioning profiles
4. Add video entitlement in Expo plugin SoT (separate from audio)
5. Implement video CarPlay templates / scene path
6. Wire parked-only guards and telemetry
7. Manual test on Simulator + real vehicle/head unit
8. Submit for review with video CarPlay evidence

## Explicit non-goals for the current branch

- No CarPlay Video entitlement in the signed audio build
- No video CarPlay Swift templates
- No second video player integrated into HiddenAudio
