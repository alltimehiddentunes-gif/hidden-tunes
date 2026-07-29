# TV Audit (Desktop)

**Owners:** `TvPage.tsx`, `TvNowPlayingPanel.tsx`, `TvVideoSurface.tsx`, `HtmlVideoPlaybackService`  
**Status:** Mostly complete · **85%**  
**Release ready:** Conditional (needs live stream QA)

## Verified

| Area | Result |
|------|--------|
| Browse / search / filters | Present |
| Shared video owner | Singleton `HtmlVideoPlaybackService` |
| Duplicate video | Mutex / stopInactiveMedia pattern |
| Route persistence | Surface resolver is **track-owned**, not route-owned |
| Fullscreen / PiP | Implemented on TV panel |
| Volume / failure handling | Via shared playback provider + panel |
| Favourites / history | Typed paths |

## Defects

- Decorative LIVE badges in browse
- Visual polish secondary to Home
- Depends on backend stream health

## Verdict

TV is the strongest **video** desktop destination. Production-capable pending stream QA — not blocked by fake UI.
