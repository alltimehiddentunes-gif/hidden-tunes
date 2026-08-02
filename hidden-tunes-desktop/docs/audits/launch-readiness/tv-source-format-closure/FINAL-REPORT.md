# Desktop TV source-format closure audit

Date: 2026-08-02
Baseline: `3fd3376940898ed57aaadb2aa9cedebf03469be2`
Branch: `desktop/integrate-home-music-split`

## Decision

- HLS: Chromium native first, then bounded `hls.js` recovery/fallback.
- DASH: `dash.js` attached to the existing singleton `HtmlVideoPlaybackService` video element. No second owner or WebView was added.
- Direct HTTPS media: existing HTML media path.
- Webpage/embed/iframe/YouTube source classes: not supported as Desktop TV media. They remain visible when present in browse data, but Play is disabled when the browse contract identifies the format. Resolution also rejects them before media playback.
- Backend relay: consumed only if the approved `/play` response returns its media URL; Desktop does not create a proxy.

## Exact external failure

| Field | Evidence |
| --- | --- |
| Channel | `c61d8018-13db-4583-8b49-4cdb915975b0` — 1-2-3.tv (DE) |
| Source | `iptv-org-123tv.de`; `hls_stream` |
| Canonical URL | `https://123tv-mx1.flex-cdn.net/index.m3u8` |
| Resolver | HTTP 200, no embed URL, platform reported `cross` |
| MIME | `application/x-mpegURL` |
| Manifest | 673-byte HLS master, five variants |
| Variant URLs | All point to `http://customized-cdn.net/invalidurlstream{1..5}/streamPlaylist.m3u8` |
| Redirects | Master final URL unchanged; no useful variant redirect established |
| Headers/referrer | No required headers or referrer metadata returned by `/play`; failure occurs at invalid child URLs |
| CORS | Not the deciding failure; native playback and FFprobe both fail before playable media exists |
| Codec | Undetectable: FFprobe reports zero media streams |
| Geo/auth/token | No evidence of geo, authentication, subscription, or token gating |
| Native error | `Failed to load because no supported source was found.`; readyState 0, 0×0 frames |
| hls.js outcome | No playable child playlist/segments; bounded fallback does not produce frames |
| Classification | `manifest_invalid` / `segment_unavailable`, caused by stale or placeholder backend source data |

This is not an Electron limitation. Backend health validation accepted a syntactically recognizable master without proving that a variant playlist yielded media. The record should be quarantined or repaired by backend health operations; no migration or deployment was performed here.

## Mobile comparison

Mobile calls the same `/api/tv/channels/:id/play` contract and receives the same canonical source. Its current `TvPlaybackContext` uses a WebView HTML `<video>` for HLS-like sources. No per-channel headers, relay URL, transformed source, cookies, or referrer configuration is present in that client path. Therefore there is no evidence that Mobile plays a different approved representation; this broken nested manifest is expected to fail there too unless a deployed mobile/native layer differs from the workspace source.

## Platform contract

The Desktop client now requests `platform=desktop` on browse and play calls and consumes optional `desktop_playable` and `desktop_reason` fields. Until the deployed backend implements that platform, its current parser falls back to `cross` (iOS + Android), which is not proof of Desktop compatibility. The local policy therefore also rejects known web source classes and unknown protocols.

## Parity evidence

| Channel / fixture | Source type | Mobile | Desktop before | Desktop after | Final classification |
| --- | --- | --- | --- | --- | --- |
| Mux x36xhzz | HLS | expected | pass | pass | compatible |
| Mux test_001 | HLS | expected | pass | pass | compatible |
| Vyas Channel | HLS | expected | pass | pass | compatible |
| Ahsan TV | HLS | expected | pass | pass | compatible |
| 100% Comedy | HLS | expected | pass | pass | compatible |
| 1-2-3.tv | malformed nested HLS | expected fail | fail | fail truthfully | backend source/manifest defect |
| Akamai Envivio fixture | DASH | expected | unsupported | pass via dash.js | compatible |
| webpage/embed/iframe class | web | platform/provider-specific | unsupported but clickable | disabled/rejected | Desktop-ineligible by policy |

The deployed public browse API reported HLS for the inspected catalog page and exposes one resolved source per channel. It did not provide five DASH samples, web/embed samples, or an ordered multi-source representation to test. Consequently the requested 10 multi-source fallback table cannot be truthfully produced from this contract. Queue-level next/previous failure skipping remains bounded by `TV_CHANNEL_FAIL_SKIP_LIMIT`; same-channel source fallback requires backend alternate-source data.

## Packaging and security

`dashjs` 5.0.3 (BSD-3-Clause) is bundled in the renderer. The production JS bundle grows materially and Vite reports a large-chunk warning; this is the cost of in-process DASH without a second player surface. Electron context isolation and navigation/popup restrictions are unchanged. No arbitrary iframe, WebView, open proxy, private headers, cookies, or external-player fallback was added.

## Validation record

- `npm run build`: PASS; one Vite chunk-size/CommonJS warning from the DASH dependency.
- Controlled HLS architecture fixtures: PASS 2/2.
- Live HLS sample: PASS 3/4; 1-2-3.tv classified above as external source-health failure.
- DASH controlled fixture: PASS (`readyState` 4, 640×360 decoded frames, exactly one video element).
- Format contract: PASS 20/20.
- Lint: PASS with the existing module-type warning.
- Isolated distribution: PASS to `release-format-closure/` (NSIS installer and win-unpacked). The default `release/` target was locked by an existing running build at `d3dcompiler_47.dll` and was not forcibly stopped.
- Packaged renderer smoke: PASS (React root mounted, non-empty tree, correct title, no fatal renderer errors).
- Playback mutex, shared video surface, route persistence, Search routing, global Search, Home, and Phase 9–16 gates: PASS.
- Fullscreen wiring is retained by the shared `TvVideoSurface`; no separate manual fullscreen interaction capture was performed.

## Scope protection

Unrelated Romania, audiobook, backend-copy, recovery, and TV-browse repair artifacts were not edited. No reset, stash, clean, branch switch, migration, deployment, commit, or push was performed by this audit unless a later final handoff explicitly records otherwise.
