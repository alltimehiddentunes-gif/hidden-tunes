# Result model

Search retains family-specific types: `ApiSong`, `ApiAlbum`, `ApiArtist`, `RadioStationMeta`, `PodcastShowMeta`, `AudiobookBookMeta`, `MotivationalSessionMeta`, `TvChannelMeta`, `DesktopSportsFixture`, and `LectureSeries`. Identity is family plus canonical ID. TV and Radio transport IDs are namespaced `tv-` and `radio-`. The repaired boundary passes original typed objects and never infers type from title or group label.
