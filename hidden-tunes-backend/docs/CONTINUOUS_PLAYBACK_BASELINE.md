# Continuous Playback Baseline

Generated: 2026-09-18 (owner-canary qualification)

## Architecture signal (read-only audit)

| Signal | Where it lives | Backend can see? |
|---|---|---|
| Search result order | J2 `discoverAndMerge` + `listeningSession` | YES |
| Current track | `GET/HEAD /api/media/:id` | YES (on request) |
| Next / Auto-next | Client `playSong(song, searchQueue, index)` | **INFERRED** from search session order |
| Manual queue reorder / jump | Client-only PlayerContext | NO — only learned when that track is requested |
| Playback progress % | Client player | NO (no client change this wave) |
| R2 catalog tracks | Direct R2 URLs | N/A (READY_LOCAL, no worker) |

**Missing client signal (reported, not modified):** explicit queue window / next-id on media requests. Without it, backend uses **search-session order** as the continuous-listening preparation window (matches Search → Tap → Next/Auto-Next in the existing app).

## Pre-wave measured (prior instant-start suite)

| Transition | p50 | p95 |
|---|---|---|
| SEARCH WARM | 303ms | 314ms |
| SEARCH COLD | 2206ms | 2322ms |
| PREPARED #1 TAP | 212ms | 226ms |
| PREPARED #2 TAP | 248ms | 5609ms (outlier) |
| COLD TAP | 4451ms | 4694ms |
| REPLAY | 168ms | 192ms |
| IN-FLIGHT JOIN | 219ms | 239ms |

## Problem statement

First tap can be instant after search prewarm, but **Next / Auto-Next** was cold unless the next search hit had already finished speculative resolve. Session felt reactive (resolve-on-demand).

## This wave targets

- Unified `PlaybackPreparationService` priorities P0–P5
- Rolling window CURRENT → NEXT → NEXT+1 from search session
- TTL-aware refresh (Gateway `RESOLVE_TTL_MS` default 8m)
- Optional `MediaCache` boundary (Null miss-safe)
- No client / OTA / native changes

## Post-wave numbers

See final report from continuous session suite (filled after qualification).
