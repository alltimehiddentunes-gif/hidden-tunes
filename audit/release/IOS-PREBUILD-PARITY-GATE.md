# iOS Pre-Build Parity Gate — Mature + Fixtures + Sports TV

Date: 2026-08-01  
Gate result: **PASS**  
Do not start EAS until this file says PASS and Git is clean on the release SHA.

## Release identity under test

| Field | Value |
| --- | --- |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Commit | (see Git tip after this doc is committed) |
| Marketing version | `1.0.2` |
| iOS build number | `1.0.196` |
| Profile | `production` · `developmentClient: false` · `distribution: store` |

## Why the previous TestFlight felt wrong

1. **Fixtures / Sports rails:** Metro sends `X-Hidden-Tunes-Sports-Pilot`. Production previously **stripped** that token under `__DEV__`, so store builds used public Sports home (no browse rails) and could miss Metro-identical composition.
2. **Fixtures flag:** Prior store profile had / behaved like fixtures off relative to Metro.
3. **Mature:** Source was already present; store build must still ship age gate + `includeMature` + paginated mature catalog (same backend ~1772).

## Production capability resolution (simulated EAS env)

| Capability | Required | Resolved |
| --- | ---: | ---: |
| Sports full UI | on | **on** |
| Fixtures | on | **on** |
| Sports TV | on | **on** |
| Fixture streams | off | **off** |
| Pilot token available at build | yes | **yes** (EAS sensitive `EXPO_PUBLIC_SPORTS_PRIVATE_PILOT_TOKEN`) |
| `__DEV__` pilot strip removed | yes | **yes** |

## Source wiring proof

| Feature | Path | Present |
| --- | --- | ---: |
| Mature 18+ entry | `app/podcasts/index.tsx` “Mature Podcasts 18+” | yes |
| Mature screen + age gate | `app/podcasts/mature.tsx` + `maturePodcastSettings.ts` | yes |
| Paginated mature catalog | `hooks/useMaturePodcastCatalog.ts` | yes |
| `includeMature` | `services/podcastCatalogApi.ts` | yes |
| Compose Upcoming/Results | `composeFixturesOnlyHome` in `sportsCatalogApi.ts` | yes |
| Inject Live Sports TV on Sports page | `ensureLiveSportsTvSection` in `app/sports/index.tsx` | yes |
| Sports TV shelf + existing TV player | `SportsTvShelf` → `openTvDiscoveryStation` | yes |

## Live production API proof (same hosts the app uses)

| Check | Result |
| --- | --- |
| Mature catalog page | 40 shows · total **1772** |
| Sports home with pilot | competitions / sports / countries present |
| Fixtures compose path | will compose Live/Upcoming/Results onto Sports page |
| Upcoming fixtures | **18** |
| Finished/results | **20** |
| Sports TV `/api/tv/videos?category=Sports` | **16** on page · total **576** |

## Explicit non-goals still locked

- Fixture streams remain **disabled**
- No backend deploy / migration
- No Android build in this step
