# Downloads Security

## Confirmed controls

- Path containment under `<userData>/downloads` via `assertInsideRoot`
- Reject `..`, absolute paths, drive letters, UNC
- Sanitize segments; Windows reserved device names rewritten
- HTTPS + host allowlist for remote media
- Reject `.m3u8`, mpegurl, Icecast/Shoutcast/relay live markers
- Renderer cannot request arbitrary local paths or arbitrary URLs (typed start + main validation)
- No file bytes over IPC — only metadata + `ht-download://` playable URLs
- Preload exposes narrow downloads API only (`contextIsolation`, `sandbox`, no `nodeIntegration`)
- Metadata writes are atomic (tmp + rename, Windows copy fallback)
- No full remote URL logging in metadata (hostname+pathname identity only)

## Explicit non-goals

- No renderer `fs` / `shell` / `exec`
- No automatic destructive cleanup of completed downloads
- No live Radio/TV recording
