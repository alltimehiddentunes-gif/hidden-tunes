# iOS Production — Resolved Config

Date: 2026-07-31  
Profile: `production`  
Secrets: redacted

## Identity

| Field | Value |
| --- | --- |
| Name | Hidden Tunes |
| Owner | `hiddentunes_1` |
| Slug | `hidden-tunes` |
| Expo project ID | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| iOS bundle ID | `com.hiddentunes.app` |
| Marketing version | `1.0.1` |
| Repo `ios.buildNumber` | `1.0.0` (remote autoIncrement owns store build number) |
| Previous uploaded iOS build | `1.0.193` (EAS `70003e63-…`) |
| Expected new iOS build | `1.0.194` (autoIncrement) |
| Distribution | `store` |
| developmentClient | `false` |
| isStandaloneBuild | `true` |
| isDevClientBuild | `false` |
| ASC App ID | `6773324462` |

## Production EAS env (from profile)

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_BUILD_PROFILE` | `production` |
| `EXPO_PUBLIC_SPORTS_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_MOBILE_PILOT_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_FULL_UI_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_TV_ENABLED` | `true` |
| `EXPO_PUBLIC_SPORTS_STREAMS_ENABLED` | `false` |
| `EXPO_PUBLIC_SPORTS_LIVE_SCORES_ENABLED` | `false` |
| `EXPO_PUBLIC_SPORTS_NOTIFICATIONS_ENABLED` | `false` |
| `EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES` | `false` |

## Hosts

| Surface | Host |
| --- | --- |
| Podcasts / Sports / TV catalogs | `https://admin.hiddentunes.com` |
| Music API | `https://hiddentunes.com/api` |
| localhost / LAN | none |
| AfriMeetup | none |

## Expo Doctor / deps

- `expo-doctor`: **21/21 pass** after upgrading `expo-web-browser@~56.0.6` and `react-native-screens@~4.26.0`
- `expo install --check`: pass
