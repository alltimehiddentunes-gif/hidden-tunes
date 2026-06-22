# Release Build Rollout

Date: 2026-06-22
Branch: `carplay-scene-safe-test`
Commit: `76ef537` (`76ef537a06b63d19f717a823d0e23d03f150864c`)

## Validation Result

Passed:

- `git status`: clean working tree before builds.
- `git branch`: active branch was `carplay-scene-safe-test`.
- `git log --oneline -10`: latest stabilization commit `76ef537 Stabilize launch candidate experience` was present.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Known validation blockers:

- `npx expo-doctor`: failed 2 of 21 checks.
  - `@react-navigation/native` is installed as a direct dependency alongside `expo-router`; Expo Doctor reports this is incompatible with SDK 56.
  - Ten Expo SDK packages are below expected patch versions: `expo`, `expo-clipboard`, `expo-constants`, `expo-dev-client`, `expo-file-system`, `expo-font`, `expo-image`, `expo-linking`, `expo-router`, and `expo-symbols`.

Known warnings:

- EAS CLI reported a newer CLI version is available.
- EAS warned that included monthly build credits are fully used and further builds may be billed.
- iOS build warned that `ios.buildNumber` in app config is ignored when version source is remote.

## Android Build Result

Command:

```sh
eas build --platform android --profile production --clear-cache --non-interactive
```

Result:

- Build ID: `083ceb47-201d-4019-a938-58792eeb8e37`
- Status: `FINISHED`
- Platform: Android
- Profile: `production`
- Distribution: `STORE`
- Artifact type: `.aab`
- App version: `1.0.1`
- Build version: `86`
- Git commit: `76ef537a06b63d19f717a823d0e23d03f150864c`
- Artifact URL: `https://expo.dev/artifacts/eas/VN6PZ-W3sQEvhgu46kOqpW_eMEnwyUX8ic7RJaEDSR8.aab`

## iOS Build Result

Apple Developer Program License Agreement:

- No Apple PLA blocker was encountered.
- EAS reported remote iOS credentials were ready for `com.hiddentunes.app`.

Command:

```sh
eas build --platform ios --profile production --clear-cache --non-interactive
```

Result:

- Build ID: `89d4ef73-5c1b-4b26-9ee0-5afd57ef1caa`
- Status: `FINISHED`
- Platform: iOS
- Profile: `production`
- Distribution: `STORE`
- Artifact type: `.ipa`
- App version: `1.0.1`
- Build version: `1.0.117`
- Git commit: `76ef537a06b63d19f717a823d0e23d03f150864c`
- Build URL: `https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/89d4ef73-5c1b-4b26-9ee0-5afd57ef1caa`
- Artifact URL: `https://expo.dev/artifacts/eas/zMicIAUsuKdDzZNHkiLadsdxIQFpop1_rH_PU-2pvAo.ipa`

## Submission Commands

iOS TestFlight:

```sh
eas submit --platform ios
```

Android Google Play internal testing:

- Upload the production `.aab` artifact to Google Play Console internal testing.
- Release name suggestion: `Hidden Tunes 1.0.1 (86)`
- Include the tester focus notes below in the internal testing release notes.
- Do not submit or roll out wider than internal testing until manual QA confirms no black screens, no dead-end categories, and no heat regressions.

## Tester Instructions

Hidden Tunes testing focus:

- Music playback
- Radio discovery
- Podcast discovery
- Emotional Worlds
- Search
- Mature content setting
- Load next 40
- Scrolling smoothness
- Battery usage
- Phone temperature
- Black screens
- No-result pages
- App crashes

Please test on real devices where possible. Report the device model, operating system version, network type, screen where the issue happened, steps to reproduce, and whether the app recovered without restarting.

## Known Blockers

- Expo Doctor is not clean because of SDK 56 dependency checks.
- Manual runtime QA was not completed in this release-build pass.
- Tester rollout should not be marked fully ready until music, radio, podcasts, videos, search, mature content, and Emotional Worlds are verified on real devices.

## Release Readiness Verdict

Production builds were generated successfully for Android and iOS.

Tester rollout readiness: NO.

Reason: build artifacts exist, but Expo Doctor still reports dependency blockers and manual device QA has not verified heat, black screens, no-result pages, radio access, podcast access, mature content behavior, or crash-free startup.
