# Phase 7 — Launch Content Layer

Editorial launch sections that keep Home, Search, and Discovery feeling full without blocking startup or touching playback.

## Launch sections

| Section | Source | Surfaces |
|---------|--------|----------|
| Featured Playlists | Derived catalog mixes + cloud playlists | Home rail, Search |
| Featured Worlds | `launchWorlds` spotlights | Home chips |
| Featured Genres | `genreHubs` | Home chips |
| Featured Radios | Smart radio entries | Home rail |
| Featured Videos | `LAUNCH_VIDEO_CATEGORIES` | Home + Search chips |
| Featured Podcasts | `LAUNCH_PODCAST_CATEGORIES` | Home + Search chips |
| Trending Now | Ranked + recently discovered songs | Home + Search |
| New Releases | `recentlyDiscovered` | Home |
| Hidden Picks | Curated sections + recommendations | Home |
| Continue Exploring | Explore, Videos, Podcasts, Radio, Search | Home + Search |

## Pipeline

```
catalog slice + discovery snapshot
  → getLaunchContentSnapshot()
    → in-memory fingerprint cache
    → AsyncStorage stale bundle (12h TTL, debounced write)
```

Home hydrates cache async on mount; first paint uses in-memory catalog snapshot, then refreshes quietly when catalog/discovery fingerprints change.

## Rules

- Playable Hidden Tunes catalog songs only in song rails
- No provider branding — all copy is Hidden Tunes
- Empty chip/song sections are omitted from Home feed rows
- No playback, queue, lock-screen, or background changes

## Files

| File | Role |
|------|------|
| `utils/launchContentRegistry.ts` | Labels, continue-exploring chips, video/podcast chip builders |
| `services/launchContentLayer.ts` | Snapshot builder + in-memory cache |
| `utils/launchContentCache.ts` | AsyncStorage persistence |
| `components/launch/LaunchContentChips.tsx` | Horizontal chip rail |
| `components/launch/LaunchContentPlaylistRail.tsx` | Featured playlist cards |
| `utils/homeFeedRows.ts` | Home row ordering |

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```
