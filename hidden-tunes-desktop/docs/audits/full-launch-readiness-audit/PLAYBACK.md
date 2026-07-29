# PLAYBACK Audit

| Concern | Owner | Status |
|---------|-------|--------|
| Provider | DesktopPlaybackProvider | Authoritative |
| Audio | HtmlAudioPlaybackService | One owner |
| Video | HtmlVideoPlaybackService | One owner |
| Mutex | stopInactiveMedia | verify-playback-mutex PASS |
| Route independence | track-owned session | route-media PASS |
| Capabilities | lib/queue/capabilities.ts | Family-aware |
| Smart continuation | smartContinuation.ts | Dirty/staged WIP |

**Risks:** Sports/Motivational video without visible surface; dirty provider; transport UI duplication.
