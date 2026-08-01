# Downloads Audit

## Previous stub

`MusicSectionContent` case `'downloads'` claimed “Offline downloads are not available on desktop yet” while Electron Downloads + `DesktopDownloadsPage` worked.

## Real owner

Electron `DownloadManager` + renderer bridge + `DesktopDownloadsPage` (sidebar / Home quick action / search).

## Final navigation

- Music SubNav **Downloads** → `onNavigateNav('downloads')` (real page)
- Music section `'downloads'` auto-opens real Downloads via `onOpenDownloads`
- Stub dishonest copy removed
- No second download store

## States

Empty / completed / failed / missing-file remain owned by Downloads page + contract (`verify-downloads-contract`).
