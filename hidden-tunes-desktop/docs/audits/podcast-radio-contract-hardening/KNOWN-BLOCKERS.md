# Podcast & Radio — Known Blockers

## Production backend (cannot fix from desktop)

| ID | Severity | Issue | Evidence | Desktop mitigation |
| --- | --- | --- | --- | --- |
| B1 | P0 backend | Unscoped `GET /api/podcasts/episodes` times out (500, statement timeout) | Probe ~8s, `canceling statement due to statement timeout` | Desktop no longer calls it on bootstrap |
| B2 | P0 backend | `GET /api/podcasts/episodes?q=` times out (500) | Probe `q=jazz` ~8s 500 | Desktop only fetches episodes when `category` or `show_id` is present |
| B3 | P2 | Podcast featured feed empty (`total=0`) | `/api/podcasts/featured` | Fallback to `/api/podcasts/shows` |
| B4 | P2 | Radio featured feed empty (`total=0`) | `/api/radio/stations?featured=true` | Browse/all stations still load |

## Desktop deferred (intentional / next tasks)

| ID | Severity | Issue | Notes |
| --- | --- | --- | --- |
| D1 | P2 | Radio load-more UI missing | Backend page 2 works; UI shows first page only |
| D2 | P2 | No radio favorites / history | No dead control present; typed Library is next task |
| D3 | P2 | No mature radio settings / age gate UI | Mature stations excluded client-side by default (CLEAN mobile default) |
| D4 | P2 | Podcast home has no global “latest episodes” rail | Mobile uses local recently played; global API is broken |

## Do not do from this branch

- Edit dirty monorepo `C:\Users\Wills\Desktop\HiddenTunes` on `feature/radio-worldwide-40k`
- Send `includeMature` + `age_confirmed` together on radio search (historical 500 risk; CLEAN mobile omits them)
- Rewrite `DesktopPlaybackProvider` / playback mutex / Player Bar
