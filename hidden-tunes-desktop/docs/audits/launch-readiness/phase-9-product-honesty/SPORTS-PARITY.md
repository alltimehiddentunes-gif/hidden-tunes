# Sports Parity

## Mobile

`sports_streams_enabled: false` (fixtures-only pilot). Watch Live suppressed; fixture-only labels.

## Previous desktop

No client kill-switch. Play shown from API `isPlayable` browse hint. Dispatch could POST `/play` even during streams-off product posture.

## Final desktop

- `src/lib/sports/sportsFlags.ts` — `DESKTOP_SPORTS_STREAMS_ENABLED` defaults **false** (`VITE_SPORTS_STREAMS_ENABLED` optional override)
- Cards/details: Play only when `streamsEnabled && isPlayable`
- Banner + details copy: scores/fixtures available; streaming not enabled
- `dispatchSportsPlayback` returns unavailable **before** resolve/playQueue when streams off
- Shared video owner unchanged; never receives Sports session without verified stream **and** streams enabled

## Checks

`verify-sports-contract.mjs` + `verify-phase9-product-honesty.mjs` assert streams-off defaults, CTA gating, no fake stream URLs.
