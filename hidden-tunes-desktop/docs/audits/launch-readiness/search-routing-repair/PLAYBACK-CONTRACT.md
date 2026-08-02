# Playback contract

Songs use `selectAndPlay(..., 'discover', ...)` and keep Search mounted. Radio uses the existing `radio` Queue context. TV uses `buildTvQueueSongs` and the `tv` context; `DesktopPlaybackProvider` recognizes the `tv-` identity and owns the shared video service. Podcast, audiobook, motivational, and lecture retain existing adapters and progress owners. No audio/video element, Queue owner, or Search-specific playback state was added.
