# Hidden Tunes — Working Metro Lock

| Field | Value |
| --- | --- |
| Date/time | 2026-07-31 23:33 +02:00 |
| Authoritative path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Locked / authoritative SHA | `a2253fcaf7079c4092e1262df69070e1300ebd18` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Metro port | `8081` |
| Metro root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| App version | `1.0.1` |
| Expo owner | `hiddentunes_1` |
| Expo project ID | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| iOS bundle ID | `com.hiddentunes.app` |
| Android package | `com.hiddentunes.app` |

## Statement

This SSD workspace SHA reproduces the approved Metro working state for Podcast Mature catalog/episodes/continuation and Sports grid + Live Sports TV handoff (fixture streams remain disabled).

## Feature-flag state

### Tracked production (`eas.json` production profile)

| Variable | Value |
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

### Local Metro-only (untracked `.env.local`)

Fixtures are enabled locally for development (`EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED=true`). Production profile keeps fixtures off. Streams remain off in both.

## Validation summary

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Targeted ESLint | Pass (0 errors; 2 pre-existing warnings) |
| Mature catalog | Pass |
| Episode pipeline | Pass |
| Mature play gate | Pass |
| Continuation / isolation | Pass |
| Podcast ultra-performance | Pass |
| Sports grid / TV / datapath / frontend | Pass |
| Expo Doctor | 20/21 pre-existing package drift (not upgraded — preserves Metro) |
| `expo install --check` | Same pre-existing drift |

## Excluded local files

- `.env`, `.env.local`, `.expo/`, `node_modules/`

## Tag

No annotated tag created. This lock file plus the final pushed commit SHA are the authoritative checkpoint.
