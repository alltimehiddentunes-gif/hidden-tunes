# iOS Production — Metro Parity Manifest

Date: 2026-07-31  
Branch tip: `727d5edee9dcb39e0523b5908c9a3118f31412a2`  
App-source lock: `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a`

## Capability table

| Capability | Metro source | Metro value | Required production value |
| --- | --- | ---: | ---: |
| Mature Podcasts visible | `app/podcasts/index.tsx` → `/podcasts/mature`; no `EXPO_PUBLIC_*` gate | Always present in source; age gate via AsyncStorage | Same (code path present) |
| Mature age gate | `utils/maturePodcastSettings.ts` (`enabled` + `hasConsent`) | Local consent required | Same — do not weaken |
| Mature episode access | `services/podcastCatalogApi.ts` `includeMature=true` + mature play API | After consent | Same |
| Podcast autoplay / same-show next | `utils/PodcastPlaybackController.ts`, `utils/podcastPlayback.ts` | Enabled in code (no env flag) | Same |
| Podcast category continuation | `PodcastPlaybackController` + `continuationScope` | Enabled; mature/general isolation | Same |
| Sports master | `EXPO_PUBLIC_SPORTS_ENABLED` + pilot + full UI | `true` / `true` / `true` | `true` / `true` / `true` |
| Sports fixtures | `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED` → `composeFixturesOnlyHome` | `true` | **`true`** (parity fix vs prior EAS `false`) |
| Sports TV | `EXPO_PUBLIC_SPORTS_TV_ENABLED` → `SportsTvShelf` / `useSportsTvCatalog` | `true` | `true` |
| Sports live scores | `EXPO_PUBLIC_SPORTS_LIVE_SCORES_ENABLED` | `false` | `false` |
| Fixture streams | `EXPO_PUBLIC_SPORTS_STREAMS_ENABLED` | `false` | **`false`** |
| Sports notifications | `EXPO_PUBLIC_SPORTS_NOTIFICATIONS_ENABLED` | `false` | `false` |
| Dev fixtures / test player | `EXPO_PUBLIC_SPORTS_USE_DEV_FIXTURES` / `ENABLE_TEST_PLAYER` | `false` | `false` |
| API host (podcasts/sports/TV) | Hardcoded `https://admin.hiddentunes.com` | Production host | Production host |
| Music API | `https://hiddentunes.com/api` | Production host | Production host |

## Code paths (must exist in release SHA)

### Podcasts
- `app/podcasts/mature.tsx`, `hooks/useMaturePodcastCatalog.ts`
- `includeMature` in episode fetches (`podcastCatalogApi.ts`, show/category screens)
- `utils/PodcastPlaybackController.ts` continuation + mature isolation
- Age gate: `maturePodcastSettings.ts`

### Sports
- `app/sports/index.tsx` 2-col grid + filters + Upcoming/Results
- `components/sports/SportsTvShelf.tsx` → existing TV player handoff
- `hooks/useSportsTvCatalog.ts`
- Streams remain gated off via `sports_streams_enabled`

## Variables that do NOT exist / not required
- No `EXPO_PUBLIC_MATURE_PODCASTS_ENABLED`
- No `EXPO_PUBLIC_PODCAST_AUTOPLAY_ENABLED`
- No `EXPO_PUBLIC_API_BASE_URL` for podcast/sports catalogs (hardcoded admin host)

## Release-configuration blocker found and fixed
Prior production EAS had `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED=false` while Metro used `true`. Without fixtures enabled, home cannot compose Upcoming/Results when the API omits fixture sections. Production `eas.json` updated to `true` for this build; streams remain `false`.
