# Data / Playback / Queue / Genre / Design

## DATA-CONTRACT

No fabricated charts. Genre catalogue uses verified request values. Moods require ≥3 matched tracks.

## PLAYBACK-FLOW / QUEUE-FLOW

`context: 'discover'` / album / mood seeds → DesktopPlaybackProvider. Home/Music stay mounted.

## GENRE-MATRIX

All 12 MUSIC_GENRES remain canonical. Home + Music use `createMusicGenreIntent`. Genre Search host shows `data-music-genre-catalogue` and no longer hard-caps loaded rows at 24 after Load more.

## DESIGN-PLAN

SubNav completed; Discover shortcuts restored; Scenes honesty; Moods tab; album New Releases open details.
