# Sports — Playability

## Browse hint vs resolver

| Layer | Role |
| ----- | ---- |
| Browse `isPlayable` | UI hint — gates whether Play button is shown |
| `resolveSportsPlay` | Authoritative session (`ready` / `unavailable` / `external` / `subscription_required`) |
| `resolvePlayableStream` | HTTPS media only (HLS / DASH / direct) |

Play button is wired only when `fixture.isPlayable` (`DesktopSportsPage` / cards / details). Unplayable fixtures **must not invent Play**.

## Authoritative failures

Probe: finished fixtures → play POST returns **409 finished** → user message like “This event has finished.”

| Reason | User message (canonical) |
| ------ | ------------------------ |
| `finished` | This event has finished. |
| `expired` | The stream is no longer active. |
| `not_started` / `geo_blocked` / `provider_disabled` / `no_broadcast` | This event is not currently available to play. |

## Protocol rejection

Rejected candidates: `http:`, `about:blank`, `blob:`, `file:`, `data:` (non-https).

Embed / iframe / webview-only sessions without HTTPS media → unsupported.

## Known defect

`watch-options` may ignore pilot token and report `enabled: false` even when fixtures browse works under pilot.

## Production playback

**unavailable during test** — no live streams during probe; finished events blocked by resolver.
