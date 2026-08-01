# Current Home Audit

## Owner

- Route: `App.tsx` `case 'home'` → `HomePage` → `MusicHomePage`
- File: `src/components/home/MusicHomePage.tsx`

## Component tree (Phase 10)

1. Listening hero (real catalogue / now playing / recent)
2. Idle: Personal Mix or Catalogue Mix + quick access; Active: compact quick access
3. Recently Added
4. Recently Played *(history)*
5. Because You Listened
6. Smart Music Queue *(when queue active)*
7. Albums Worth Staying With
8. Creators In Your Orbit
9. Mood Rooms *(catalog-matched)*
10. Emotional Worlds *(emotional lanes with real tracks)*
11. Genre Spotlights *(canonical `MUSIC_GENRES` intents)*
12. Explore Hidden Tunes *(family nav)*
13. Open Rooms
14. All Songs (paginated)

## Data sources

| Surface | Source |
|---------|--------|
| Hero | `buildHomeHeroCards` |
| Personal Mix | `buildPersonalMixes` (fallback Catalogue Mix) |
| Recently Added | `buildRecentlyAddedSongs` |
| Recently Played | `resolveRecentlyPlayedSongs` |
| Mood Rooms | `buildMoodRooms` |
| Emotional Worlds | `buildEmotionalWorldCards` |
| Genres | `MUSIC_GENRES` + `createMusicGenreIntent` |
| Albums / Creators / Because / Rooms | `mobileHomeParity` builders |

## Player

Idle: no right rail. Playing: `hasActiveMediaSession` mounts persistent player; mix column collapses.
