# Phase 13 Settings Matrix

| Section | Behaviour | Status |
|---------|-----------|--------|
| About | Version, legal/support links via `openExternalUrl` | Real |
| Account | Session summary, sign in/out, isolation disclosure | Real |
| Playback | Quality, atmosphere, player style persist; autoplay fixed-off (honest) | Real + honest |
| Appearance | Theme/language called out as unavailable (no fake controls) | Honest unavailable |
| Downloads | Routes to real Downloads owner; no fake Wi?Fi-only caps | Real route |
| Storage | Disk usage + catalog cache + prefs reset | Real |
| Privacy | Account deletion unavailable; privacy policy external | Honest |
| Shortcuts | Documented desktop shortcuts | Documented |
| Diagnostics | Runtime / connectivity / session diagnostics | Real |
| Notifications | Not offered as working push | Honest unavailable |
| Updates | Auto-update still unavailable (Phase 19) | Honest unavailable |

Persistent device-local prefs: audio quality, atmosphere, player style, catalog cache, related desktop preference keys.
Account switch: device-local downloads/prefs are not wiped on sign-out (disclosed).
