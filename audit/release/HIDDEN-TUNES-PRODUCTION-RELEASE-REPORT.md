# Hidden Tunes Production Release Report

Date: 2026-07-31

## Workspace proof

| Field | Value |
| --- | --- |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Starting HEAD | `e7fbfb01330e856df77a2079f15265a609dfb34e` |
| Release HEAD | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Starting dirty state | Staged Podcast + Sports fix set already present |
| Final dirty state | Clean after release commits (ignored locals: `.env`, `.env.local`, `.expo`) |
| Expo owner | `hiddentunes_1` |
| Expo project ID | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| App slug | `hidden-tunes` |
| iOS bundle ID | `com.hiddentunes.app` |
| Android package | `com.hiddentunes.app` |
| Apple Team | `299CMT9CHH` |
| ASC App ID | `6773324462` |
| Metro | Port **8081** from SSD root (`expo start --dev-client --port 8081`) |

## Starting dirty state

All intended Podcast + Sports changes were already staged at session start. Lint/hook/ref/purity fixes, `eas.json` Sports TV production flag, and `tsconfig.json` scripts exclude were applied during release prep.

### Excluded (not committed)

- `.env`, `.env.local`
- `.expo/`
- `node_modules`
- `.eas-build-view*.json` local artifacts
- certificates / keystores / provisioning profiles / Expo tokens
- no IPA/AAB binaries committed

## Changes committed

| Commit | Message |
| --- | --- |
| `f6176ce` | fix: optimize podcasts and restore mature episodes |
| `c37ade9` | feat: upgrade sports grid and reuse TV playback |
| `3fe6c9f` | release: prepare Hidden Tunes production builds |

Also pushed prior local commits already ahead of origin:

| Commit | Message |
| --- | --- |
| `7de84b2` | fix(ios): disable removeClippedSubviews to stop Fabric watchdog hang |
| `e7fbfb0` | checkpoint before checking out fix/library-content-type-safe |

## Validation

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Pass (after excluding `scripts/` from app `tsconfig`) |
| Targeted ESLint (podcast/sports changed paths) | Pass (0 errors after hook/ref/purity fixes) |
| Mature catalog test | Pass |
| Episode pipeline test | Pass (`includeMature=true` restores episodes) |
| Mature play gate test | Pass (general play 403; mature play 200 with audio) |
| Continuation test | Pass (same-show next + mature isolation) |
| Podcast ultra-performance contracts | Pass |
| Sports premium grid + Live TV verify | Pass (2-column + Sports category) |
| Sports UI datapath verify | Pass (`watchLivePresent: false` on fixtures) |
| Sports frontend test | Pass |
| Expo Doctor | 20/21 — pre-existing minor package drift (`react-native-screens`, `expo-web-browser`); not upgraded |
| `expo install --check` | Same minor drift; not upgraded |

## Device smoke testing

| Area | Result |
| --- | --- |
| Metro | Running on **8081** from SSD root (`expo start --dev-client --port 8081`) |
| `adb` | Not available on PATH |
| Full on-device Podcast / Sports checklist | Not completed via automation — manual TestFlight verification still required after Apple processing |

Automated API/UI contract checks for Podcasts and Sports passed.

## Production configuration

| Field | Value |
| --- | --- |
| Runtime / build profile | `production` |
| Development client | Disabled on production profile |
| Distribution | App Store / Play store |
| Podcast API host | `https://admin.hiddentunes.com` |
| Expo owner | `hiddentunes_1` |
| Expo project ID | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| iOS bundle ID | `com.hiddentunes.app` |
| Android package | `com.hiddentunes.app` |
| Apple Team | `299CMT9CHH` |
| ASC App ID | `6773324462` |

AfriMeetup contamination search hits were documentation-only negatives in prior audits — not production config.

## Feature-flag state (production profile)

| Flag | Production value |
| --- | --- |
| `EXPO_PUBLIC_BUILD_PROFILE` | `production` |
| `EXPO_PUBLIC_SPORTS_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_MOBILE_PILOT_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_FULL_UI_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_TV_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED` | `false` |
| `EXPO_PUBLIC_SPORTS_STREAMS_ENABLED` | `false` |
| `EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES` | `false` |
| `EXPO_PUBLIC_SPORTS_NOTIFICATIONS_ENABLED` | `false` |

Age gate for mature podcasts remains enforced. Fixture Watch Live / streams remain disabled.

## Versioning

| Field | Previous (remote before this release) | This release |
| --- | --- | --- |
| App version | `1.0.1` | `1.0.1` |
| iOS build number | `1.0.192` | `1.0.193` (autoIncrement) |
| Android versionCode | `98` | `99` (autoIncrement) |

## Push

| Field | Value |
| --- | --- |
| Branch | `fix/library-content-type-safe` |
| Local SHA | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Remote SHA | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Result | Push succeeded; branch clean vs origin |

## iOS build

| Field | Value |
| --- | --- |
| Build ID | `70003e63-08f8-4188-bf14-981fb794a5d6` |
| URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/70003e63-08f8-4188-bf14-981fb794a5d6 |
| IPA | https://expo.dev/artifacts/eas/7P9XTXwpZoGSVZs9jv3lHXvwX_aSNL1W0EHN_fEU4LM.ipa |
| Status | FINISHED |
| Version | `1.0.1` |
| Build number | `1.0.193` |
| Commit SHA | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Distribution | App Store (`STORE`) |
| Credentials | Ready (remote EAS) |

## iOS submission

| Field | Value |
| --- | --- |
| Submission ID | `03c61875-81a5-4452-a87c-f67f8bae592c` |
| URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/submissions/03c61875-81a5-4452-a87c-f67f8bae592c |
| Status | Uploaded to App Store Connect |
| Destination | ASC App `6773324462` / TestFlight iOS |
| Processing | Apple processing after upload |
| Public release | Not performed (submission only) |

## Android build

| Field | Value |
| --- | --- |
| Build ID | `f9fd205d-32fe-41a4-a7e9-faaf6c6c7cc5` |
| URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/f9fd205d-32fe-41a4-a7e9-faaf6c6c7cc5 |
| AAB | https://expo.dev/artifacts/eas/dbEv-SRYcqiYgvsBpuoH8TA90N1o-5OIAQCkbVwDVSw.aab |
| Status | FINISHED |
| Version | `1.0.1` |
| versionCode | `99` |
| Commit SHA | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Distribution | Play store (`STORE`) |
| Artifact type | `.aab` |
| Credentials | Ready (remote EAS keystore) |
| Google Play submit | Not performed |

## Remaining blockers / notes

- Full on-device Podcast/Sports heat/lag/PiP checklist was not completed here (`adb` not on PATH). Manual TestFlight verification still required after Apple processing.
- Expo Doctor: 20/21 — pre-existing minor package drift (`react-native-screens`, `expo-web-browser`); not upgraded in this release.
- Production EAS dashboard env had no additional Plain text/Sensitive vars; production profile `env` block supplied public Sports flags.
- No production database migration or backend deployment was run.
- AfriMeetup was not modified for this release.
