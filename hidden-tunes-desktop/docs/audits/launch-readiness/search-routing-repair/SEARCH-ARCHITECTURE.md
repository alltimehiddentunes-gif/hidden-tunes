# Search architecture

`DiscoverPage` owns the query. Music uses `searchMusicSongsPage` plus local metadata; `useGlobalDesktopSearch` coordinates Radio, Podcast shows, Audiobooks, Motivationals, TV, Sports, Library, Playlists, and Downloads with abort and stale-request guards; Lectures use `useDiscoverLectureSearch`. Typed family states flow into `GlobalSearchSections`, then existing detail dispatchers or `DesktopPlaybackProvider`. No Search-specific player exists.
