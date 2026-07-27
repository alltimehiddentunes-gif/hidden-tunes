# Mobile Home Source of Truth

**Mobile workspace (read-only):** `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`  
**Owner:** `app/music-feed.tsx` (`MusicFeedScreen`)  
**Route / tab:** `/music-feed` · bottom-nav id `"home"` · label `"Home"`

## Exact section order (top → bottom)

1. Header (logo + search icon)
2. Search launcher — `"Search Hidden Tunes..."`
3. Hero carousel — pills: NOW PLAYING / FEATURED / PICK / GENRE / RECENTLY PLAYED (max 6; compact card ~0.92 aspect, height ~340–430)
4. Signal pills — `"{{count}}+ songs ready"` · `"Curated rooms"`
5. Listening brief — eyebrow `"Now Playing"`; idle `"Nothing playing yet"` / `"Tap a song to start listening"`
6. Family shortcuts (2×2) — `"Radio"` · `"Podcasts"` · `"Audiobooks"` · `"More"`
7. Emotional Worlds — title + `"Hidden Tunes rooms shaped by mood and feeling"` + mood chips
8. Mood Rooms — eyebrow `"FOR YOUR MOOD"` · title `"Mood Rooms"` (hide if empty)
9. Recently Added — eyebrow `"NEW"` · title `"Recently Added"` (empty copy kept)
10. Because You Listened — eyebrow `"LISTENER"` (hide if empty)
11. Smart Music Queue — eyebrow `"NEXT"` (hide if empty)
12. Creators In Your Orbit — eyebrow `"CREATORS"` (hide if empty)
13. Albums Worth Staying With — eyebrow `"COLLECTIONS"` (hide if empty)
14. Open Rooms — eyebrow `"ROOMS"` (hide if empty)
15. Genre Spotlights / `"Made for you"` — eyebrow `"GENRES"` · `"See all"` → Explore (hide if empty)
16. All Songs — eyebrow `"FULL CATALOG"` · `"Load More"`

## Not on mobile Home

- Continue Listening section
- Jump In / More to Explore desktop chips
- Full TV / Sports / Motivation / Lectures rails
- Library collection UI

## Personalisation inputs

Onboarding genres, recent plays, favourites, search queries, genre opens, mood-room engagement, active queue, catalog upload order, keyword mood matching.

## Library / More separation

Library = `/library`. More = `/more` hub (not a bottom tab). Home only links to More via the shortcut card.
