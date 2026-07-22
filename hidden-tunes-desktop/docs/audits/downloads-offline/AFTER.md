# AFTER — Downloads / Offline

## Delivered

- Versioned download metadata `downloads-v1.json`
- Family-safe identities (`song:id`, `podcast_episode:id`, …)
- Main-process DownloadManager (concurrency 2, size/disk guards, reconcile)
- Preload downloads API + `ht-download://` protocol
- Downloads page with groups, filters, disk usage, play/remove/retry/cancel
- Download controls on podcast episodes, audiobook chapters, motivational sessions, lecture sessions, and music player (when stable HTTPS URL present)
- No Download UI on Radio / live TV
- Library remains separate; remove download preserves favorites
- Mature gating on Downloads list
- Contract harness + Electron runtime harness

## Deferred

- Byte-range resume
- VOD HLS offline packaging
- Automatic cleanup policies
- Cloud sync of downloads
