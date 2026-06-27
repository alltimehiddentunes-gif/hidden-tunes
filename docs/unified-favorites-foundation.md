# Unified Favorites Foundation

## Overview

Hidden Tunes now stores favorites locally for multiple media types through a single unified model and AsyncStorage-backed service. Song favorites remain backward compatible with the legacy `hidden_tunes_favorites` key.

## Supported item types

| Type | Description |
|------|-------------|
| `song` | Catalog songs and legacy YouTube/TV song favorites |
| `artist` | Catalog artists |
| `album` | Catalog albums |
| `radio_station` | Radio Browser / discovery stations |
| `podcast_show` | Podcast shows |
| `podcast_episode` | Podcast episodes |

## Storage format

- **Primary key:** `hidden_tunes_unified_favorites_v1`
- **Legacy compatibility key:** `hidden_tunes_favorites` (song-only mirror for existing readers)

Each item stores:

```ts
{
  id: string;
  type: FavoriteItemType;
  title: string;
  subtitle?: string;
  artwork?: string;
  source?: string;
  addedAt: string; // ISO timestamp
  metadata?: {
    artistName?: string;
    albumName?: string;
    stationCountry?: string;
    stationLanguage?: string;
    stationGenre?: string;
    streamUrl?: string;
    podcastPublisher?: string;
    podcastFeedUrl?: string;
    episodeDate?: string;
    duration?: number | string;
    is_mature?: boolean;
    content_rating?: "clean" | "explicit" | "adult";
    // song playback fields preserved for migration
    videoId?: string;
    legacyType?: string;
    showId?: string;
    showTitle?: string;
  }
}
```

Lookup key format: `${type}:${id}`

## Migration notes

1. On first hydrate, unified storage is loaded from `hidden_tunes_unified_favorites_v1`.
2. If unified storage is empty, legacy song favorites are read from `hidden_tunes_favorites`, converted to unified items, and written to the new key.
3. If both exist, legacy song favorites are merged without duplicates.
4. Every write updates both unified storage and the legacy song mirror.
5. Existing song favorites are **not** wiped.

## Mature-content behavior

- Mature radio stations and podcasts may be favorited regardless of mature setting.
- Favorites list uses `filterVisibleFavorites()` with `includeMatureInApi` from mature settings.
- When mature content is OFF or consent is missing, mature favorites stay stored but are hidden from the Favorites screen.
- When mature content is ON and consent is confirmed, mature favorites appear with the `18+` badge.

## API helpers

Located in `services/favorites/unifiedFavorites.ts`:

- `addFavorite(item)`
- `removeFavorite(type, id)`
- `toggleFavorite(item)`
- `isFavorite(type, id)`
- `getFavorites()`
- `getFavoritesByType(type)`

React hook: `hooks/useFavorites.ts`  
UI component: `components/FavoriteButton.tsx`

## UI locations updated

### Songs
- `components/catalog/CatalogSongRow.tsx`
- `components/catalog/ArtistTrackRow.tsx`
- `components/catalog/HomePlaybackRows.tsx` (via CatalogSongRow)
- `app/player.tsx`
- `components/MiniPlayer.tsx` (music only)
- `components/search/SearchApkSongRow.tsx`
- `app/search.tsx` (external audio results)
- `app/album/[id].tsx` (track rows)

### Artists
- `app/artist/[id].tsx` (artist hero)
- `app/search.tsx` (artist search cards)

### Albums
- `app/album/[id].tsx` (album hero)
- `app/search.tsx` (album search cards)

### Radio
- `components/radio/RadioBrowserCards.tsx`
- `app/search.tsx` (deferred radio results via RadioStationCard)

### Podcasts
- `components/podcast/PodcastDiscoveryCards.tsx` (shows + episodes)
- `app/podcasts/show/[showId].tsx` (show header)
- `app/search.tsx` (podcast results via PodcastShowCard)

### Library
- `app/favorites.tsx` (sectioned favorites view)
- `app/profile.tsx` (total favorites count)

## Manual QA checklist

- [ ] Favorite a song
- [ ] Unfavorite a song
- [ ] Favorite an artist
- [ ] Unfavorite an artist
- [ ] Favorite an album
- [ ] Unfavorite an album
- [ ] Favorite a radio station
- [ ] Unfavorite a radio station
- [ ] Favorite a podcast show
- [ ] Unfavorite a podcast show
- [ ] Favorite a podcast episode
- [ ] Unfavorite a podcast episode
- [ ] Verify Library/Favorites sections update
- [ ] Verify no duplicates
- [ ] Verify favorites persist after app restart
- [ ] Verify mature favorites hidden when mature OFF
- [ ] Verify mature favorites visible after mature ON + consent
- [ ] Verify playback still works
- [ ] Verify search still works
- [ ] Verify no heat/regression

## Performance notes

- Favorites use an in-memory snapshot with a memoized `Map` lookup.
- `useFavorites()` subscribes via `useSyncExternalStore` — no AsyncStorage reads in render loops.
- `FavoriteButton` uses optimistic in-memory toggles through the shared store.
- PlayerContext song favorites are derived from the unified store version counter.
