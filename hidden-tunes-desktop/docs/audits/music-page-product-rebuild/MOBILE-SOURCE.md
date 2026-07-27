# Mobile Music Source (Explore Discovery)

**Source clone (read-only):** `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`  
**Owner:** Explore route `/worlds` → `app/worlds/index.tsx` (`WorldsIndexScreen`)  
**Note:** Mobile has **no tab named “Music”**. Catalog browse = **Explore**. Home `/music-feed` is a separate personalised surface (out of Music scope).

## First visible content
1. Kicker `EXPLORE` · Title `Discovery`
2. Subtitle about listening rooms, moods, stations, albums, creators
3. Refresh (no in-page search)
4. Section `VISUAL DISCOVERY` / `Explore The Catalog` carousel

## Section order (when populated)
1. Explore The Catalog (visual carousel)
2. Keep Listening / Recent Rooms (`NOW TUNED`) — if recent tracks exist
3. Rooms To Enter
4. Mood First (mood rooms)
5. Stations And Scenes (genre-keyword rooms)
6. Genre Spotlights
7. Stay Awhile (albums + deep-cut songs)
8. Creators (artists)

**Absent on Explore:** dedicated New Releases, Charts, Songs/Albums/Artists tab bar, Deep browse grid.

## Presentation
- **Songs:** continue tiles + deep-cut cards; full song lists live on genre rooms / Home, not Explore
- **Albums:** horizontal Stay Awhile rail — square art, title, artist
- **Artists:** Creators rail — art, name, song count
- **Genres / Moods:** distinct editorial cards → `/genre`
- **Search:** separate `/search` route; placeholder `Search songs, artists, albums…`

## Empty / loading
- Full-page loading spinner while discovery loads
- Empty sections omitted (no fake rails)
