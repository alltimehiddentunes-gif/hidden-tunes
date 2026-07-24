# Sports Foundation — After

- `DesktopSportsPage` with Live / Upcoming / Completed filters, detail, offline banner
- Status normalizer: no live from startTime alone; titles never force Live
- Scores: missing → `—`, never invent `0-0`
- Identity: `sports:<id>` / `sports-<id>`; no TV collision
- Play: `resolveSportsPlay` + `resolvePlayableStream`; Play only when `isPlayable`
- catalogBridge POST only for Sports play path
- `usesDesktopVideoPath` includes Sports; single player bar / video surface
- Downloads: Sports `stream_only`; Library deferred
- History: `sports` type with `positionSeconds` forced `null`
- Search integrated via `/api/sports/search` (bounded)
- Page size 24; live refresh 45s (≥ 30s)
- Validation: `verify-sports-contract.mjs` + `validate-sports-runtime.mjs`
- Production playback (probe): **unavailable during test**
- Known defect documented: watch-options may ignore pilot
