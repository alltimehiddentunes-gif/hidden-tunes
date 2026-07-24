# Sports — Production Contract

## Host

`https://admin.hiddentunes.com` (approved catalog host)

## Public vs pilot

| Mode | Behavior |
| ---- | -------- |
| Public | Often `enabled: false` → empty / “Sports unavailable” — **must not invent fixtures** |
| Private pilot | Header `X-Hidden-Tunes-Sports-Pilot` (main-process only) unlocks finished fixtures |

## Browse

- Page size: **24** (clamped **1–40**)
- Live refresh: **≥ 30s** (production **45s**)
- Filters: live / upcoming / completed
- Dedupe fixtures by `id`
- Search: `/api/sports/search` bounded limit

## Play

- Browse `isPlayable` is a **hint only**
- Play resolver is authoritative (`resolveSportsPlay` → `resolvePlayableStream`)
- Finished events return unavailable (`409` / reason `finished`) — show user message, do not fake play
- POST catalog allowed **only** for `/api/sports/fixtures/{id}/play`

## Identity

- Fixture: `sports:<id>`
- Queue song: `sports-<id>`
- Must not collide with `tv:` / `tv-` or other history families

## Downloads / Library

- Downloads policy: **`stream_only`**
- Library save for Sports: deferred / unsupported in Library contract

## History

- Type: `sports`
- `positionSeconds`: always `null` (live-ish / event media)

## Production playback (probe)

**unavailable during test** — public disabled; pilot fixtures finished; resolver blocks play.
