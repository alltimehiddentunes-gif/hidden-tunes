# Commit Manifest — Metro Lock

Date: 2026-07-31

Working tree at lock time: clean except one untracked audit folder. All Metro-required source already committed and pushed at HEAD `8e9ad68ee55202a7bc83dd355d76f2e652675efc`.

## Already committed (reproduces Metro) — do not re-stage unless changed

| File | Classification | Commit? | Reason |
| --- | --- | ---: | --- |
| `app/podcasts/mature.tsx` | Podcast mature-catalog fix | already in `f6176ce` | Backend-paginated mature UI |
| `app/podcasts/show/[id].tsx` | Podcast episode-loading + play gate | already in `f6176ce` | `includeMature` + mature play path |
| `app/podcasts/category/[id].tsx` | Podcast performance + episode fix | already in `f6176ce` | Abort/dedupe, artwork bounds, includeMature |
| `app/podcasts/index.tsx` | Podcast performance fix | already in `f6176ce` | Home/catalog wiring |
| `hooks/useMaturePodcastCatalog.ts` | Podcast mature-catalog fix | already in `f6176ce` | Paginated mature catalog hook |
| `hooks/usePodcastPlaybackBinding.ts` | Podcast auto-next/continuation fix | already in `f6176ce` | On-demand resolve binding |
| `utils/PodcastPlaybackController.ts` | Podcast auto-next/continuation fix | already in `f6176ce` | Same-show/category continuation |
| `utils/podcastShowQueue.ts` | Podcast auto-next/continuation fix | already in `f6176ce` | Queue continuation helpers |
| `utils/podcastPlayback.ts` | Podcast auto-next/continuation fix | yes (lint cleanup) | Skip/failure helpers; remove unused `podcastSkipGeneration` (no runtime readers) |
| `utils/podcastPlaybackAdapter.ts` | Podcast auto-next/continuation fix | already in `f6176ce` | Adapter + queue context |
| `utils/maturePodcastSettings.ts` | Podcast mature-catalog fix | already in `f6176ce` | Age-gate helpers |
| `services/podcastCatalogApi.ts` | Podcast episode-loading + mature play | already in `f6176ce` | includeMature + mature play endpoint |
| `services/podcast/podcastCache.ts` | Podcast performance fix | already in `f6176ce` | Cache key isolation |
| `context/PlayerContext.tsx` | Podcast auto-next/continuation fix | already in `f6176ce` | continuationScope + podcast finished path (ownership retained) |
| `scripts/test-mature-podcast-catalog.mjs` | test | already in `f6176ce` | Protects mature catalog |
| `scripts/test-podcast-episode-pipeline.mjs` | test | already in `f6176ce` | Protects includeMature |
| `scripts/test-podcast-mature-play-gate.mjs` | test | already in `f6176ce` | Protects mature play gate |
| `scripts/test-podcast-continuation.mjs` | test | already in `f6176ce` | Protects continuation + isolation |
| `scripts/test-podcast-ultra-performance.mjs` | test | already in `f6176ce` | Protects perf contracts |
| `audit/podcast-performance-and-mature-catalog/*` | documentation/report | already in `f6176ce` | Required audit |
| `audit/podcast-ultra-performance/*` | documentation/report | already in `f6176ce` | Required audit |
| `app/sports/index.tsx` | Sports fixture/grid + TV + performance | already in `c37ade9` | 2-col grid + TV shelf + lint-safe hooks |
| `app/sports/search.tsx` | Sports fixture/grid fix | already in `c37ade9` | Search integration |
| `app/sports/country/[code].tsx` | Sports fixture/grid fix | already in `c37ade9` | Country browse |
| `app/sports/sport/[sportSlug].tsx` | Sports fixture/grid fix | already in `c37ade9` | Sport browse |
| `components/sports/SportsPlayerShell.tsx` | Sports TV / unrelated lint | yes (lint cleanup) | Strip UTF-8 BOM only; no logic change |
| `components/sports/SportsMatchCard.tsx` | Sports fixture/grid + performance | already in `c37ade9` | Premium card UI |
| `components/sports/SportsTvShelf.tsx` | Sports TV integration + TV handoff | already in `c37ade9` | Existing TV player handoff |
| `components/sports/SportsTvChannelCard.tsx` | Sports TV integration | already in `c37ade9` | TV channel card |
| `components/sports/SportsHorizontalShelf.tsx` | Sports performance fix | already in `c37ade9` | Shelf layout |
| `components/sports/SportsEmptyState.tsx` | Sports fixture/grid fix | already in `c37ade9` | Empty state |
| `components/sports/index.ts` | Sports TV integration | already in `c37ade9` | Exports |
| `constants/sportsFlags.ts` | feature-flag wiring | already in `c37ade9` | `sports_tv_enabled` default off + env override |
| `hooks/useSportsTvCatalog.ts` | Sports TV integration + performance | already in `c37ade9` | Bounded Sports TV catalog |
| `lib/sports/*` UI helpers/constants | Sports fixture/grid + TV | already in `c37ade9` | Grid/TV helpers |
| `services/sportsCatalogApi.ts` | Sports fixture/grid + performance | already in `c37ade9` | Catalog API |
| `services/sports/sportsBrowseCache.ts` | Sports performance fix | already in `c37ade9` | Browse cache |
| `types/sports.ts` | Sports fixture/grid fix | already in `c37ade9` | Types |
| `scripts/verify-sports-*.ts` | verification script | already in `c37ade9` | Protects Sports/TV contracts |
| `audit/sports-*/*` | documentation/report | already in `c37ade9` | Required audits |
| `eas.json` | release configuration / feature-flag wiring | already in `3fe6c9f` | Production Sports TV on; streams/fixtures/notifications off |
| `tsconfig.json` | release configuration | already in `3fe6c9f` | Exclude `scripts/` from app typecheck |
| `audit/release/HIDDEN-TUNES-PRODUCTION-RELEASE-REPORT.md` | documentation/report | already in `8e9ad68` | Prior production release report |

## Proposed for this follow-up lock commit

| File | Classification | Commit? | Reason |
| --- | --- | ---: | --- |
| `components/sports/SportsPlayerShell.tsx` | temporary instrumentation / lint | yes | BOM strip only |
| `utils/podcastPlayback.ts` | temporary instrumentation / lint | yes | Remove unread generation counter |
| `audit/release-lock/MATURE-CATALOG-RETRY.md` | documentation/report | yes | Attempt 1 timeout / attempt 2 pass |
| `audit/release-lock/COMMIT-MANIFEST.md` | documentation/report | yes | This manifest |
| `audit/release-lock/METRO-PARITY-VERIFICATION.md` | documentation/report | yes | Parity evidence + mature retry |
| `audit/release-lock/HIDDEN-TUNES-WORKING-METRO-LOCK.md` | documentation/report | yes | Locked checkpoint |
| `audit/release-lock/HIDDEN-TUNES-METRO-TO-GITHUB-LOCK-REPORT.md` | documentation/report | yes | Final lock report |

## Explicitly excluded

| File | Classification | Commit? | Reason |
| --- | --- | ---: | --- |
| `.env` | local environment file | no | secrets / local config |
| `.env.local` | local environment file | no | secrets + Metro-only public flags |
| `.expo/` | generated output | no | cache |
| `node_modules/` | generated output | no | dependencies |

## Uncertain / none

No uncertain source files remain in the dirty tree.
