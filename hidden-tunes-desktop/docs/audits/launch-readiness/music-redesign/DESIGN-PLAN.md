# Phase 7 — Design plan

## Principles

1. Home owns music discovery.
2. Persistent player (sidebar/footer) owns the active session.
3. Expanded shell owns immersive controls — same provider state.
4. Real catalogue + local history only.
5. Visual continuity with existing Home foundation (`music-home--premium`, glass, cinematic page frame).

## Hierarchy (Home)

1. **Listening hero** — real track from `buildHomeHeroCards` (Now Playing / Continue / Featured): artwork, title, artist, Play/Resume, optional Open album.
2. **Quick access** — Liked, Recently Played, Downloads, Playlists, Albums (working destinations only).
3. **Recently Added** — truthful catalogue sort (Phase 3).
4. **Moods / Genres** — real filter intents → Search / Worlds.
5. **Explore families** — Radio, Podcasts, etc. (nav only).
6. **Because You Listened / Smart Queue / Creators / Albums / Rooms / All Songs** — only when data exists.

## Interaction repairs

| Surface | Behaviour |
| --- | --- |
| Track card | Primary click → play immediately, stay on Home |
| Album card body | Open album details |
| Album Play control | Play album via existing Queue |
| Artist card | Open artist details |
| Hero Play | Play/Resume hero track via provider |

## Out of scope this phase

- Rewriting `DesktopPlaybackProvider` / queue ownership
- Redesigning Radio / Podcasts / TV / Library chrome beyond shared continuity
- Fake premium features (lossless, AI DJ, fabricated lyrics)
- Competing Music catalogue destination redesign

## Expanded player

Retain `PremiumFullscreenShell`; polish presentation only if needed without new playback ownership.