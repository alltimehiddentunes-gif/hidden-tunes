# Capabilities

Authoritative resolver: `src/lib/queue/capabilities.ts` → `resolvePlaybackCapabilities(song)`.

| Family | Seek | Previous / Next | Auto-advance | Finite progress |
| ------ | ---- | --------------- | ------------ | --------------- |
| Music (`song`) | Yes | Yes | Yes | Yes |
| Radio | No | Context only (Yes when queue allows) | No | No — LIVE |
| Podcast episode | Yes | Yes | Yes | Yes |
| Audiobook chapter | Yes | Yes | Yes | Yes |
| Motivational | Only when finite | Yes | Yes | When finite |
| Lecture | Only when finite | Yes | Yes | When finite |
| TV live | No | Existing behavior (Yes) | No | No — LIVE |
| Sports live | No | No by default | No | No — LIVE |
| Downloaded finite audio | Yes | Yes | Original family rule | Original family |

Downloads never change family. `isLocalDownload` is a marker only.

Dead controls must not be shown when capability flags are false. Live media must not render `0:00 / 0:00`.
