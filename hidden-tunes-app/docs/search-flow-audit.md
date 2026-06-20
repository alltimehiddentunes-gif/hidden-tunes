# Search Flow Audit (Fixing Queue)

Scope: `hidden-tunes-app` search only. Playback untouched.

## Backend endpoints confirmed

| Endpoint | Purpose |
|----------|---------|
| `GET /api/songs?q=&page=&limit=` | Primary catalog + metadata search |
| `GET /api/artists?q=` | Artist metadata search |
| Local cache rank (`searchHiddenTunesSongsPage`) | Offline / stale API fallback |

## Root causes (weak / empty results)

1. **Archive disabled** — `ARCHIVE_ENABLED` was `false`; archive step always returned `[]`.
2. **Parallel fan-out** — Hidden Tunes + Audius + Archive ran together; failures swallowed silently.
3. **Early network skip** — Instant `hasAnyResults` (artists-only) blocked waterfall for song-less queries.
4. **Provider labels** — Rows showed Audius / Internet Archive / YouTube in UI.
5. **2–3 char gap** — Empty state hidden while loading; blank feeling on slow network.

## Fixes applied

1. **`services/searchWaterfall.ts`** — Branded waterfall order:
   - Hidden Tunes backend + local rank
   - Audius (if `< 4` playable songs)
   - Internet Archive (if still `< 4`)
2. **Archive re-enabled** with branded `sourceName: Hidden Tunes`.
3. **Network skip** only when local song hits ≥ 4 AND instant songs ≥ 2.
4. **All user-facing labels** → `Hidden Tunes` only.
5. **Filter chips** route through debounced `scheduleNetworkSearch`.
6. **Empty / loading states** — progressive copy + trending suggestion chips.
7. **Play queue** merges network waterfall results with instant hits.

## Deferred

- Backend artist-only search rows in grouped UI
- TV/video metadata merge into main list (TV stays separate entry)
- Unified fuzzy + network single pipeline
