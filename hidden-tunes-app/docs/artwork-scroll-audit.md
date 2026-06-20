# Artwork + Scroll Audit (Fixing Queue)

Scope: Home, Search, Library, Explore, Player, MiniPlayer. Playback untouched.

## Root causes

| Issue | Impact |
|-------|--------|
| Audius `1000x1000` preferred in normalizer | Full-res decode in ~68px list slots |
| Unstable `{ uri }` objects for `HTImage` | Candidate reset → image reload flicker |
| `key={trackKey}` on MiniPlayer / Player `HTImage` | Forced remount each track change |
| Inline Library `renderItem` | No memoization, no list perf tuning |
| Raw RN `Image` in playlists / collage | No disk cache, no slot sizing |
| Hero artwork preload at `background` phase | Competes with first scroll |

## Fixes applied

1. **`musicNormalizer.ts`** — prefer `150x150` → `480x480` → `1000x1000`
2. **`utils/artwork.ts`** — `pickArtworkForSlot(maxPx)` for CDN size downscale
3. **`HTImage.tsx`** — slot-aware candidate tuning from style width/height
4. **`favorites.tsx`** — memo `FavoriteRow`, stable `source={item}`, list perf props
5. **`playlists.tsx` + `PlaylistArtworkCollage.tsx`** — `HTImage`, memo card, list perf
6. **`search.tsx`** — memo `SearchCatalogSongPressableRow`, stable artwork source
7. **`MiniPlayer.tsx` / `player.tsx`** — remove `HTImage` `key` remounts
8. **`index.tsx`** — defer hero artwork preload to `idle` phase

## Deferred (higher scope)

- Home nested horizontal FlatLists → ScrollView + memo cards
- Narrow `useTrackPlaybackStatus` subscriptions
- Explore vertical virtualization restructure
