# Route matrix (HEAD `3b4a91f`)

Nav ownership: monolithic `App.tsx` `NavKey` state machine (no React Router).

| Route / NavKey | Status | Completion | Blocker | Launch readiness |
|----------------|--------|------------|---------|------------------|
| `home` | Live | ~80% | Fake Recently Added labels; Charts/Moods use free-text `q=` | Partial |
| `music` | Live | ~70% | Visual redesign still required vs Home; Discover genre letter tiles | Partial |
| `radio` | Live | ~88% | No load-more UI (page 1 / limit 32 only) | Near ready |
| `podcasts` | Live | ~90% | Unscoped global episodes avoided (API timeout) | Near ready |
| `tv` | Live | ~90% | Occasional unavailable streams; abort wiring incomplete | Near ready |
| `sports` | Live browse / **unsafe watch** | ~45% | Video surface never mounts for sports; no DASH player | **Not ready** |
| `audiobooks` | Live | ~90% | Minor search depth limits | Near ready |
| `motivationals` | Live | ~85% | Video sessions share Sports surface gap | Partial (audio OK) |
| `lectures` | Live | ~88% | Absent from global search; progressive MP4 on audio path by design | Near ready |
| `search` / Discover | Live | ~80% | Genre mode hosted in Search; display cap 24; Lectures missing from global | Partial |
| `library` / `liked` | Live | ~85% | Sports favourites unsupported | Near ready |
| `playlists` | Live | ~80% | Editorial / local scope | Partial |
| `downloads` | Live (Electron) | ~90% | Requires Electron bridge; HTTPS host allowlist | Near ready |
| `recent` (History) | Live | ~85% | Sports history tap navigates only (no fixture replay) | Partial |
| `worlds` | Live | ~80% | — | Partial |
| `artists` / `albums` | Live | ~85% | — | Near ready |
| `premium` | Preview | ~40% | Checkout disabled; honesty gaps (Offline / Cinematic marked coming-soon while live) | **Not ready to market** |
| `settings` | Partial | ~60% | Appearance/Playback tabs disabled; cosmetic controls | Partial |
| Genre destinations (12) | Live via Search | ~65% | Not dedicated pages; UI capped at 24 songs; live API 503 at audit | Partial |

## Genre checklist (wiring verified in source)

All 12 registry genres (`src/lib/musicGenres.ts`): Afrobeats, Hip-Hop, R&B, Pop, Rock, Dance, Jazz, Classical, Gospel, Country, Latin, Reggae.

| Capability | Status |
|------------|--------|
| Opens from Home via `genre:{slug}` | Yes |
| Dedicated genre page | **No** — Search / Discover shell |
| Production catalogue | Uses `genre=` request (not generic `q=`) |
| Pagination | Fetches more; **UI renders max 24** (`SEARCH_SONG_EXPANDED_LIMIT`) |
| Playback / queue / next / previous | Reuses existing `onOpenSong` / provider queue |
| Live inventory (empty vs filled) | **Not certified** — Express returned **503** during verify |
