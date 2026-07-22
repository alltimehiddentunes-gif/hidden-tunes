# Downloads Architecture

## Owners

| Layer | Owner |
| ----- | ----- |
| Main process | `electron/downloads/downloadManager.js` |
| Preload API | `window.hiddenTunesDesktop.downloads` |
| Renderer | `src/lib/downloads/*`, `DesktopDownloadsPage` |
| Protocol | `ht-download://media/<relative-path>` |

## Storage

- Root: `<userData>/downloads/`
- Families: `music/`, `podcasts/`, `audiobooks/`, `motivationals/`, `lectures/`
- Partials: `partial/*.part`
- Metadata: `metadata/downloads-v1.json` (schema version **1**)

## Concurrency & limits

- Max concurrent downloads: **2**
- Max item size: **400 MB**
- Free-space reserve: **1 GB**
- Progress throttle: **400 ms**

## IPC surface

```text
downloads.list()
downloads.start(request)
downloads.pause(downloadId)
downloads.resume(downloadId)
downloads.cancel(downloadId)
downloads.remove(downloadId)
downloads.getPlayableUrl(downloadId)
downloads.getDiskUsage()
downloads.reconcile()
downloads.subscribe(listener)
```

Renderer never receives absolute paths, raw filesystem APIs, or arbitrary URL fetch authority beyond typed start requests validated in main.
