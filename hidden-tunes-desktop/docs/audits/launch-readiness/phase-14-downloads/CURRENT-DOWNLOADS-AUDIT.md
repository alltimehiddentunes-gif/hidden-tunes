# Current Downloads Audit

Authoritative owner: `electron/downloads/DownloadManager` via IPC `ht-downloads-*`.
Renderer: `useDesktopDownloads` + `DesktopDownloadsPage`.
Protocol: `ht-download://media/...` under `userData/downloads`.

Phase 14 repairs:
- Family Play prefers completed local files (`applyLocalDownloadUrls`)
- SHA-256 checksum on completion; size mismatch fails finalize
- Reconcile marks zero-byte / size-mismatch as `corrupt`
- Settings honesty: Cancel/Retry, not true pause/resume
- `verify:downloads` + `verify:phase14-downloads` scripts
