# iOS Build — Source Content Proof

Proven against Git tip before commit of this release prep (and re-confirmed on final release SHA after push).

## Podcasts

| Required | Evidence in tip |
| --- | --- |
| Mature section/route | `app/podcasts/mature.tsx`, home card in `app/podcasts/index.tsx` |
| Mature pagination | `hooks/useMaturePodcastCatalog.ts` + catalog API |
| `includeMature=true` | `services/podcastCatalogApi.ts` (multiple URL builders) |
| No empty-response poisoning | podcast ultra-performance contracts pass |
| Autoplay / continuation | `utils/PodcastPlaybackController.ts`, `utils/podcastPlayback.ts` |
| Mature/general isolation | continuation suite `matureIsolation: true` |
| Age gate intact | `utils/maturePodcastSettings.ts` consent + enabled |

## Sports

| Required | Evidence in tip |
| --- | --- |
| Two-column grid | `app/sports/index.tsx` `columns={2}`; verify script phoneColumns=2 |
| Sports filters | `app/sports/index.tsx` |
| Sports TV shelf | `components/sports/SportsTvShelf.tsx` |
| Sports TV hook | `hooks/useSportsTvCatalog.ts` |
| Feature wiring | `eas.json` production `EXPO_PUBLIC_SPORTS_TV_ENABLED=true` |
| Existing TV player handoff | `openTvDiscoveryStation` only (no duplicate Sports player) |
| Fixture streams disabled | `EXPO_PUBLIC_SPORTS_STREAMS_ENABLED=false`; `watchLivePresent: false` |
| Fixtures enabled (parity) | `EXPO_PUBLIC_SPORTS_FIXTURES_ENABLED=true` (fixed vs prior production `false`) |

## App-source lock delta (`3fe6c9f` → tip)

Only lock docs + BOM strip + unused skip-counter removal + this release prep (fixtures parity + Expo SDK package align). No Podcast/Sports feature reverts.
