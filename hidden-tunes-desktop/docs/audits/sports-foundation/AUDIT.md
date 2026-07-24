# Sports Foundation — Audit

## Workspace

- Path: `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration\hidden-tunes-desktop`
- Host: `https://admin.hiddentunes.com`
- Surface: Desktop Sports destination (`DesktopSportsPage`)

## Probe findings

| Finding | Detail |
| ------- | ------ |
| Public catalog | `enabled: false` — empty / unavailable shell (truthful) |
| Private pilot | Unlocks real **finished** basketball fixtures |
| Title vs status | Titles may contain `LIVE` while `status.code=finished` |
| Play resolver | Authoritative — `409 finished` / unavailable messaging |
| watch-options | May ignore pilot (`enabled: false`) — **known defect** |
| Search | Works under pilot (`/api/sports/search`, bounded) |
| Live / upcoming | None during probe window |
| Production playback | **unavailable during test** |
| Page size | `24` (`SPORTS_PAGE_SIZE`) |
| Live refresh | `45s` (`SPORTS_LIVE_REFRESH_MS`) |
| Library / Downloads | Deferred — Sports is `stream_only` |
| History | Type `sports` accepted; `positionSeconds` forced `null` |

## Architecture snapshot

- Browse: GET fixtures with filter tabs (Live / Upcoming / Completed)
- Play: POST `/api/sports/fixtures/{id}/play` only (catalogBridge allowlist)
- Stream resolve: HTTPS HLS/DASH/direct only; reject `http:` / `about:blank` / embeds
- Status: single normalizer — never invent live from startTime or title
- Score: never invent `0-0` when missing
- Ownership: Sports uses desktop video path via `isSportsQueueSong` / `usesDesktopVideoPath`

## Deferred

- Library favorites for Sports
- Downloads / offline for Sports (`stream_only`)
- watch-options pilot header parity (backend defect)
