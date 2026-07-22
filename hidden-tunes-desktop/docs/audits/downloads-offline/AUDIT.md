# Downloads / Offline — Pre-implementation Audit

## Workspace

- Path: `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`
- Branch: `desktop/integrate-home-music-split`
- Start HEAD: `2e262db4b76d9411be58e60f650d388d862d1778`

## Findings

| # | Area | Finding |
| - | ---- | ------- |
| 1 | Downloads route | Stub `DownloadsPage` in `App.tsx` — “not connected” |
| 2 | Electron main | `electron/main.js` — catalog IPC only before this work |
| 3 | Preload | `electron/preload.js` — `catalog.getJson` only |
| 4 | Renderer IPC | No downloads bridge |
| 5 | File download utils | None |
| 6 | App-data | Electron `app.getPath('userData')` available |
| 7 | Media cache | Streaming URLs only; no durable offline store |
| 8 | Local playback | HTTP(S) only; no `file://` / custom scheme |
| 9 | Storage keys | Library / likes / progress keys; no download DB |
| 10 | Play resolvers | Per-family catalog play endpoints |
| 11 | Direct files | Music/podcast/audiobook/motivational/lecture when finite HTTPS |
| 12 | Expiring URLs | Podcast/audiobook play URLs may expire — resolve before download |
| 13 | Unsuitable | Radio live, TV HLS/live, Sports live, podcast shows |
| 14 | Cleanup | None for offline files |
| 15 | Disk/path utils | None prior |

## Family matrix (audit)

| Media family | Source format | Downloadable? | Current local support | Risk |
| ------------ | ------------- | ------------: | --------------------: | ---- |
| Music | Finite HTTPS when present | Conditional | Stream only | Rights / host allowlist |
| Podcast episode | `/episodes/{id}/play` | Yes (finite) | Stream only | Expiring URLs |
| Podcast show | Container | No | N/A | Accidental show download |
| Audiobook chapter | Chapter play API | Yes (finite) | Stream only | Book-wide bulk |
| Radio | Live / relay | No (`stream_only`) | Stream | Recording |
| TV | HLS / live | No (`stream_only`) | Stream | Recording |
| Motivational | Item play when file | Conditional | Stream only | Embed/stream types |
| Lecture | Lesson play when file | Conditional | Stream only | Video/embed |
| Sports | Live | No | N/A | Unsupported |
