# TestFlight Visible Feature Audit

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`

## Summary

This pass fixed fast-navigation crash guards and verified that podcast, radio, discovery, and favorites features are reachable from normal user flows — not only via direct deep links.

## Features Actually Visible (after this pass)

| Feature | Visible | Entry points |
|---------|---------|--------------|
| Podcast home (`/podcasts`) | **YES** | Home → Emotional Worlds → **Podcasts** card; Profile → Discovery → **Podcasts**; Search → deferred podcast section → See more |
| Podcast show + episodes | **YES** | Podcast home rails, categories, search |
| Mature podcasts (gated) | **YES** | Podcast home mature section when mature ON + consent; mature hub route |
| Live radio stations (`/stations`) | **YES** | Home → **Live Radio** card; Profile → Discovery → **Live Radio**; Search → deferred radio section |
| Personal radio (`/radio`) | **YES** | Profile → Personal Radio (unchanged) |
| Infinite discovery (40/page) | **YES** | Podcast category/show lists, station category/search lists, deferred search sections |
| Unified favorites UI | **YES** | Library tab → Favorites; heart buttons on songs/artists/albums/radio/podcasts |
| Favorites sections | **YES** | Songs, artists, albums, radio, podcast shows, podcast episodes |
| 18+ badges | **YES** | Mature podcast/radio cards and favorites rows via `MatureContentBadge` |

## Features That Existed in Code But Were Not Wired

| Feature | Status before | Fix |
|---------|---------------|-----|
| Podcast home screen | Orphaned route (no tab/nav link) | Added Home card + Profile shortcut |
| Live stations browser | Only Home card (already present) | Added Profile shortcut for parity |
| `app/library.tsx` podcast/radio cards | Screen unreachable from nav | Left unchanged; entry points added elsewhere instead |

## Podcast Entry Point Status

- **Home:** `components/EmotionalDiscoveryChips.tsx` — Podcasts card routes to `/podcasts`
- **Profile:** `app/profile.tsx` — Discovery shortcuts include Podcasts and Live Radio
- **Search:** Deferred podcast section with “See more podcasts” link (existing)
- **Bottom nav:** No dedicated podcast tab (by design — Library tab remains Favorites)

## Mature Podcast Status

- Mature setting loaded via `useMatureContentSettings` / `getMatureContentSettings`
- Mature podcast lanes render only when data exists and mature is enabled + consented
- Consent modal gates mature show/episode taps
- Dev checklist logs `matureEnabled`, `matureHasConsent`, `includeMatureInApi`

## Favorites UI Status

- `FavoriteButton` on song rows, player, artist/album pages, radio/podcast cards, podcast show header
- `app/favorites.tsx` sectioned library view with mature filtering
- Malformed stored favorites now normalize with fallback title instead of dropping valid id/type rows

## Fast Navigation Crash Guards Added

| File | Guard |
|------|-------|
| `app/album/[id].tsx` | Request generation ref; ignore stale async; no setState after unmount |
| `app/artist/[id].tsx` | Request generation ref; ignore stale async; no setState after unmount |
| `app/podcasts/show/[showId].tsx` | `useMountedRef` on async episode play |
| `app/podcasts/[categoryId].tsx` | `useMountedRef` before `router.replace` redirects |
| `hooks/useLazyPodcastEpisodeList.ts` | Mounted + generation checks on refresh/loadMore `.finally()` |
| `app/search.tsx` | `useMountedRef` on deferred radio play |
| `components/FavoriteButton.tsx` | Null render when id/type missing |
| `services/favorites/unifiedFavorites.ts` | Safer favorite JSON normalization |

## Dev-Only Diagnostics

`utils/visibleFeatureDiagnostics.ts` logs `[HTVisible]` checklist entries in `__DEV__` only:

- Podcast route mounted + section counts (`app/podcasts/index.tsx`)
- Radio section counts (`app/stations/index.tsx`)
- Favorites provider mounted (`hooks/useFavorites.ts`)
- Favorites screen section counts (`app/favorites.tsx`)
- Main search podcast/radio sections enabled (`app/search.tsx`)
- Mature setting snapshot on each checklist log

## Files Changed

- `hooks/useMountedRef.ts` (new)
- `utils/visibleFeatureDiagnostics.ts` (new)
- `hooks/useLazyPodcastEpisodeList.ts`
- `hooks/useFavorites.ts`
- `app/album/[id].tsx`
- `app/artist/[id].tsx`
- `app/podcasts/show/[showId].tsx`
- `app/podcasts/[categoryId].tsx`
- `app/podcasts/index.tsx`
- `app/stations/index.tsx`
- `app/search.tsx`
- `app/favorites.tsx`
- `app/profile.tsx`
- `components/EmotionalDiscoveryChips.tsx`
- `components/FavoriteButton.tsx`
- `services/favorites/unifiedFavorites.ts`
- `docs/testflight-visible-feature-audit.md` (this file)

## Remaining Risks

1. **Manual QA required** — TestFlight crash repro needs 5+ minutes of rapid navigation on device.
2. **`app/library.tsx` still orphaned** — Has podcast/radio links but is not linked from nav; low risk since other entry points exist.
3. **Android release signing** — Separate blocker from prior release ops (SHA1 mismatch); unrelated to this pass.
4. **Category empty redirect** — Empty podcast categories still redirect to `/podcasts`; guarded by mount check but may feel abrupt during edge-case navigation.

## Manual QA Checklist

- [ ] Open app → Home → tap Podcasts → sections appear (only non-empty lanes)
- [ ] Open podcast show → play episode
- [ ] Enable mature content + consent → mature podcasts appear
- [ ] Disable mature → mature podcasts hide
- [ ] Open Live Radio → load next 40 in category
- [ ] Search → podcast/radio sections appear lower in results
- [ ] Favorite/unfavorite song, artist, album, radio, podcast
- [ ] Rapid page switching for 5 minutes → no crash
