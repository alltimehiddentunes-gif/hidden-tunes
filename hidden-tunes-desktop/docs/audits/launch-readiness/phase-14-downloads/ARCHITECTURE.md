# Architecture

UI action → useDesktopDownloads/bridge → preload → ht-downloads-* IPC → DownloadManager → probe → partial → rename → metadata → ht-downloads-event → Downloads UI / prefer-local Play → DesktopPlaybackProvider.
