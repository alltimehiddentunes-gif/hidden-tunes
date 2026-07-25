# Persistence

| Key | `ht-desktop:queue:v1` |
| --- | --- |
| Schema version | `1` (`QUEUE_SCHEMA_VERSION`) |
| Cap | `QUEUE_MAX_ITEMS = 500` |
| Restore | Hydrates queue **paused** — `autoplay: false` always |
| Mature restore | Blocked items filtered out when mature library access is disabled |
| Secrets / stream URLs | Stripped by `sanitizeQueueMetadata` |
| TV / Sports | Not written into typed audio queue |
| Downloads | Original family + `localDownloadId` / `metadata.localSource` |
| Legacy | `offline_audio` rows migrate to original family on load |

Corrupt / wrong-version JSON → empty store (safe recovery). Migration never starts playback.
