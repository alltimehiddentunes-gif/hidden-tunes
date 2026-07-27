# Home Mobile Parity — AFTER

## Final desktop section order

1. Search launcher — `Search Hidden Tunes...`
2. Bounded hero carousel (NOW PLAYING / FEATURED / PICK / GENRE / RECENTLY PLAYED)
3. Signal pills — `{{count}}+ songs ready` · `Curated rooms`
4. Listening brief — Now Playing / idle copy
5. Family shortcuts — Radio · Podcasts · Audiobooks · More
6. Emotional Worlds (+ mood chips)
7. Mood Rooms (hide if empty)
8. Recently Added (empty copy kept)
9. Because You Listened (hide if empty)
10. Smart Music Queue (hide if empty)
11. Creators In Your Orbit (hide if empty)
12. Albums Worth Staying With (hide if empty)
13. Open Rooms (hide if empty)
14. Genre Spotlights / Made for you + See all → Worlds
15. All Songs + Load More

## Removed (were desktop-only)

- Continue Listening
- Recommended for You
- Hidden Gems section
- More to Explore (TV/Sports/Motivationals/Lectures)

## Responsive adaptations (not redesigns)

- Hero: horizontal carousel, `max-height: 320px`, card art ~180px (not full-column poster)
- Family shortcuts: 4-up on wide, 2×2 under 1100px
- Rails show more cards via wider grids
- Content `max-width: 1280px`; bottom padding clears compact player
- More → Worlds (no desktop `/more` hub yet)

## Visual

- Previous: single Featured / oversized hero risk in centre column
- Final: multi-card carousel, max 320px tall
- Above the fold (~1440×900): search, hero, signals, listening brief, family grid, Emotional Worlds start
- Scroll: vertical section stack matching mobile

## Playback

- Unchanged: `DesktopPlaybackProvider`, persistent right player, compact bottom bar
- Home plays through existing `onOpenSong` / queue seed path
