# Before structure (code capture) — desktop/home-music-responsibility-split @ 1afd839

## Home route
- navKey/page: home
- owner: MusicHomePage via HomePage in App.tsx
- sidebar: visible
- scroll: main-scroll--home
- queue context: home

## Home section order (before)
1. Featured hero (buildMusicHeroContent)
2. Pick up where you left off (Continue)
3. Made for your listening
4. Recently played
5. Recently added
6. Artists on repeat
7. Fresh releases
8. Explore your sound (genres)
9. Music for how you feel (moods)
10. Collections worth playing
11. Hidden gems
12. Explore more

## Music route
- navKey/page: music
- owner: MusicWorkspace → MusicDiscoverPage (default) / MusicSectionContent
- sidebar: HIDDEN when music + page view (app-shell--music)
- scroll: main-scroll--music
- queue context: discover
- subnav: Discover, New Releases, Top Charts, Genres & Moods, Artists, Albums, Songs, Liked | Playlists, Recent, Downloads

## Music Discover section order (before)
1. Hero row (same buildMusicHeroContent) + My Music Mix + Liked/Playlists shortcuts
2. New Releases
3. Popular on Hidden Tunes
4. Moods & Vibes
5. Genres
6. Made for your listening
7. Recently Played
8. Featured Artists
9. Hidden gems

## Screenshots
UI screenshots require a running Electron session with catalog. Code-level before capture recorded here; after screenshots attempted during validation.
