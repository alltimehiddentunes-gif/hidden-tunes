import {
  createContext,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  fetchCatalogBundle,
  filterAlbumsByQuery,
  filterArtistsByQuery,
  sortAlbumsList,
  sortArtistsList,
  sortSongsList,
  type AlbumSort,
  type ApiAlbum,
  type ApiArtist,
  type ApiSong,
  type CatalogBundle,
  type SongSort,
} from './lib/api'
import {
  buildSearchMetadataIndex,
  metadataRecordToApiSong,
  metadataRecordsToApiSongs,
  searchCatalogSongs,
  sortMetadataRecords,
  type CatalogMetadataIndex,
} from './lib/songMetadata'
import { withDevAudioVersionTestSongs } from './lib/devAudioVersionTestHarness'
import {
  buildPlayerQueueStats,
} from './lib/playerQueueDisplay'
import {
  buildQueueCandidatePools,
  buildQueueSeedPool,
  CATALOG_DETAIL_TRACK_PREVIEW_LIMIT,
  capSongPool,
  resolveAlbumDisplayArtist,
  resolveAlbumsForArtist,
  resolveSongsForAlbum,
  resolveSongsForArtist,
  resolveSongsForMoodRoom,
  type CatalogIndexes,
} from './lib/catalogIndexes'
import {
  enrichCatalogArtwork,
  getArtworkForArtist,
  getArtworkForPlaylist,
  getArtworkForPlaylistCollage,
  getArtworkForWorld,
  getArtworkForHero,
  getArtworkForPremium,
  type ArtworkContext,
  buildArtworkContext,
} from './lib/artworkIntegrity'
import { EntityAtmosphereBackdrop } from './components/EntityAtmosphereBackdrop'
import {
  logCatalogCacheHit,
  logCatalogCacheMiss,
  logCatalogFetch,
} from './lib/catalogDiagnostics'
import {
  cachedCatalogToBundle,
  clearCachedCatalog,
  readCachedCatalog,
  writeCachedCatalog,
} from './lib/catalogCache'
import {
  AUDIO_QUALITY_MODE_LABELS,
  AUDIO_QUALITY_MODES,
  DESKTOP_PREFERENCE_KEYS,
  parseStoredAlbumSort,
  type AudioQualityMode,
  parseStoredPageId,
  parseStoredSearchTerm,
  parseStoredSongSort,
  PreferencesResetProvider,
  usePersistedPreference,
  usePreferencesReset,
  type StoredPageId,
} from './lib/localPreferences'
import { AtmosphereSettingsPanel } from './components/AtmosphereSettingsPanel'
import { PreferredPlayerStyleSelector } from './components/PreferredPlayerStyleSelector'
import { ArtworkImage } from './components/ArtworkImage'
import { PremiumFullscreenShell } from './components/player/PremiumFullscreenShell'
import { PlayerQueuePanel } from './components/player/PlayerShellPanels'
import { formatPlaybackTime } from './lib/player/formatPlaybackTime'
import { resolvePlayerShellMetadata, resolvePlayerSubtitle } from './lib/playerDisplayMetadata'
import { isAudiobookQueueSong } from './lib/audiobooks/audiobookPlaybackAdapter'
import { isPodcastQueueSong } from './lib/podcasts/podcastPlaybackAdapter'
import { isRadioQueueSong } from './lib/radio/radioPlaybackAdapter'
import { getPreferredNowPlayingStyle } from './lib/nowPlayingStyle'
import { PlayerModeLauncher } from './components/PlayerModeLauncher'
import { PremiumAudioVisualizerProvider } from './components/PremiumAudioVisualizerProvider'
import {
  DesktopPlaybackProvider,
  useDesktopPlayback,
  useDesktopPlaybackProgress,
} from './context/DesktopPlaybackProvider'
import { AtmosphereProvider, useAtmosphere } from './context/AtmosphereContext'
import { resolveAtmosphereForWorld } from './lib/atmosphereManager'
import type { QueueContext, QueueSeedMetadata } from './lib/desktopPlayback/types'
import {
  resolveVisualScene,
  type VisualSceneId,
} from './lib/visualScenes'
import {
  buildEmotionalLanes,
  findEmotionalLane,
} from './lib/emotionalDiscovery'
import {
  buildListeningScenes,
  type BuiltListeningScene,
  filterSongsByListeningScene,
  findListeningScene,
} from './lib/sceneListening'
import {
  buildRadioStation,
  describeRadioSeed,
  resolveRadioSeed,
  type BuiltRadioStation,
} from './lib/desktopRadio'
import {
  getListeningScenesForCatalog,
} from './lib/listeningContext'
import {
  type NowPlayingStyle,
} from './lib/nowPlayingStyle'
import { usePlayerOverlayController } from './lib/usePlayerOverlayController'
import { useAutoOpenPreferredPlayer } from './lib/useAutoOpenPreferredPlayer'
import { RadioPage } from './components/radio/RadioPage'
import { TvPage } from './components/tv/TvPage'
import { TvNowPlayingPanel } from './components/tv/TvNowPlayingPanel'
import { PodcastsPage } from './components/podcasts/PodcastsPage'
import { PodcastShowPage } from './components/podcasts/PodcastShowPage'
import { AudiobooksPage } from './components/audiobooks/AudiobooksPage'
import { AudiobookBookPage } from './components/audiobooks/AudiobookBookPage'
import { MusicHomePage } from './components/home/MusicHomePage'
import {
  EDITORIAL_PLAYLIST_SPECS,
  resolveEditorialPlaylistSpec,
  resolveEditorialPlaylistTracks,
} from './lib/home/editorialPlaylists'
import { buildRadioQueueSongs } from './lib/radio/radioPlaybackAdapter'
import { buildTvQueueSongs, isTvQueueSong } from './lib/tv/tvPlaybackAdapter'
import { buildPodcastQueueSongs } from './lib/podcasts/podcastPlaybackAdapter'
import { buildAudiobookQueueSongs } from './lib/audiobooks/audiobookPlaybackAdapter'
import { setPendingPodcastResumeSeconds } from './lib/podcasts/podcastPlaybackSession'
import { setPendingAudiobookResumeSeconds } from './lib/audiobooks/audiobookPlaybackSession'
import type { PodcastEpisodeMeta, PodcastShowMeta } from './lib/podcasts/types'
import type {
  AudiobookBookMeta,
  AudiobookChapterMeta,
  PlayAudiobookChapterHandler,
} from './lib/audiobooks/types'
import type { RadioStationMeta } from './lib/radio/types'
import type { TvChannelMeta } from './lib/tv/types'
import './App.css'

const LIBRARY_TABS = ['Overview', 'Songs', 'Albums', 'Artists', 'Playlists'] as const
type LibraryTabId = (typeof LIBRARY_TABS)[number]

const LIBRARY_CARD_TONES = [
  'violet',
  'sunset',
  'moon',
  'neon',
  'jazz',
  'love',
  'forest',
  'afro',
  'lounge',
  'run',
  'drive',
  'rain',
] as const

const LIBRARY_CURATED_PLAYLISTS = [
  { title: 'Deep Focus', tone: 'forest' },
  { title: 'Afro Vibes', tone: 'afro' },
  { title: 'Chill & Relax', tone: 'lounge' },
  { title: 'Workout Mix', tone: 'run' },
  { title: 'Late Night Drive', tone: 'drive' },
  { title: 'Rainy Day Comfort', tone: 'rain' },
] as const

const LIBRARY_RECENT_PREVIEW = 6
const LIBRARY_TAB_LIMIT = 24

function formatLibraryCount(value: number) {
  return value.toLocaleString()
}

function filterSongsByLibraryQuery(songs: ApiSong[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return songs
  return songs.filter((song) => {
    const haystack = [song.title, song.artist, song.album, song.genre, song.mood]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}

function formatPlaylistDurationLabel(songs: ApiSong[]) {
  const totalSeconds = songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)
  if (totalSeconds <= 0) return null
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

function formatPlaylistMetaLine(songCount: number, songs: ApiSong[]) {
  const songLabel = `${songCount.toLocaleString()} ${songCount === 1 ? 'song' : 'songs'}`
  const duration = formatPlaylistDurationLabel(songs)
  return duration ? `${songLabel} · ${duration}` : songLabel
}

function filterPlaylistTracksBySearch(tracks: ApiSong[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return tracks
  return tracks.filter((song) => {
    const haystack = [song.title, song.artist, song.album, song.genre, song.mood]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}


const PSD_WAVEFORM_HEIGHTS = [5, 9, 13, 7, 15, 11, 17, 9, 13, 19, 11, 15, 9, 13, 17, 11, 9, 15, 13, 9, 11, 15, 9, 7, 12, 16, 10, 14, 8, 12, 18, 10, 14, 8, 6] as const

const ARTIST_POPULAR_PREVIEW = 5
const ARTIST_POPULAR_EXPANDED = 12
const ARTIST_ALBUM_PREVIEW = 5

function formatArtistStatLine(songCount: number, albumCount: number) {
  return `${songCount.toLocaleString()} ${songCount === 1 ? 'song' : 'songs'} · ${albumCount} ${albumCount === 1 ? 'album' : 'albums'}`
}

function resolveArtistPrimaryGenre(songs: ApiSong[]) {
  const counts = new Map<string, number>()
  for (const song of songs) {
    const genre = song.genre?.trim()
    if (!genre) continue
    counts.set(genre, (counts.get(genre) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1])
  return ranked[0]?.[0] ?? null
}

function countSongsForAlbum(album: ApiAlbum, indexes: CatalogIndexes) {
  return resolveSongsForAlbum(
    album,
    indexes.songsByAlbumId,
    indexes.songsByAlbumName,
    indexes.artistNames,
  ).length
}

const PSD_ALBUMS_SUBTITLE = 'All albums in your library.'
const PSD_ALBUMS_FOOTER_COUNT = '24 albums'
const PSD_ALBUMS_GRID_CARDS = [
  { key: 'alb1', title: 'Reflections at Midnight', artist: 'Wills Afrobeats', year: '2024', songs: '12 songs' },
  { key: 'alb2', title: 'Afro Sunrise', artist: 'Wills Afrobeats', year: '2023', songs: '10 songs' },
  { key: 'alb3', title: 'Vibes from Lagos', artist: 'Wills Afrobeats', year: '2023', songs: '14 songs' },
  { key: 'alb4', title: 'Love & Rhythm', artist: 'Wills Afrobeats', year: '2022', songs: '11 songs' },
  { key: 'alb5', title: 'The Beginning', artist: 'Wills Afrobeats', year: '2021', songs: '9 songs' },
  { key: 'alb6', title: 'Jazz Café', artist: 'Wills Afrobeats', year: '2020', songs: '8 songs' },
  { key: 'alb7', title: 'Deep Focus', artist: 'Wills Afrobeats', year: '2019', songs: '15 songs' },
  { key: 'alb8', title: 'Moments of Us', artist: 'Wills Afrobeats', year: '2018', songs: '7 songs' },
  { key: 'alb9', title: 'Rainy Day Comfort', artist: 'Wills Afrobeats', year: '2017', songs: '13 songs' },
  { key: 'alb10', title: 'Live in Accra', artist: 'Wills Afrobeats', year: '2016', songs: '6 songs' },
] as const

const PSD_PLAYER_TITLE = 'Midnight Reflection'
const PSD_PLAYER_ARTIST = 'Wills Afrobeats'
const PSD_PLAYER_SOURCE_ALBUM = 'Night Drive'
const PSD_PLAYER_POSITION_SECONDS = 108
const PSD_PLAYER_DURATION_SECONDS = 236
const PSD_PLAYER_TABS = ['QUEUE', 'LYRICS', 'DETAILS'] as const
const PSD_PLAYER_LYRICS_LINES = [
  { tier: 'dimmed', text: 'In the quiet of the evening' },
  { tier: 'dimmed', text: 'When the world slows down' },
  { tier: 'active', text: 'City lights, they blur my vision' },
  { tier: 'active', text: 'Chasing dreams in the midnight' },
  { tier: 'active', text: 'Hoping, wishing' },
  { tier: 'dimmed', text: 'For a moment just to feel' },
  { tier: 'dimmed', text: 'Something real beneath the steel' },
  { tier: 'dimmed', text: 'Midnight whispers, soft and low' },
  { tier: 'dimmed', text: 'Guiding me where I should go' },
] as const

const PSD_PLAYER2_TITLE_TOP = 'ECHOES'
const PSD_PLAYER2_TITLE_MID = 'OF'
const PSD_PLAYER2_TITLE_BOTTOM = 'MIDNIGHT'
const PSD_PLAYER2_ARTIST = 'Wills AfroBeats'
const PSD_PLAYER2_ALBUM = 'Night Drive'
const PSD_PLAYER2_YEAR = '2024'
const PSD_PLAYER2_DEVICE = 'WH-1000XM5'
const PSD_PLAYER2_NEXT_TITLE = 'Midnight Reflection'
const PSD_PLAYER2_NEXT_ARTIST = 'Wills AfroBeats'
const PSD_PLAYER2_LYRICS_ACTIVE = [
  'Tell me where the stars go',
  'When the city sleeps alone',
  "I'm still chasing echoes",
] as const
const PSD_PLAYER2_LYRICS_BODY = [
  'Echoes of the past',
  'They pull me close',
  'Memories like a ghost',
  'In the midnight glow',
  'Every street I know',
  'Leads me back to you',
  'Under neon skies',
  'We begin anew',
] as const
const PSD_PLAYER2_SIDEBAR_NAV = [
  { key: 'home', label: 'Home' },
  { key: 'worlds', label: 'Explore' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'liked', label: 'Favorites' },
  { key: 'downloads', label: 'Downloads' },
] as const

const PSD_PLAYER3_SOURCE = 'Night Drive'
const PSD_PLAYER3_TITLE_SCRIPT = 'Echoes of'
const PSD_PLAYER3_TITLE_MAIN = 'MIDNIGHT'
const PSD_PLAYER3_ARTIST = 'Wills AfroBeats'
const PSD_PLAYER3_DISC_TIME = '2:35'
const PSD_PLAYER3_TABS = ['LYRICS', 'VISUALIZER', 'DETAILS'] as const
const PSD_PLAYER3_LYRICS = [
  'Tell me where the stars go',
  'When the city sleeps alone',
  "I'm still chasing echoes",
  'Echoes of the past',
  'They pull me close',
  'Memories like a ghost',
  'In the midnight glow',
] as const
const PSD_PLAYER3_SIDEBAR_NAV = [
  { key: 'home', label: 'Home' },
  { key: 'worlds', label: 'Explore' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'liked', label: 'Favorites' },
  { key: 'downloads', label: 'Downloads' },
] as const
const PSD_PLAYER3_UP_NEXT = [
  { key: 'p3-u1', title: 'Midnight Reflection', artist: 'Wills AfroBeats', active: true },
  { key: 'p3-u2', title: 'Afro Sunset', artist: 'Wills AfroBeats', active: false },
  { key: 'p3-u3', title: 'Lost in Dreams', artist: 'Wills AfroBeats', active: false },
  { key: 'p3-u4', title: 'Healing Slowly', artist: 'Wills AfroBeats', active: false },
  { key: 'p3-u5', title: 'Night Drive', artist: 'Wills AfroBeats', active: false },
] as const
const PSD_PLAYER3_STATS = {
  songs: '24',
  duration: '1h 42m',
  plays: '287',
} as const

const DESKTOP_PLAYER_MODE_PLAYER4 = 'player-4' as const

const PSD_PLAYER4_SOURCE = 'Night Drive'
const PSD_PLAYER4_TITLE = 'ECHOES OF TOMORROW'
const PSD_PLAYER4_ARTIST = 'Wills AfroBeats'
const PSD_PLAYER4_YEAR = '2024'
const PSD_PLAYER4_POSITION_SECONDS = 108
const PSD_PLAYER4_DURATION_SECONDS = 272
const PSD_PLAYER4_LYRICS = [
  'Tell me where the stars go',
  'When the city sleeps alone',
  "I'm still chasing echoes",
] as const
const PSD_PLAYER4_MAIN_NAV = [
  { key: 'home', label: 'Home' },
  { key: 'worlds', label: 'Explore' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'playlists', label: 'Playlists', active: true },
  { key: 'liked', label: 'Favorites' },
  { key: 'downloads', label: 'Downloads' },
] as const
const PSD_PLAYER4_EXTRAS_NAV = [
  { key: 'search', label: 'Radio' },
  { key: 'tv', label: 'Podcasts' },
] as const
const PSD_PLAYER4_UP_NEXT = [
  { key: 'p4-u1', title: 'Midnight Reflection', artist: 'Wills AfroBeats', duration: '3:56', active: true },
  { key: 'p4-u2', title: 'Lost in Dreams', artist: 'Wills AfroBeats', duration: '4:12', active: false },
  { key: 'p4-u3', title: 'City Lights', artist: 'Wills AfroBeats', duration: '3:28', active: false },
  { key: 'p4-u4', title: 'After Hours', artist: 'Wills AfroBeats', duration: '4:01', active: false },
  { key: 'p4-u5', title: 'Neon Skyline', artist: 'Wills AfroBeats', duration: '3:44', active: false },
] as const
const PSD_PLAYER4_SOUND_MODES = [
  { key: 'atmos', label: 'DOLBY ATMOS' },
  { key: 'bass', label: 'BASS BOOST' },
  { key: 'spatial', label: 'SPATIAL AUDIO' },
] as const

const DESKTOP_PLAYER_MODE_PLAYER5 = 'player-5' as const

const PSD_PLAYER5_SOURCE = 'Night Drive'
const PSD_PLAYER5_TITLE = 'ECHOES OF TOMORROW'
const PSD_PLAYER5_ARTIST = 'Wills AfroBeats'
const PSD_PLAYER5_YEAR = '2024'
const PSD_PLAYER5_POSITION_SECONDS = 108
const PSD_PLAYER5_DURATION_SECONDS = 272
const PSD_PLAYER5_VOLUME_PERCENT = 80
const PSD_PLAYER5_LYRICS = [
  'Tell me where the stars go',
  'When the city sleeps alone',
  "I'm still chasing echoes",
  'Through the midnight glow',
  'Where the rivers flow',
] as const
const PSD_PLAYER5_MAIN_NAV = [
  { key: 'home', label: 'Home', active: true },
  { key: 'worlds', label: 'Explore' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'liked', label: 'Favorites' },
  { key: 'downloads', label: 'Downloads' },
] as const
const PSD_PLAYER5_LIBRARY_NAV = [
  { key: 'search', label: 'Radio' },
  { key: 'tv', label: 'Podcasts' },
] as const
const PSD_PLAYER5_UP_NEXT = [
  { key: 'p5-u1', title: 'Midnight Reflection', artist: 'Wills AfroBeats', duration: '3:56', active: true },
  { key: 'p5-u2', title: 'Lost in Dreams', artist: 'Wills AfroBeats', duration: '4:12', active: false },
  { key: 'p5-u3', title: 'City Lights', artist: 'Wills AfroBeats', duration: '3:28', active: false },
  { key: 'p5-u4', title: 'After Hours', artist: 'Wills AfroBeats', duration: '4:01', active: false },
  { key: 'p5-u5', title: 'Neon Skyline', artist: 'Wills AfroBeats', duration: '3:44', active: false },
] as const
const PSD_PLAYER5_STATS = {
  songs: '24',
  duration: '2h 18m',
  plays: '348',
  likes: '128',
} as const

const PSD_LIKED_META = '482 songs • 28h 47m'
const PSD_LIKED_DESCRIPTION = 'All your favorite tracks in one place.'

const PSD_LIKED_TABLE_ROWS = [
  { key: 'ls1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', album: 'Reflections at Midnight', dateAdded: 'May 12, 2024', duration: '3:56', active: true },
  { key: 'ls2', title: 'Afro Sunset', artist: 'Wills Afrobeats', album: 'Afro Sunset', dateAdded: 'May 10, 2024', duration: '3:21' },
  { key: 'ls3', title: 'Love Vibes', artist: 'Wills Afrobeats', album: 'Love & Rhythm', dateAdded: 'May 9, 2024', duration: '3:44' },
  { key: 'ls4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', album: 'Rain & Reflection', dateAdded: 'May 8, 2024', duration: '4:12' },
  { key: 'ls5', title: 'Night Drive', artist: 'Wills Afrobeats', album: 'Vibes from Lagos', dateAdded: 'May 6, 2024', duration: '4:01' },
  { key: 'ls6', title: 'Healing Slowly', artist: 'Wills Afrobeats', album: 'The Beginning', dateAdded: 'May 5, 2024', duration: '3:48' },
  { key: 'ls7', title: 'Jazz Café', artist: 'Wills Afrobeats', album: 'Jazz Café', dateAdded: 'May 3, 2024', duration: '3:36' },
  { key: 'ls8', title: 'Deep Focus', artist: 'Wills Afrobeats', album: 'Deep Focus', dateAdded: 'May 1, 2024', duration: '4:20' },
  { key: 'ls9', title: 'Moments of Us', artist: 'Wills Afrobeats', album: 'Moments of Us', dateAdded: 'Apr 30, 2024', duration: '3:52' },
  { key: 'ls10', title: 'Lost In The Moment', artist: 'Zonkeelsy', album: 'Lost In The Moment', dateAdded: 'Apr 28, 2024', duration: '3:12' },
] as const

const PSD_RECENT_TABLE_ROWS = [
  { key: 'rp1', title: 'Falling Slowly', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '2 min ago', duration: '3:42' },
  { key: 'rp2', title: 'Midnight Reflection', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '8 min ago', duration: '3:56' },
  { key: 'rp3', title: 'Afro Sunset', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '15 min ago', duration: '3:21' },
  { key: 'rp4', title: 'Night Drive', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '24 min ago', duration: '4:01' },
  { key: 'rp5', title: 'Chill & Relax', subtitle: 'Playlist • 40 songs', artist: '', itemType: 'Playlist', played: '37 min ago', duration: '—' },
  { key: 'rp6', title: 'Healing Slowly', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '1 hour ago', duration: '3:48' },
  { key: 'rp7', title: 'Love Vibes', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '1 hour ago', duration: '3:44' },
  { key: 'rp8', title: 'Workout Mix', subtitle: 'Playlist • 25 songs', artist: '', itemType: 'Playlist', played: '2 hours ago', duration: '—' },
  { key: 'rp9', title: 'Live in Accra', subtitle: 'Wills Afrobeats', artist: '', itemType: 'Album', played: '3 hours ago', duration: '—' },
  { key: 'rp10', title: 'Rainy Day Comfort', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '4 hours ago', duration: '4:05' },
] as const

const PSD_DOWNLOADS_STORAGE_PERCENT = 72
const PSD_DOWNLOADS_PLAYLISTS = [
  { key: 'dw-pl1', title: 'Night Drive', meta: '50 songs • 3h 12m' },
  { key: 'dw-pl2', title: 'Chill Vibes', meta: '35 songs • 2h 17m' },
  { key: 'dw-pl3', title: 'Jazz Café', meta: '40 songs • 2h 45m' },
] as const
const PSD_DOWNLOADS_ALBUMS = [
  { key: 'dw-al1', title: 'Midnight Memories', artist: 'Wills Afrobeats', meta: '12 songs • 45 min' },
  { key: 'dw-al2', title: 'After Hours', artist: 'Wills Afrobeats', meta: '10 songs • 38 min' },
] as const
const PSD_DOWNLOADS_SONGS = [
  { key: 'dw-s1', title: 'Midnight Reflection', meta: 'Wills Afrobeats • Night Drive' },
  { key: 'dw-s2', title: 'Afro Sunset', meta: 'Wills Afrobeats • Night Drive' },
  { key: 'dw-s3', title: 'Love Vibes', meta: 'Wills Afrobeats • Night Drive' },
  { key: 'dw-s4', title: 'Healing Slowly', meta: 'Wills Afrobeats • Night Drive' },
  { key: 'dw-s5', title: 'Night Drive', meta: 'Wills Afrobeats • Night Drive' },
  { key: 'dw-s6', title: 'Rainy Day Comfort', meta: 'Wills Afrobeats • Night Drive' },
] as const
const PSD_DOWNLOADS_TABS = ['All', 'Playlists', 'Albums', 'Songs', 'Podcasts'] as const

const PSD_WAVEFORM_ALBUM = 'Reflections at Midnight'
const PSD_WAVEFORM_LYRICS = [
  'City lights paint the sky',
  'Dreams awake as I pass by',
] as const

const PSD_LYRICS_ALBUM = 'Reflections at Midnight'
const PSD_LYRICS_LINES = [
  { tier: 'active-purple', text: 'City lights' },
  { tier: 'active-purple', text: 'paint the sky' },
  { tier: 'active-white', text: 'Dreams awake' },
  { tier: 'active-white', text: 'as I pass by' },
  { tier: 'next', text: 'Echoes calling' },
  { tier: 'next', text: 'in the night' },
  { tier: 'next', text: 'Heart is racing,' },
  { tier: 'next', text: 'feels so right' },
  { tier: 'dimmed', text: 'Lost in thoughts' },
  { tier: 'dimmed', text: "but I'm alive" },
  { tier: 'dimmed', text: 'Chasing moments' },
  { tier: 'dimmed', text: 'that arrive' },
  { tier: 'distant', text: 'Through the shadows,' },
  { tier: 'distant', text: 'I will find' },
  { tier: 'distant', text: 'A place where peace' },
  { tier: 'distant', text: 'resides' },
] as const

/** PSD player design reference — not displayed as live playback data. */
void [
  PSD_PLAYER_SOURCE_ALBUM,
  PSD_PLAYER_LYRICS_LINES,
  PSD_PLAYER2_TITLE_TOP,
  PSD_PLAYER2_TITLE_MID,
  PSD_PLAYER2_TITLE_BOTTOM,
  PSD_PLAYER2_ARTIST,
  PSD_PLAYER2_ALBUM,
  PSD_PLAYER2_YEAR,
  PSD_PLAYER2_DEVICE,
  PSD_PLAYER2_NEXT_TITLE,
  PSD_PLAYER2_NEXT_ARTIST,
  PSD_PLAYER2_LYRICS_ACTIVE,
  PSD_PLAYER2_LYRICS_BODY,
  PSD_PLAYER3_SOURCE,
  PSD_PLAYER3_TITLE_SCRIPT,
  PSD_PLAYER3_TITLE_MAIN,
  PSD_PLAYER3_ARTIST,
  PSD_PLAYER3_DISC_TIME,
  PSD_PLAYER3_LYRICS,
  PSD_PLAYER3_UP_NEXT,
  PSD_PLAYER3_STATS,
  PSD_PLAYER4_TITLE,
  PSD_PLAYER4_ARTIST,
  PSD_PLAYER4_YEAR,
  PSD_PLAYER4_POSITION_SECONDS,
  PSD_PLAYER4_DURATION_SECONDS,
  PSD_PLAYER4_SOURCE,
  PSD_PLAYER4_LYRICS,
  PSD_PLAYER4_UP_NEXT,
  PSD_PLAYER4_SOUND_MODES,
  PSD_PLAYER5_TITLE,
  PSD_PLAYER5_SOURCE,
  PSD_PLAYER5_ARTIST,
  PSD_PLAYER5_YEAR,
  PSD_PLAYER5_POSITION_SECONDS,
  PSD_PLAYER5_DURATION_SECONDS,
  PSD_PLAYER5_VOLUME_PERCENT,
  PSD_PLAYER5_LYRICS,
  PSD_PLAYER5_UP_NEXT,
  PSD_PLAYER5_STATS,
  PSD_WAVEFORM_ALBUM,
  PSD_WAVEFORM_LYRICS,
  PSD_LYRICS_ALBUM,
  PSD_LYRICS_LINES,
  PSD_PLAYER_TITLE,
  PSD_PLAYER_ARTIST,
  PSD_PLAYER_POSITION_SECONDS,
  PSD_PLAYER_DURATION_SECONDS,
  PSD_PLAYER_TABS,
  PSD_PLAYER2_SIDEBAR_NAV,
  PSD_PLAYER3_TABS,
  PSD_PLAYER3_SIDEBAR_NAV,
  DESKTOP_PLAYER_MODE_PLAYER4,
  PSD_PLAYER4_MAIN_NAV,
  PSD_PLAYER4_EXTRAS_NAV,
  DESKTOP_PLAYER_MODE_PLAYER5,
  PSD_PLAYER5_MAIN_NAV,
  PSD_PLAYER5_LIBRARY_NAV,
  PSD_ALBUMS_SUBTITLE,
  PSD_ALBUMS_FOOTER_COUNT,
  PSD_LIKED_META,
  PSD_DOWNLOADS_STORAGE_PERCENT,
]

function PsdWaveformStrip({ className = '' }: { className?: string }) {
  return (
    <div className={`psd-waveform-strip ${className}`.trim()} aria-hidden="true">
      {PSD_WAVEFORM_HEIGHTS.map((height, index) => (
        <span key={index} style={{ height: `${height}px` }} />
      ))}
    </div>
  )
}

function PsdIconHeart({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
    </svg>
  )
}

function PsdIconMore({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}

function PsdIconChevronRight({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function PsdRecentTypeIcon({ type }: { type: 'Song' | 'Playlist' | 'Album' }) {
  if (type === 'Playlist') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    )
  }
  if (type === 'Album') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function PsdIconEqualizer({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="10" width="3" height="10" rx="1" />
      <rect x="10.5" y="6" width="3" height="14" rx="1" />
      <rect x="17" y="12" width="3" height="8" rx="1" />
    </svg>
  )
}

const APP_NAME = 'Hidden Tunes Desktop'
const APP_VERSION = '0.0.1'
const GRID_INITIAL_LIMIT = 24
const GRID_SHOW_MORE_STEP = 24
const SEARCH_DEBOUNCE_MS = 250

let catalogMemoryCache: CatalogBundle | null = null
let catalogSessionFetchDone = false

type CatalogSource = 'none' | 'cache' | 'live'

type CatalogStatus = 'live' | 'saved' | 'refreshing' | 'refresh_failed'

type SongSelectHandler = (song: ApiSong, index: number) => void

type QueueSongHandler = (
  song: ApiSong,
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  live: 'Live catalog',
  saved: 'Saved catalog',
  refreshing: 'Refreshing',
  refresh_failed: 'Refresh failed',
}

function formatSavedCatalogTime(iso: string | null): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return new Date(time).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function resolveCatalogStatus(
  loading: boolean,
  staleCatalog: boolean,
  catalogSource: CatalogSource,
  hasCatalogData: boolean,
  showCatalogError: boolean,
): CatalogStatus {
  if (loading) return 'refreshing'
  if (staleCatalog && hasCatalogData) return 'refresh_failed'
  if (showCatalogError && !hasCatalogData) return 'refresh_failed'
  if (catalogSource === 'live') return 'live'
  if (catalogSource === 'cache' && hasCatalogData) return 'saved'
  return 'saved'
}

function resolveInitialCatalog() {
  try {
    if (catalogMemoryCache) {
      return {
        bundle: catalogMemoryCache,
        source: 'live' as CatalogSource,
        cachedAt: readCachedCatalog()?.cachedAt ?? null,
      }
    }

    const stored = readCachedCatalog()
    if (stored) {
      logCatalogCacheHit({ songCount: stored.songs.length, cachedAt: stored.cachedAt })
      return {
        bundle: cachedCatalogToBundle(stored),
        source: 'cache' as CatalogSource,
        cachedAt: stored.cachedAt,
      }
    }
    logCatalogCacheMiss()
  } catch {
    // Ignore corrupt cache/bootstrap data — app should still open.
  }

  return {
    bundle: { songs: [], albums: [], artists: [] } satisfies CatalogBundle,
    source: 'none' as CatalogSource,
    cachedAt: null as string | null,
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

type CatalogContextValue = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
  artworkContext: ArtworkContext
  searchMetadataIndex: CatalogMetadataIndex
  artistNames: Map<string, string>
  songsByAlbumTitle: Map<string, ApiSong[]>
  songsByArtistName: Map<string, ApiSong[]>
  songsByArtistId: Map<string, ApiSong[]>
  albumsByArtistId: Map<string, ApiAlbum[]>
  loading: boolean
  error: string | null
  loaded: boolean
  catalogStatus: CatalogStatus
  staleCatalog: boolean
  cachedAt: string | null
  showCatalogSkeleton: boolean
  showCatalogError: boolean
  retry: () => void
  refreshCatalog: () => void
  clearCatalogCache: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

function useCatalog() {
  const value = useContext(CatalogContext)
  if (!value) {
    throw new Error('useCatalog must be used within CatalogProvider')
  }
  return value
}

function CatalogProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => resolveInitialCatalog(), [])
  const catalogSourceRef = useRef<CatalogSource>(initial.source)

  const [songs, setSongs] = useState<ApiSong[]>(() => initial.bundle.songs)
  const [albums, setAlbums] = useState<ApiAlbum[]>(() => initial.bundle.albums)
  const [artists, setArtists] = useState<ApiArtist[]>(() => initial.bundle.artists)
  const [loading, setLoading] = useState(() => !catalogSessionFetchDone)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(
    () => initial.source !== 'none' || Boolean(catalogMemoryCache),
  )
  const [catalogSource, setCatalogSource] = useState<CatalogSource>(() => initial.source)
  const [staleCatalog, setStaleCatalog] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(() => initial.cachedAt)
  const [reloadKey, setReloadKey] = useState(0)

  const displaySongs = useMemo(() => withDevAudioVersionTestSongs(songs), [songs])
  const hasCatalogData = displaySongs.length > 0 || albums.length > 0 || artists.length > 0
  const showCatalogSkeleton = loading && !hasCatalogData
  const showCatalogError = Boolean(error) && !hasCatalogData
  const catalogStatus = useMemo(
    () =>
      resolveCatalogStatus(
        loading,
        staleCatalog,
        catalogSource,
        hasCatalogData,
        showCatalogError,
      ),
    [loading, staleCatalog, catalogSource, hasCatalogData, showCatalogError],
  )

  const applyBundle = useCallback((bundle: CatalogBundle, source: CatalogSource, savedAt: string | null) => {
    catalogMemoryCache = bundle
    catalogSourceRef.current = source
    setCatalogSource(source)
    setSongs(bundle.songs)
    setAlbums(bundle.albums)
    setArtists(bundle.artists)
    setLoaded(true)
    setStaleCatalog(false)
    setError(null)
    setCachedAt(savedAt)
  }, [])

  const refreshCatalog = useCallback(() => {
    setReloadKey((n) => n + 1)
  }, [])

  const retry = refreshCatalog

  const clearCatalogCache = useCallback(() => {
    clearCachedCatalog()
    setCachedAt(null)
    setStaleCatalog(false)

    if (catalogSourceRef.current !== 'live') {
      catalogMemoryCache = null
      catalogSessionFetchDone = false
      setSongs([])
      setAlbums([])
      setArtists([])
      setLoaded(false)
      setError(null)
      setLoading(true)
      setReloadKey((n) => n + 1)
    }
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    if (catalogSessionFetchDone && reloadKey === 0 && catalogMemoryCache) {
      applyBundle(
        catalogMemoryCache,
        catalogSourceRef.current,
        readCachedCatalog()?.cachedAt ?? null,
      )
      setLoading(false)
      return () => {
        active = false
        controller.abort()
      }
    }

    setLoading(true)
    setError(null)

    const fetchStarted = performance.now()
    fetchCatalogBundle(controller.signal)
      .then((bundle) => {
        if (!active) return
        writeCachedCatalog(bundle)
        catalogSessionFetchDone = true
        logCatalogFetch({
          songCount: bundle.songs.length,
          albumCount: bundle.albums.length,
          artistCount: bundle.artists.length,
          durationMs: Math.round(performance.now() - fetchStarted),
          source: 'live',
        })
        applyBundle(bundle, 'live', new Date().toISOString())
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        catalogSessionFetchDone = true

        if (catalogSourceRef.current !== 'none') {
          setStaleCatalog(true)
          setLoaded(true)
          setError(null)
          return
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the Hidden Tunes catalog.',
        )
        setLoaded(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey, applyBundle])

  const enrichedCatalog = useMemo(
    () => enrichCatalogArtwork(displaySongs, albums, artists),
    [displaySongs, albums, artists],
  )

  const catalogIndexes = enrichedCatalog.indexes

  const artworkContext = useMemo(
    () => buildArtworkContext(catalogIndexes, enrichedCatalog.albums, enrichedCatalog.artists),
    [catalogIndexes, enrichedCatalog.albums, enrichedCatalog.artists],
  )

  const searchMetadataIndex = useMemo(
    () => buildSearchMetadataIndex(enrichedCatalog.songs, enrichedCatalog.artists),
    [enrichedCatalog.artists, enrichedCatalog.songs],
  )

  const value = useMemo(
    () => ({
      songs: enrichedCatalog.songs,
      albums: enrichedCatalog.albums,
      artists: enrichedCatalog.artists,
      indexes: catalogIndexes,
      artworkContext,
      searchMetadataIndex,
      artistNames: catalogIndexes.artistNames,
      songsByAlbumTitle: catalogIndexes.songsByAlbumName,
      songsByArtistName: catalogIndexes.songsByArtistName,
      songsByArtistId: catalogIndexes.songsByArtistId,
      albumsByArtistId: catalogIndexes.albumsByArtistId,
      loading,
      error,
      loaded,
      catalogStatus,
      staleCatalog,
      cachedAt,
      showCatalogSkeleton,
      showCatalogError,
      retry,
      refreshCatalog,
      clearCatalogCache,
    }),
    [
      enrichedCatalog.albums,
      enrichedCatalog.artists,
      enrichedCatalog.songs,
      artworkContext,
      catalogIndexes,
      searchMetadataIndex,
      loading,
      error,
      loaded,
      catalogStatus,
      staleCatalog,
      cachedAt,
      showCatalogSkeleton,
      showCatalogError,
      retry,
      refreshCatalog,
      clearCatalogCache,
    ],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

type PageId = StoredPageId

type NavKey =
  | 'home'
  | 'radio'
  | 'podcasts'
  | 'audiobooks'
  | 'tv'
  | 'worlds'
  | 'search'
  | 'library'
  | 'liked'
  | 'recent'
  | 'downloads'
  | 'playlists'
  | 'artists'
  | 'albums'
  | 'premium'
  | 'settings'

const PSD_DESTINATION_NAV_KEYS: NavKey[] = [
  'home',
  'radio',
  'podcasts',
  'audiobooks',
  'tv',
  'worlds',
  'search',
  'library',
  'liked',
  'recent',
  'downloads',
  'playlists',
  'artists',
  'albums',
  'premium',
]

const TOP_BAR_PLACEHOLDERS: Partial<Record<NavKey, string>> = {
  home: 'Search songs, artists, moods…',
  radio: 'Search stations, genres, countries…',
  podcasts: 'Search podcasts, episodes, categories…',
  audiobooks: 'Search audiobooks, authors, narrators…',
  tv: 'Search shows, channels, live events…',
  worlds: 'Search emotional worlds…',
  search: 'Search songs, artists, albums…',
  library: 'Search songs, artists, albums, playlists...',
  liked: 'Search liked songs…',
  recent: 'Search recently played...',
  downloads: 'Search downloads…',
  playlists: 'Search playlists…',
  artists: 'Search artists…',
  albums: 'Search albums…',
  premium: 'Search premium perks…',
}

function isPsdDestinationNav(navKey: NavKey) {
  return PSD_DESTINATION_NAV_KEYS.includes(navKey)
}

function resolveDefaultNavKey(page: PageId): NavKey {
  switch (page) {
    case 'mood':
      return 'worlds'
    case 'discover':
      return 'search'
    case 'settings':
      return 'settings'
    default:
      return page as NavKey
  }
}

function resolvePageFromNavKey(navKey: NavKey): PageId {
  switch (navKey) {
    case 'worlds':
      return 'mood'
    case 'search':
      return 'discover'
    case 'liked':
    case 'recent':
    case 'downloads':
    case 'premium':
      return 'library'
    case 'tv':
      return 'tv'
    default:
      return navKey as PageId
  }
}


type SidebarNavItem = {
  key: string
  navKey?: NavKey
  page?: PageId
  label: string
  icon: ReactNode
  disabled?: boolean
}

function isSidebarNavActive(item: SidebarNavItem, activeNavKey: NavKey) {
  return item.navKey != null && item.navKey === activeNavKey
}

function SidebarNavIcon({ children }: { children: ReactNode }) {
  return (
    <span className="sidebar-nav-icon" aria-hidden="true">
      {children}
    </span>
  )
}

const SIDEBAR_PRIMARY_NAV: SidebarNavItem[] = [
  {
    key: 'home',
    navKey: 'home',
    page: 'home',
    label: 'Home',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'radio',
    navKey: 'radio',
    page: 'radio',
    label: 'Radio',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="12" cy="12" r="2" />
          <path d="M16 8a6 6 0 010 8M19 5a10 10 0 010 14" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'podcasts',
    navKey: 'podcasts',
    page: 'podcasts',
    label: 'Podcasts',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M12 14a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M16 8a5 5 0 010 8M19 5a8 8 0 010 14" />
          <path d="M8 16a5 5 0 010-8M5 19a8 8 0 010-14" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'tv',
    navKey: 'tv',
    page: 'tv',
    label: 'TV',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'audiobooks',
    navKey: 'audiobooks',
    page: 'audiobooks',
    label: 'Audiobooks',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 00-3 3V4z" />
          <path d="M8 4v16" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'motivationals',
    label: 'Motivationals',
    disabled: true,
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 20.5l2.1-6.7L3 9.8h6.8L12 3z" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'lectures',
    label: 'Lectures',
    disabled: true,
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M4 19V5h4l2 14 4-14h4v14" />
        </svg>
      </SidebarNavIcon>
    ),
  },
]

const SIDEBAR_LIBRARY_NAV: SidebarNavItem[] = [
  {
    key: 'worlds',
    navKey: 'worlds',
    page: 'mood',
    label: 'Emotional Worlds',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.5 12c1.2-2.2 2.4-3.3 3.5-3.3s2.3 1.1 3.5 3.3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'search',
    navKey: 'search',
    page: 'discover',
    label: 'Search',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'library',
    navKey: 'library',
    page: 'library',
    label: 'My Library',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M4 19V5h4l2 14 4-14h4v14" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'playlists',
    navKey: 'playlists',
    page: 'playlists',
    label: 'Playlists',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'artists',
    navKey: 'artists',
    page: 'artists',
    label: 'Artists',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'albums',
    navKey: 'albums',
    page: 'albums',
    label: 'Albums',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'liked',
    navKey: 'liked',
    page: 'library',
    label: 'Liked Songs',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'recent',
    navKey: 'recent',
    page: 'library',
    label: 'Recently Played',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'downloads',
    navKey: 'downloads',
    page: 'library',
    label: 'Downloads',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <path d="M12 4v10" />
          <path d="M8.5 10.5L12 14l3.5-3.5" />
          <path d="M5 18h14" />
        </svg>
      </SidebarNavIcon>
    ),
  },
  {
    key: 'settings',
    navKey: 'settings',
    page: 'settings',
    label: 'Settings',
    icon: (
      <SidebarNavIcon>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </SidebarNavIcon>
    ),
  },
]

const SIDEBAR_NAV_GROUPS = [
  { label: 'Primary', items: SIDEBAR_PRIMARY_NAV },
  { label: 'Music Library', items: SIDEBAR_LIBRARY_NAV },
] as const

type Mood = 'violet' | 'cyan' | 'rose' | 'mint'

type MoodRoom = {
  title: string
  subtitle: string
  listeners: string
  mood: Mood
  sceneId: VisualSceneId
}

function BrandWaveformMark({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'brand-waveform'}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="14" width="3" height="10" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="9" y="8" width="3" height="22" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="15" y="12" width="3" height="14" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="21" y="5" width="3" height="28" rx="1.5" fill="url(#brandWaveGold)" />
      <rect x="27" y="10" width="3" height="18" rx="1.5" fill="url(#brandWaveGold)" />
      <path
        d="M2 18c4-6 8-9 16-9s12 3 16 9"
        stroke="url(#brandWaveStroke)"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.55"
      />
      <defs>
        <linearGradient id="brandWaveGold" x1="18" y1="4" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBA3D" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
        <linearGradient id="brandWaveStroke" x1="2" y1="9" x2="34" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5C542" />
          <stop offset="1" stopColor="#BF7F72" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function moodRoomScene(room: Pick<MoodRoom, 'title' | 'mood' | 'sceneId'>): VisualSceneId {
  return room.sceneId ?? resolveVisualScene({ seed: room.title, mood: room.mood })
}

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}
function useVisibleSlice<T>(items: T[], resetKey: string) {
  const [limit, setLimit] = useState(GRID_INITIAL_LIMIT)

  useEffect(() => {
    setLimit(GRID_INITIAL_LIMIT)
  }, [resetKey])

  const visible = useMemo(() => items.slice(0, limit), [items, limit])
  const hasMore = limit < items.length
  const showMore = useCallback(() => {
    setLimit((current) => Math.min(current + GRID_SHOW_MORE_STEP, items.length))
  }, [items.length])

  return { visible, hasMore, showMore, total: items.length, shown: visible.length }
}

function ShowMoreRow({
  shown,
  total,
  onShowMore,
}: {
  shown: number
  total: number
  onShowMore: () => void
}) {
  if (total <= GRID_INITIAL_LIMIT) return null

  return (
    <div className="catalog-show-more">
      <span className="catalog-show-more-count">
        Showing {shown} of {total}
      </span>
      {shown < total ? (
        <button type="button" className="btn-secondary btn-sm" onClick={onShowMore}>
          Show more
        </button>
      ) : null}
    </div>
  )
}

function CatalogSkeleton({
  count = 8,
  variant = 'card',
}: {
  count?: number
  variant?: 'card' | 'artist'
}) {
  return (
    <div className={`skeleton-grid skeleton-grid--${variant}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`skeleton-card skeleton-card--${variant}`}>
          <div className="skeleton-card-art" />
          <div className="skeleton-card-line skeleton-card-line--wide" />
          <div className="skeleton-card-line" />
        </div>
      ))}
    </div>
  )
}

function CatalogError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="catalog-error" role="alert">
      <p className="catalog-error-title">Catalog unavailable</p>
      <p className="catalog-error-detail">
        {message || 'Could not reach Hidden Tunes. Wait a moment, then try again.'}
      </p>
      <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
        Retry catalog load
      </button>
    </div>
  )
}

function CatalogEmpty({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="catalog-empty">
      <p className="catalog-empty-title">{title}</p>
      <p className="catalog-empty-detail">{detail}</p>
    </div>
  )
}

const ArtworkCollage = memo(function ArtworkCollage({
  urls,
  seed,
  label,
}: {
  urls: string[]
  seed: string
  label: string
}) {
  if (urls.length <= 1) {
    return (
      <ArtworkImage
        src={urls[0] ?? null}
        alt=""
        seed={seed}
        label={label}
      />
    )
  }

  return (
    <div className={`art-collage art-collage--${Math.min(urls.length, 4)}`} aria-hidden="true">
      {urls.slice(0, 4).map((url, index) => (
        <img key={`${seed}-${index}`} src={url} alt="" className="art-collage-tile" loading="lazy" decoding="async" />
      ))}
    </div>
  )
})

const ArtistAvatar = memo(function ArtistAvatar({
  artist,
}: {
  artist: ApiArtist
}) {
  return (
    <span className="artist-avatar" aria-hidden="true">
      <ArtworkImage
        src={getArtworkForArtist(artist)}
        alt=""
        seed={artist.id}
        label={artist.name}
        variant="circle"
      />
    </span>
  )
})

const ApiSongGrid = memo(function ApiSongGrid({
  songs,
  onSelect,
  listKey = 'songs',
  paginate = true,
  showEmpty = true,
}: {
  songs: ApiSong[]
  onSelect: SongSelectHandler
  listKey?: string
  paginate?: boolean
  showEmpty?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    songs,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderSongs = paginate ? visible : songs

  if (songs.length === 0 && showEmpty) {
    return (
      <CatalogEmpty
        title="No songs match"
        detail="Try a different search or sort order on the loaded catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact">
        {renderSongs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="discovery-card discovery-card--api"
            onClick={() => onSelect(song, songs.findIndex((entry) => entry.id === song.id))}
          >
            <div className="card-art card-art--song">
              <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
            </div>
            <div className="card-info">
              <h3>{song.title}</h3>
              <p className="card-meta-primary">{song.artist}</p>
              <p className="card-meta-secondary">{song.album}</p>
            </div>
          </button>
        ))}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

const ApiAlbumGrid = memo(function ApiAlbumGrid({
  albums,
  artistNames,
  indexes,
  onSelect,
  listKey = 'albums',
  paginate = true,
}: {
  albums: ApiAlbum[]
  artistNames: Map<string, string>
  indexes: CatalogIndexes
  onSelect: (album: ApiAlbum) => void
  listKey?: string
  paginate?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    albums,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderAlbums = paginate ? visible : albums

  if (albums.length === 0) {
    return (
      <CatalogEmpty
        title="No albums match"
        detail="Adjust your search or sorting to explore the cached catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact">
        {renderAlbums.map((album) => {
          const albumSongs = resolveSongsForAlbum(
            album,
            indexes.songsByAlbumId,
            indexes.songsByAlbumName,
            indexes.artistNames,
          )
          const artistName = resolveAlbumDisplayArtist(album, albumSongs, artistNames)
          const artwork = album.artwork
          const trackLabel = `${albumSongs.length} ${albumSongs.length === 1 ? 'track' : 'tracks'}`
          return (
            <button
              key={album.id}
              type="button"
              className="discovery-card discovery-card--api"
              onClick={() => onSelect(album)}
            >
              <div className="card-art card-art--album">
                <ArtworkImage src={artwork} alt="" seed={album.id} variant="wide" />
              </div>
              <div className="card-info">
                <h3>{album.title}</h3>
                <p className="card-meta-primary">{artistName || 'Unknown artist'}</p>
                <p className="card-meta-secondary">
                  {album.releaseYear ? `Released ${album.releaseYear} · ${trackLabel}` : trackLabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})


const ApiArtistGrid = memo(function ApiArtistGrid({
  artists,
  onSelect,
  listKey = 'artists',
  paginate = true,
}: {
  artists: ApiArtist[]
  onSelect: (artist: ApiArtist) => void
  listKey?: string
  paginate?: boolean
}) {
  const { visible, showMore, total, shown } = useVisibleSlice(
    artists,
    paginate ? listKey : `${listKey}:all`,
  )
  const renderArtists = paginate ? visible : artists

  if (artists.length === 0) {
    return (
      <CatalogEmpty
        title="No artists match"
        detail="Adjust your search or explore the cached catalog."
      />
    )
  }

  return (
    <>
      <div className="card-row card-row--compact card-row--artists">
        {renderArtists.map((artist) => (
          <button
            key={artist.id}
            type="button"
            className="discovery-card discovery-card--api discovery-card--artist"
            onClick={() => onSelect(artist)}
          >
            <div className="card-art card-art--artist">
              <ArtistAvatar artist={artist} />
            </div>
            <div className="card-info">
              <h3>{artist.name}</h3>
              <p className="card-meta-primary">
                {artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}
              </p>
            </div>
          </button>
        ))}
      </div>
      {paginate ? <ShowMoreRow shown={shown} total={total} onShowMore={showMore} /> : null}
    </>
  )
})

function CatalogSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  count,
  onViewAll,
  viewAllLabel = 'View all',
  children,
}: {
  title: string
  hint: string
  loading: boolean
  error: string | null
  onRetry: () => void
  count?: number
  onViewAll?: () => void
  viewAllLabel?: string
  children: ReactNode
}) {
  const hintText =
    typeof count === 'number' ? `${hint} · ${count} items` : hint

  return (
    <section className="discovery-section catalog-section" aria-labelledby={`catalog-${title}`}>
      <div className="section-header section-header--catalog">
        <div>
          <h2 id={`catalog-${title}`}>{title}</h2>
          <span className="section-hint">{hintText}</span>
        </div>
        {onViewAll ? (
          <button type="button" className="btn-secondary btn-sm home-section-view-all" onClick={onViewAll}>
            {viewAllLabel}
          </button>
        ) : null}
      </div>
      {loading ? <CatalogSkeleton /> : null}
      {!loading && error ? <CatalogError message={error} onRetry={onRetry} /> : null}
      {!loading && !error ? children : null}
    </section>
  )
}

function PageFrame({
  children,
  cinematic = false,
}: {
  children: ReactNode
  cinematic?: boolean
}) {
  return (
    <div className={`content-inner${cinematic ? ' content-inner--cinematic' : ''}`}>
      {children}
    </div>
  )
}

const HomeTopBar = memo(function HomeTopBar({
  placeholder = 'Search songs, artists, moods…',
  onOpenDiscover,
  onSearchSubmit,
  variant = 'default',
  searchValue,
  onSearchChange,
}: {
  placeholder?: string
  onOpenDiscover?: () => void
  onSearchSubmit?: (query: string) => void
  variant?: 'default' | 'search'
  searchValue?: string
  onSearchChange?: (value: string) => void
}) {
  const [localQuery, setLocalQuery] = useState('')
  const isSearchShell = variant === 'search' && onSearchChange != null
  const query = isSearchShell ? (searchValue ?? '') : localQuery
  const setQuery = isSearchShell ? onSearchChange! : setLocalQuery

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = query.trim()
      if (trimmed) {
        onSearchSubmit?.(trimmed)
      }
      onOpenDiscover?.()
    },
    [onOpenDiscover, onSearchSubmit, query],
  )

  return (
    <header className={`home-top-bar${isSearchShell ? ' home-top-bar--search' : ''}`} aria-label="Home navigation">
      <form className="home-top-search" role="search" onSubmit={handleSubmit}>
        <span className="search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {isSearchShell && query ? (
          <button
            type="button"
            className="home-top-search-clear"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </form>
      {isSearchShell ? (
        <button type="button" className="home-top-filter-btn" aria-label="Search filters">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      ) : null}
    </header>
  )
})

const CatalogStaleBanner = memo(function CatalogStaleBanner() {
  const { catalogStatus, songs, albums, artists } = useCatalog()
  const hasCatalogData = songs.length > 0 || albums.length > 0 || artists.length > 0
  const showBanner = catalogStatus === 'refresh_failed' && hasCatalogData
  if (!showBanner) return null

  return (
    <div className="catalog-stale-banner" role="status">
      <span className="catalog-stale-dot" aria-hidden="true" />
      <span>
        Browsing your saved catalog — live refresh didn&apos;t complete. You can refresh again anytime.
      </span>
    </div>
  )
})

const CatalogStatusBar = memo(function CatalogStatusBar() {
  const { catalogStatus, cachedAt, loading, refreshCatalog, loaded } = useCatalog()
  const savedLabel = formatSavedCatalogTime(cachedAt)

  if (!loaded && !loading) return null

  return (
    <div className="catalog-status-bar" role="status" aria-live="polite">
      <div className="catalog-status-copy">
        <span className={`catalog-status-pill catalog-status-pill--${catalogStatus}`}>
          {CATALOG_STATUS_LABELS[catalogStatus]}
        </span>
        {savedLabel ? (
          <span className="catalog-status-meta">Saved catalog updated {savedLabel}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn-secondary btn-sm catalog-refresh-btn"
        onClick={refreshCatalog}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh catalog'}
      </button>
    </div>
  )
})

function CatalogStatusSettings({
  cacheNotice,
  onClearCache,
}: {
  cacheNotice: string
  onClearCache: () => void
}) {
  const { catalogStatus, cachedAt, loading, refreshCatalog } = useCatalog()
  const savedLabel = formatSavedCatalogTime(cachedAt)

  return (
    <section className="settings-panel">
      <h2>Catalog status</h2>
      <p className="settings-panel-desc">
        Read-only catalog from the Hidden Tunes API, with a local saved copy for offline browsing.
      </p>
      <dl className="settings-identity-list">
        <div className="settings-identity-row">
          <dt>Status</dt>
          <dd>
            <span className={`catalog-status-pill catalog-status-pill--${catalogStatus}`}>
              {CATALOG_STATUS_LABELS[catalogStatus]}
            </span>
          </dd>
        </div>
        <div className="settings-identity-row">
          <dt>Last saved</dt>
          <dd>{savedLabel ? savedLabel : 'Not saved locally yet'}</dd>
        </div>
      </dl>
      {savedLabel ? (
        <p className="settings-panel-desc settings-cache-meta">
          Saved catalog updated {savedLabel}
        </p>
      ) : null}
      <div className="settings-row">
        <div className="settings-label">
          <span>Refresh catalog</span>
          <small>Fetch latest read-only data · preferences stay intact</small>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm settings-reset-btn"
          onClick={refreshCatalog}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="settings-row">
        <div className="settings-label">
          <span>Clear saved catalog cache</span>
          <small>Removes local catalog only · live session data may remain until refresh</small>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm settings-reset-btn"
          onClick={onClearCache}
        >
          Clear cache
        </button>
      </div>
      {cacheNotice ? (
        <p className="settings-reset-note" role="status">
          {cacheNotice}
        </p>
      ) : null}
    </section>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
    </header>
  )
}

function EmotionalLanesSection({
  songs,
  selectedLaneId,
  onSelectLane,
  loading = false,
}: {
  songs: ApiSong[]
  selectedLaneId: string | null
  onSelectLane: (laneId: string | null) => void
  loading?: boolean
}) {
  const { artworkContext } = useCatalog()
  const lanes = useMemo(() => buildEmotionalLanes(songs), [songs])
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const selectedLane = useMemo(
    () => findEmotionalLane(lanes, selectedLaneId),
    [lanes, selectedLaneId],
  )

  if (!loading && lanes.length === 0) return null

  return (
    <section
      className="discovery-section emotional-lanes-section"
      aria-labelledby="emotional-lanes-heading"
    >
      <div className="section-header emotional-lanes-header">
        <div>
          <p className="page-eyebrow emotional-lanes-eyebrow">Emotional discovery</p>
          <h2 id="emotional-lanes-heading">Emotional lanes</h2>
          <span className="section-hint">
            Vibe groupings from catalog metadata — browse lanes, play on your terms
          </span>
        </div>
        {selectedLaneId ? (
          <button
            type="button"
            className="btn-secondary btn-sm emotional-lanes-clear"
            onClick={() => onSelectLane(null)}
          >
            Clear lane
          </button>
        ) : null}
      </div>
      {loading ? (
        <CatalogSkeleton />
      ) : (
        <div className="emotional-lanes-rail" role="list" aria-label="Emotional lanes">
          {lanes.map((lane) => {
            const sceneId = resolveVisualScene({ seed: lane.label, mood: lane.mood })
            const isActive = selectedLaneId === lane.id
            const laneTracks = lane.songIds
              .map((songId) => songsById.get(songId))
              .filter((entry): entry is ApiSong => Boolean(entry))
            const laneCollage = getArtworkForPlaylistCollage(laneTracks, artworkContext)
            return (
              <button
                key={lane.id}
                type="button"
                role="listitem"
                className={'emotional-lane-card' + (isActive ? ' is-active' : '')}
                data-mood={lane.mood}
                data-scene={sceneId}
                aria-pressed={isActive}
                onClick={() => onSelectLane(isActive ? null : lane.id)}
              >
                <div className="emotional-lane-art" aria-hidden="true">
                  {laneCollage.length > 1 ? (
                    <ArtworkCollage urls={laneCollage} seed={lane.id} label={lane.label} />
                  ) : (
                    <ArtworkImage
                      src={laneCollage[0] ?? null}
                      alt=""
                      seed={lane.id}
                      label={lane.label}
                    />
                  )}
                </div>
                <div className="emotional-lane-copy">
                  <h3>{lane.label}</h3>
                  <p>{lane.subtitle}</p>
                  <span className="emotional-lane-meta">
                    {lane.trackCount} {lane.trackCount === 1 ? 'track' : 'tracks'}
                  </span>
                  {lane.topSignals.length > 0 ? (
                    <span className="emotional-lane-signals">
                      {lane.topSignals.join(' · ')}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {selectedLane ? (
        <div className="emotional-lanes-for-mood" role="status">
          <h3 className="emotional-lanes-for-heading">
            For this mood · {selectedLane.label}
          </h3>
          <p className="emotional-lanes-for-detail">{selectedLane.subtitle}</p>
        </div>
      ) : null}
    </section>
  )
}

function SceneListeningSection({
  songs,
  selectedSceneId,
  onSelectScene,
  loading = false,
}: {
  songs: ApiSong[]
  selectedSceneId: string | null
  onSelectScene: (sceneId: string | null) => void
  loading?: boolean
}) {
  const { artworkContext } = useCatalog()
  const scenes = useMemo(() => buildListeningScenes(songs), [songs])
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const selectedScene = useMemo(
    () => findListeningScene(scenes, selectedSceneId),
    [scenes, selectedSceneId],
  )

  if (!loading && scenes.length === 0) return null

  return (
    <section
      className="discovery-section scene-listening-section"
      aria-labelledby="scene-listening-heading"
    >
      <div className="section-header scene-listening-header">
        <div>
          <p className="page-eyebrow scene-listening-eyebrow">Scene listening</p>
          <h2 id="scene-listening-heading">Scene collections</h2>
          <span className="section-hint">
            Curated atmospheres from your catalog — step into a scene, play when ready
          </span>
        </div>
        {selectedSceneId ? (
          <button
            type="button"
            className="btn-secondary btn-sm scene-listening-clear"
            onClick={() => onSelectScene(null)}
          >
            Clear scene
          </button>
        ) : null}
      </div>
      {loading ? (
        <CatalogSkeleton />
      ) : (
        <div className="scene-listening-grid" role="list" aria-label="Listening scenes">
          {scenes.map((scene) => {
            const isActive = selectedSceneId === scene.id
            const sceneTracks = scene.songIds
              .map((songId) => songsById.get(songId))
              .filter((entry): entry is ApiSong => Boolean(entry))
            const sceneCollage = getArtworkForPlaylistCollage(sceneTracks, artworkContext)
            return (
              <button
                key={scene.id}
                type="button"
                role="listitem"
                className={'scene-listening-card' + (isActive ? ' is-active' : '')}
                data-mood={scene.mood}
                data-scene={scene.visualSceneId}
                aria-pressed={isActive}
                onClick={() => onSelectScene(isActive ? null : scene.id)}
              >
                <div className="scene-listening-art" aria-hidden="true">
                  {sceneCollage.length > 1 ? (
                    <ArtworkCollage urls={sceneCollage} seed={scene.id} label={scene.label} />
                  ) : (
                    <ArtworkImage
                      src={sceneCollage[0] ?? null}
                      alt=""
                      seed={scene.id}
                      label={scene.label}
                    />
                  )}
                </div>
                <div className="scene-listening-copy">
                  <h3>{scene.label}</h3>
                  <p>{scene.subtitle}</p>
                  <span className="scene-listening-meta">
                    {scene.trackCount} {scene.trackCount === 1 ? 'track' : 'tracks'}
                  </span>
                  {scene.topSignals.length > 0 ? (
                    <span className="scene-listening-signals">
                      {scene.topSignals.join(' · ')}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {selectedScene ? (
        <div className="scene-listening-active" role="status">
          <h3 className="scene-listening-active-heading">
            In this scene · {selectedScene.label}
          </h3>
          <p className="scene-listening-active-detail">{selectedScene.subtitle}</p>
        </div>
      ) : null}
    </section>
  )
}

function RadioFoundationSection({
  songs,
  browseSongs,
  selectedLaneId,
  selectedLaneLabel,
  selectedSceneId,
  selectedSceneLabel,
  onStartRadio,
  loading = false,
}: {
  songs: ApiSong[]
  browseSongs: ApiSong[]
  selectedLaneId: string | null
  selectedLaneLabel?: string | null
  selectedSceneId: string | null
  selectedSceneLabel?: string | null
  onStartRadio: (station: BuiltRadioStation) => void
  loading?: boolean
}) {
  const [builtStation, setBuiltStation] = useState<BuiltRadioStation | null>(null)

  const seed = useMemo(
    () =>
      resolveRadioSeed({
        catalog: songs,
        browseSongs,
        selectedLaneId,
        selectedLaneLabel,
        selectedSceneId,
        selectedSceneLabel,
      }),
    [
      browseSongs,
      selectedLaneId,
      selectedLaneLabel,
      selectedSceneId,
      selectedSceneLabel,
      songs,
    ],
  )

  useEffect(() => {
    setBuiltStation(null)
  }, [seed?.id, seed?.type])

  const handleBuildStation = useCallback(() => {
    if (!seed) return
    setBuiltStation(buildRadioStation(songs, seed))
  }, [seed, songs])

  if (!loading && songs.length < 2) return null

  return (
    <section
      className="discovery-section radio-foundation-section"
      aria-labelledby="radio-foundation-heading"
    >
      <div className="section-header radio-foundation-header">
        <div>
          <p className="page-eyebrow radio-foundation-eyebrow">Radio foundation</p>
          <h2 id="radio-foundation-heading">Build a station</h2>
          <span className="section-hint">
            Preview a scored station from your catalog — start radio only when you choose
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm radio-build-btn"
          onClick={handleBuildStation}
          disabled={!seed || loading}
        >
          Build station
        </button>
      </div>

      {seed ? (
        <p className="radio-seed-line">{describeRadioSeed(seed)}</p>
      ) : (
        <p className="radio-seed-line radio-seed-line--muted">
          Select a lane or scene, or browse songs to choose a seed.
        </p>
      )}

      {builtStation ? (
        <div className="radio-station-card">
          <div className="radio-station-copy">
            <h3>{builtStation.title}</h3>
            <p>{builtStation.subtitle}</p>
            <span className="radio-station-meta">
              {builtStation.trackCount} tracks in this station preview
            </span>
          </div>
          <ol className="radio-station-preview">
            {builtStation.tracks.slice(0, 6).map((track, index) => (
              <li className="radio-station-track" key={`${track.id}-${index}`}>
                <span className="radio-station-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="radio-station-track-title">{track.title}</span>
                <span className="radio-station-track-artist">{track.artist}</span>
              </li>
            ))}
          </ol>
          {builtStation.trackCount > 6 ? (
            <p className="radio-station-more">
              +{builtStation.trackCount - 6} more in station order
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary btn-sm radio-start-btn"
            onClick={() => onStartRadio(builtStation)}
          >
            Start radio
          </button>
        </div>
      ) : null}
    </section>
  )
}


const Sidebar = memo(function Sidebar({
  activeNavKey,
  onNavigateNav,
}: {
  activeNavKey: NavKey
  onNavigateNav: (navKey: NavKey) => void
}) {
  return (
    <aside className="sidebar sidebar--psd">
      <div className="sidebar-brand">
        <BrandWaveformMark />
        <div className="brand-text">
          <span className="brand-wordmark">Hidden Tunes</span>
          <span className="brand-tagline">Feel Every Sound</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {SIDEBAR_NAV_GROUPS.map((group) => (
          <div className="sidebar-nav-group" key={group.label}>
            <span className="sidebar-nav-group-label">{group.label}</span>
            {group.items.map((item) => {
              const isActive = isSidebarNavActive(item, activeNavKey)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item${isActive ? ' active' : ''}${item.disabled ? ' is-disabled' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={item.disabled ? true : undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled && item.navKey) {
                      onNavigateNav(item.navKey)
                    }
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-premium-cta${activeNavKey === 'premium' ? ' is-active' : ''}`}
          aria-label="Go Premium"
          aria-current={activeNavKey === 'premium' ? 'page' : undefined}
          onClick={() => onNavigateNav('premium')}
        >
          <span className="sidebar-premium-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M5 17l2-7h10l2 7" />
              <path d="M7 17h10" />
              <path d="M9 10l1.5-4h3L15 10" />
            </svg>
          </span>
          <span className="sidebar-premium-copy">
            <span className="sidebar-premium-label">Go Premium</span>
            <span className="sidebar-premium-hint">Unlock every world</span>
          </span>
        </button>

        <div className="sidebar-user" aria-label="Profile">
          <div className="sidebar-user-avatar" aria-hidden="true">
            <span>H</span>
          </div>
          <div className="sidebar-user-copy">
            <span className="sidebar-user-name">Hidden Listener</span>
            <span className="sidebar-user-badge">
              Local profile
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
})

function Hero({
  onPlay,
  onExploreWorlds,
  canPlay,
}: {
  onPlay: () => void
  onExploreWorlds: () => void
  canPlay: boolean
}) {
  return (
    <section className="hero hero--psd" aria-label="Tonight's listening invitation">
      <img
        className="hero-photo"
        src={getArtworkForHero('home')}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
      />
      <div className="hero-photo-veil" aria-hidden="true" />
      <div className="hero-inner hero-inner--psd">
        <div className="hero-copy hero-copy--psd">
          <h1 className="hero-headline">
            Where do you want to
            <span className="hero-headline-break" />
            <span className="hero-headline-accent">emotionally</span>
            <span className="hero-headline-break" />
            go tonight?
          </h1>
          <div className="hero-actions psd-hero-actions">
            <button
              type="button"
              className="psd-btn psd-btn--gold"
              disabled={!canPlay}
              onClick={onPlay}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
            <button type="button" className="psd-btn psd-btn--ghost" onClick={onExploreWorlds}>
              Explore Worlds
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

const POPULAR_WORLD_PRESENTATION: Record<
  string,
  { title: string; subtitle: string }
> = {
  'midnight-drive': { title: 'Night Drive', subtitle: 'Late-night highway glow' },
  'rainy-window': { title: 'Midnight Reflection', subtitle: 'Rain-lit stillness' },
  'heartbreak-recovery': { title: 'Healing Slowly', subtitle: 'Tender recovery' },
  'sunday-morning': { title: 'Afro Sunset', subtitle: 'Warm evening light' },
  'city-lights': { title: 'Ocean Dreams', subtitle: 'Deep blue drift' },
  'focus-room': { title: 'Focus Room', subtitle: 'Clear headspace' },
}

function resolveWorldPresentation(scene: BuiltListeningScene) {
  const mapped = POPULAR_WORLD_PRESENTATION[scene.id]
  return {
    title: mapped?.title ?? scene.label,
    subtitle: mapped?.subtitle ?? scene.subtitle,
  }
}

/** Reserved listening surfaces — removed from Home in 44F; kept for Worlds phases. */
const HOME_LEGACY_SECTIONS = {
  EmotionalLanesSection,
  SceneListeningSection,
  RadioFoundationSection,
} as const
void HOME_LEGACY_SECTIONS

function PopularWorldsSection({
  songs,
  loading = false,
  onPlayWorld,
  onBrowseWorlds,
}: {
  songs: ApiSong[]
  loading?: boolean
  onPlayWorld: (scene: BuiltListeningScene) => void
  onBrowseWorlds?: () => void
}) {
  const { artworkContext } = useCatalog()
  const worlds = useMemo(
    () => buildListeningScenes(songs, { minTracks: 0 }).slice(0, 5),
    [songs],
  )
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])

  if (!loading && worlds.length === 0) return null

  return (
    <section className="popular-worlds-section" aria-labelledby="popular-worlds-heading">
      <header className="popular-worlds-header">
        <h2 id="popular-worlds-heading" className="popular-worlds-eyebrow">
          Popular Worlds
        </h2>
      </header>
      {loading ? (
        <div className="popular-worlds-grid popular-worlds-grid--loading" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="world-card world-card--skeleton">
              <div className="world-card-art" />
              <div className="world-card-line" />
            </div>
          ))}
        </div>
      ) : (
        <div className="popular-worlds-grid" role="list" aria-label="Popular worlds">
          {worlds.map((world, worldIndex) => {
            const presentation = resolveWorldPresentation(world)
            const worldTracks = world.songIds
              .map((songId) => songsById.get(songId))
              .filter((entry): entry is ApiSong => Boolean(entry))
            const worldArt = getArtworkForWorld(
              { id: world.id, title: presentation.title, sceneId: world.id },
              songs,
              artworkContext,
            )
            const worldCollage = getArtworkForPlaylistCollage(worldTracks, artworkContext)
            const sceneId = world.visualSceneId ?? resolveVisualScene({
              seed: world.label,
              mood: world.mood,
            })

            return (
              <article
                key={world.id}
                role="listitem"
                className="world-card"
                data-scene={sceneId}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="world-card-select"
                  onClick={() => onBrowseWorlds?.()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onBrowseWorlds?.()
                    }
                  }}
                >
                  <div className="world-card-art">
                    {worldArt ? (
                      <ArtworkImage
                        src={worldArt}
                        alt=""
                        seed={world.id}
                        label={presentation.title}
                        priority={worldIndex < 2}
                      />
                    ) : worldCollage.length > 1 ? (
                      <ArtworkCollage
                        urls={worldCollage}
                        seed={world.id}
                        label={presentation.title}
                      />
                    ) : (
                      <ArtworkImage
                        src={worldCollage[0] ?? null}
                        alt=""
                        seed={world.id}
                        label={presentation.title}
                        priority={worldIndex < 2}
                      />
                    )}
                    <span className="world-card-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="world-play-btn"
                      aria-label={`Play ${presentation.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPlayWorld(world)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="world-card-copy">
                    <h3>{presentation.title}</h3>
                    <p>{presentation.subtitle}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function HomePage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  onBrowseSearch,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
  onBrowseSearch: (query: string) => void
}) {
  const {
    songs,
    albums,
    artists,
    artistNames,
    indexes,
    showCatalogSkeleton,
    showCatalogError,
    error,
    retry,
  } = useCatalog()

  return (
    <div className="home-destination">
      <PageFrame cinematic>
        <MusicHomePage
          songs={songs}
          albums={albums}
          artists={artists}
          artistNames={artistNames}
          indexes={indexes}
          showCatalogSkeleton={showCatalogSkeleton}
          showCatalogError={showCatalogError}
          error={error}
          retry={retry}
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          onBrowseSearch={onBrowseSearch}
        />
      </PageFrame>
    </div>
  )
}

void Hero
void PopularWorldsSection
void CatalogSection

const SEARCH_SONG_PREVIEW_LIMIT = 5
const SEARCH_SONG_EXPANDED_LIMIT = 24
const SEARCH_ARTIST_PREVIEW_LIMIT = 4
const SEARCH_ARTIST_EXPANDED_LIMIT = 16
const SEARCH_ALBUM_PREVIEW_LIMIT = 4
const SEARCH_ALBUM_EXPANDED_LIMIT = 16

function formatSongDurationLabel(
  song: { durationSeconds: number | null } | null | undefined,
) {
  if (!song?.durationSeconds || song.durationSeconds <= 0) return '—'
  const total = Math.floor(song.durationSeconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function resolveSearchSongBadges(
  song: {
    audioVersions?: ApiSong['audioVersions']
    highQualityUrl?: string | null
    losslessUrl?: string | null
  } | null | undefined,
): string[] {
  if (!song) return ['SONG']
  const badges: string[] = ['SONG']
  if (song.audioVersions?.lossless?.url || song.losslessUrl) {
    badges.push('FLAC')
  } else if (song.audioVersions?.highQuality?.url || song.highQualityUrl) {
    badges.push('HQ')
  }
  return badges
}

function resolveSearchRowQualityBadge(
  song: {
    audioVersions?: ApiSong['audioVersions']
    highQualityUrl?: string | null
    losslessUrl?: string | null
  } | null | undefined,
) {
  const badges = resolveSearchSongBadges(song)
  return badges.find((badge) => badge !== 'SONG') ?? 'SONG'
}

function formatAlbumSearchMeta(
  album: ApiAlbum,
  artistNames: Map<string, string>,
) {
  const artistName = album.artistId ? artistNames.get(album.artistId) ?? 'Unknown artist' : 'Unknown artist'
  const year = album.releaseYear ? String(album.releaseYear) : null
  return year ? `${artistName} • ${year}` : artistName
}

function DiscoverPage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  query: externalQuery,
  setQuery: externalSetQuery,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
  query?: string
  setQuery?: (value: string) => void
}) {
  const {
    artists,
    albums,
    artistNames,
    indexes,
    searchMetadataIndex,
    showCatalogSkeleton,
    showCatalogError,
    error,
    retry,
  } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [internalQuery, setInternalQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    '',
    parseStoredSearchTerm,
  )
  const query = externalQuery ?? internalQuery
  const setQuery = externalSetQuery ?? setInternalQuery
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isSearchPending = query !== debouncedQuery
  const [sort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSort,
    'latest' as SongSort,
    parseStoredSongSort,
  )

  const searchResult = useMemo(
    () =>
      searchCatalogSongs({
        index: searchMetadataIndex,
        query: debouncedQuery,
      }),
    [debouncedQuery, searchMetadataIndex],
  )

  const visibleRecords = useMemo(
    () => sortMetadataRecords(searchResult.records, sort),
    [searchResult.records, sort],
  )

  const visibleSongs = useMemo(
    () => metadataRecordsToApiSongs(visibleRecords),
    [visibleRecords],
  )

  const trimmedQuery = debouncedQuery.trim()
  const hasEvaluatedQuery = trimmedQuery.length > 0
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playDiscoverSong = useCallback(
    (song: ApiSong, index: number) => {
      const record =
        visibleRecords.find((entry) => entry.id === song.id)
        ?? visibleRecords[index]
      const playableSong = record ? metadataRecordToApiSong(record) : song
      const queueSongs = visibleSongs
      const queueIndex = queueSongs.findIndex((entry) => entry.id === playableSong.id)
      const safeIndex = queueIndex >= 0 ? queueIndex : index

      onOpenSong(
        playableSong,
        queueSongs,
        safeIndex,
        'discover',
        trimmedQuery ? `Search · ${trimmedQuery}` : 'Search',
        {
          seedType: 'discover',
          seedTracks: buildQueueSeedPool('discover', queueSongs, indexes, playableSong),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, trimmedQuery, visibleRecords, visibleSongs],
  )

  const [searchTab, setSearchTab] = useState<'all' | 'songs' | 'artists' | 'albums'>('all')

  const matchedArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, debouncedQuery), 'az'),
    [artists, debouncedQuery],
  )
  const matchedAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, debouncedQuery, artistNames), 'latest'),
    [albums, artistNames, debouncedQuery],
  )

  const topResult = visibleSongs[0] ?? null
  const topResultRecord = visibleRecords[0] ?? null

  const songLimit = searchTab === 'songs'
    ? SEARCH_SONG_EXPANDED_LIMIT
    : SEARCH_SONG_PREVIEW_LIMIT
  const artistLimit = searchTab === 'artists'
    ? SEARCH_ARTIST_EXPANDED_LIMIT
    : SEARCH_ARTIST_PREVIEW_LIMIT
  const albumLimit = searchTab === 'albums'
    ? SEARCH_ALBUM_EXPANDED_LIMIT
    : SEARCH_ALBUM_PREVIEW_LIMIT

  const songRows = useMemo(
    () => visibleSongs.slice(0, songLimit),
    [songLimit, visibleSongs],
  )
  const artistRows = useMemo(
    () => matchedArtists.slice(0, artistLimit),
    [artistLimit, matchedArtists],
  )
  const albumRows = useMemo(
    () => matchedAlbums.slice(0, albumLimit),
    [albumLimit, matchedAlbums],
  )

  const searchTabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
  ] as const

  const showMainResults = searchTab === 'all' || searchTab === 'songs'
  const showArtistPanel = searchTab === 'all' || searchTab === 'artists'
  const showAlbumPanel = searchTab === 'all' || searchTab === 'albums'

  const showNoMatches =
    !isSearchPending &&
    !showCatalogSkeleton &&
    !showCatalogError &&
    hasEvaluatedQuery &&
    visibleSongs.length === 0 &&
    matchedArtists.length === 0 &&
    matchedAlbums.length === 0

  const isSongActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  void onNavigateNav
  void setQuery

  return (
    <div className="psd-search-destination">
      <PageFrame cinematic>
        <header className="psd-search-page-header" aria-labelledby="search-results-heading">
          <h1 id="search-results-heading" className="psd-search-page-title">
            Search Results
          </h1>
          <p className="psd-search-page-subtitle">
            {trimmedQuery ? (
              <>
                Showing results for <strong>&ldquo;{trimmedQuery}&rdquo;</strong>
              </>
            ) : (
              <>Browsing your catalog</>
            )}
          </p>
        </header>

        <div className="psd-search-tab-row" role="tablist" aria-label="Search categories">
          {searchTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`psd-search-tab${searchTab === tab.id ? ' is-active' : ''}`}
              aria-selected={searchTab === tab.id}
              onClick={() => setSearchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showCatalogSkeleton ? (
          <CatalogSkeleton count={8} variant="card" />
        ) : showCatalogError ? (
          <CatalogError message={error || ''} onRetry={retry} />
        ) : showNoMatches ? (
          <CatalogEmpty
            title="No matches found"
            detail={`Nothing in your catalog matched "${trimmedQuery}". Try another search term.`}
          />
        ) : (
          <>
            {showMainResults && topResult ? (
              <section className="psd-search-top-result" aria-label="Top result">
                <span className="psd-search-top-result-label">Top Result</span>
                <div className="psd-search-top-result-card">
                  <button
                    type="button"
                    className="psd-search-top-result-art-btn"
                    aria-label={`Play ${topResult.title}`}
                    onClick={() => playDiscoverSong(topResult, 0)}
                  >
                    <div className="psd-search-top-result-art">
                      <ArtworkImage
                        src={topResult.artwork ?? null}
                        alt=""
                        seed={topResult.id}
                        label={topResult.title}
                        priority
                      />
                      <span className="psd-search-top-result-play" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </div>
                  </button>

                  <div className="psd-search-top-result-meta">
                    <h2>{topResult.title}</h2>
                    <p className="psd-search-top-result-artist">{topResult.artist}</p>
                    <div className="psd-search-top-result-badges">
                      {resolveSearchSongBadges(topResultRecord ?? topResult).map((badge) => (
                        <span key={badge} className="psd-search-quality-badge">{badge}</span>
                      ))}
                    </div>
                  </div>

                  <div className="psd-search-top-result-wave">
                    <PsdWaveformStrip className="psd-search-top-result-waveform" />
                    <span className="psd-search-top-result-duration">
                      {formatSongDurationLabel(topResult)}
                    </span>
                  </div>
                </div>
              </section>
            ) : null}

            {showMainResults && songRows.length > 0 ? (
              <section className="psd-search-songs-panel" aria-labelledby="search-songs-heading">
                <header className="psd-search-section-header">
                  <h2 id="search-songs-heading">Songs</h2>
                  {searchTab === 'all' && visibleSongs.length > SEARCH_SONG_PREVIEW_LIMIT ? (
                    <button
                      type="button"
                      className="psd-search-view-all"
                      onClick={() => setSearchTab('songs')}
                    >
                      View all
                    </button>
                  ) : null}
                </header>

                <div className="psd-search-songs-card">
                  {songRows.map((song, index) => {
                    const active = isSongActive(song.id)
                    return (
                      <button
                        key={song.id}
                        type="button"
                        className={`psd-search-song-row${active ? ' is-active' : ''}`}
                        onClick={() => playDiscoverSong(song, index)}
                      >
                        <span className="psd-search-song-leading" aria-hidden="true">
                          {active ? <PsdIconEqualizer className="psd-search-equalizer" /> : null}
                        </span>
                        <span className="psd-search-song-thumb">
                          <ArtworkImage
                            src={song.artwork ?? null}
                            alt=""
                            seed={song.id}
                            label={song.title}
                          />
                        </span>
                        <span className="psd-search-song-copy">
                          <strong>{song.title}</strong>
                          <span>{song.artist}</span>
                        </span>
                        <span className="psd-search-quality-badge psd-search-quality-badge--row">
                          {resolveSearchRowQualityBadge(song)}
                        </span>
                        <span className="psd-search-song-duration">
                          {formatSongDurationLabel(song)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {(showArtistPanel && artistRows.length > 0) || (showAlbumPanel && albumRows.length > 0) ? (
              <div className="psd-search-lower-panels">
                {showArtistPanel && artistRows.length > 0 ? (
                  <section className="psd-search-side-panel" aria-labelledby="search-artists-heading">
                    <header className="psd-search-section-header">
                      <h2 id="search-artists-heading">Artists</h2>
                      {searchTab === 'all' && matchedArtists.length > SEARCH_ARTIST_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="psd-search-view-all"
                          onClick={() => setSearchTab('artists')}
                        >
                          View all
                        </button>
                      ) : null}
                    </header>
                    <div className="psd-search-side-card">
                      {artistRows.map((artist) => (
                        <button
                          key={artist.id}
                          type="button"
                          className="psd-search-side-row"
                          onClick={() => onOpenArtist(artist)}
                        >
                          <span className="psd-search-side-avatar">
                            <ArtistAvatar artist={artist} />
                          </span>
                          <span className="psd-search-side-copy">
                            <strong>{artist.name}</strong>
                          </span>
                          <PsdIconChevronRight className="psd-search-side-chevron" />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {showAlbumPanel && albumRows.length > 0 ? (
                  <section className="psd-search-side-panel" aria-labelledby="search-albums-heading">
                    <header className="psd-search-section-header">
                      <h2 id="search-albums-heading">Albums</h2>
                      {searchTab === 'all' && matchedAlbums.length > SEARCH_ALBUM_PREVIEW_LIMIT ? (
                        <button
                          type="button"
                          className="psd-search-view-all"
                          onClick={() => setSearchTab('albums')}
                        >
                          View all
                        </button>
                      ) : null}
                    </header>
                    <div className="psd-search-side-card">
                      {albumRows.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          className="psd-search-side-row"
                          onClick={() => onOpenAlbum(album)}
                        >
                          <span className="psd-search-side-art">
                            <ArtworkImage
                              src={album.artwork ?? null}
                              alt=""
                              seed={album.id}
                              label={album.title}
                            />
                          </span>
                          <span className="psd-search-side-copy">
                            <strong>{album.title}</strong>
                            <span>{formatAlbumSearchMeta(album, artistNames)}</span>
                          </span>
                          <PsdIconChevronRight className="psd-search-side-chevron" />
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </PageFrame>
    </div>
  )
}



type EmotionalWorldChipId =
  | 'all'
  | 'calm'
  | 'chill'
  | 'happy'
  | 'romantic'
  | 'motivational'
  | 'melancholy'
  | 'energetic'

type EmotionalWorldCardSpec = {
  cardId: string
  sceneId: string
  title: string
  tags: string
  chips: EmotionalWorldChipId[]
}

const EMOTIONAL_WORLDS_CHIPS: { id: EmotionalWorldChipId; label: string }[] = [
  { id: 'all', label: 'All Worlds' },
  { id: 'calm', label: 'Calm' },
  { id: 'chill', label: 'Chill' },
  { id: 'happy', label: 'Happy' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'motivational', label: 'Motivational' },
  { id: 'melancholy', label: 'Melancholy' },
  { id: 'energetic', label: 'Energetic' },
]

const EMOTIONAL_WORLDS_CARDS: EmotionalWorldCardSpec[] = [
  {
    cardId: 'ew-midnight-reflection',
    sceneId: 'rainy-window',
    title: 'Midnight Reflection',
    tags: 'Deep • Calm • Soul',
    chips: ['calm', 'chill', 'melancholy'],
  },
  {
    cardId: 'ew-afro-sunset',
    sceneId: 'sunday-morning',
    title: 'Afro Sunset',
    tags: 'Warm • Groove • Soul',
    chips: ['happy', 'romantic'],
  },
  {
    cardId: 'ew-healing-slowly',
    sceneId: 'heartbreak-recovery',
    title: 'Healing Slowly',
    tags: 'Soft • Reflective • Calm',
    chips: ['calm', 'melancholy'],
  },
  {
    cardId: 'ew-night-drive',
    sceneId: 'midnight-drive',
    title: 'Night Drive',
    tags: 'Urban • Late Night • Electronic',
    chips: ['energetic', 'chill'],
  },
  {
    cardId: 'ew-sunset-glow',
    sceneId: 'city-lights',
    title: 'Sunset Glow',
    tags: 'Golden • Warm • R&B',
    chips: ['happy', 'romantic'],
  },
  {
    cardId: 'ew-velvet-emotions',
    sceneId: 'focus-room',
    title: 'Velvet Emotions',
    tags: 'Intimate • Warm • Soul',
    chips: ['romantic', 'calm'],
  },
  {
    cardId: 'ew-ocean-dreams',
    sceneId: 'city-lights',
    title: 'Ocean Dreams',
    tags: 'Dreamy • Deep • Calm',
    chips: ['calm', 'chill'],
  },
  {
    cardId: 'ew-city-rain',
    sceneId: 'rainy-window',
    title: 'City Rain',
    tags: 'Melancholy • Urban • Jazz',
    chips: ['melancholy', 'chill'],
  },
  {
    cardId: 'ew-uplift-boost',
    sceneId: 'focus-room',
    title: 'Uplift Boost',
    tags: 'Motivational • Bright • Pop',
    chips: ['motivational', 'energetic', 'happy'],
  },
  {
    cardId: 'ew-melancholy-bloom',
    sceneId: 'heartbreak-recovery',
    title: 'Melancholy Bloom',
    tags: 'Tender • Slow • Reflective',
    chips: ['melancholy', 'calm'],
  },
]

function EmotionalWorldsPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes, showCatalogSkeleton } = useCatalog()
  const { setActiveAtmosphereId } = useAtmosphere()
  const [selectedChip, setSelectedChip] = useState<EmotionalWorldChipId>('all')
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playableCards = useMemo(
    () => EMOTIONAL_WORLDS_CARDS.filter(
      (card) => filterSongsByListeningScene(songs, card.sceneId).length > 0,
    ),
    [songs],
  )

  const visibleCards = useMemo(() => {
    const pool = showCatalogSkeleton ? EMOTIONAL_WORLDS_CARDS : playableCards
    if (selectedChip === 'all') return pool
    return pool.filter((card) => card.chips.includes(selectedChip))
  }, [playableCards, selectedChip, showCatalogSkeleton])

  const activeChips = useMemo(() => {
    if (showCatalogSkeleton) return EMOTIONAL_WORLDS_CHIPS
    return EMOTIONAL_WORLDS_CHIPS.filter((chip) => {
      if (chip.id === 'all') return playableCards.length > 0
      return playableCards.some((card) => card.chips.includes(chip.id))
    })
  }, [playableCards, showCatalogSkeleton])

  const listeningScenesById = useMemo(() => {
    const scenes = getListeningScenesForCatalog(songs)
    return new Map(scenes.map((scene) => [scene.id, scene]))
  }, [songs])

  const playWorld = useCallback(
    (card: EmotionalWorldCardSpec) => {
      const tracks = filterSongsByListeningScene(songs, card.sceneId)
      if (tracks.length === 0) return
      const atmosphere = resolveAtmosphereForWorld({
        cardId: card.cardId,
        sceneId: card.sceneId,
        title: card.title,
      })
      setActiveAtmosphereId(atmosphere.id)
      onOpenSong(
        tracks[0],
        tracks,
        0,
        'mood',
        card.title,
        {
          seedType: 'mood',
          seedTracks: buildQueueSeedPool('mood', tracks, indexes, tracks[0]),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, setActiveAtmosphereId, songs],
  )

  const playHero = useCallback(() => {
    const card = visibleCards.find(
      (entry) => filterSongsByListeningScene(songs, entry.sceneId).length > 0,
    ) ?? playableCards[0]
    if (!card) return
    playWorld(card)
  }, [playWorld, playableCards, songs, visibleCards])

  const heroWorldArt = useMemo(() => getArtworkForHero('emotional-worlds'), [])
  const canPlayHero = playableCards.length > 0

  return (
    <div className="emotional-worlds-destination">
      <PageFrame cinematic>
        <section className="emotional-worlds-hero" aria-labelledby="emotional-worlds-heading">
          <EntityAtmosphereBackdrop
            className="emotional-worlds-hero-backdrop"
            artworkUrl={heroWorldArt}
            label="Emotional Worlds"
            variant="hero"
          />
          <div className="emotional-worlds-hero-veil" aria-hidden="true" />
          <div className="emotional-worlds-hero-copy">
            <h1 id="emotional-worlds-heading" className="emotional-worlds-title">
              <span className="emotional-worlds-title-main">
                <span className="emotional-worlds-title-emotional">Emotional</span>
                {' '}Worlds
              </span>
            </h1>
            <p className="emotional-worlds-description">
              Music that matches your emotion, elevates your mood, and transports you to another world.
            </p>
            <div className="emotional-worlds-hero-actions psd-hero-actions">
              <button
                type="button"
                className="psd-btn psd-btn--gold"
                disabled={!canPlayHero}
                onClick={playHero}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start Listening
              </button>
            </div>
          </div>
        </section>

        {activeChips.length > 0 ? (
          <div className="emotional-worlds-chips" role="toolbar" aria-label="World categories">
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`emotional-worlds-chip${selectedChip === chip.id ? ' is-active' : ''}`}
                aria-pressed={selectedChip === chip.id}
                onClick={() => setSelectedChip(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        {showCatalogSkeleton ? (
          <div className="emotional-worlds-grid emotional-worlds-grid--loading" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="emotional-world-card emotional-world-card--skeleton">
                <div className="emotional-world-card-art" />
                <div className="emotional-world-card-line" />
              </div>
            ))}
          </div>
        ) : visibleCards.length === 0 ? (
          <CatalogEmpty
            title="No worlds match"
            detail="Try another mood filter or wait for more catalog songs to load."
          />
        ) : (
          <div className="emotional-worlds-grid" role="list" aria-label="Emotional worlds">
            {visibleCards.map((card) => {
              const tracks = filterSongsByListeningScene(songs, card.sceneId)
              const worldArt = getArtworkForWorld({
                id: card.cardId,
                title: card.title,
                sceneId: card.sceneId,
              })
              const scene = listeningScenesById.get(card.sceneId)
              const visualSceneId = scene?.visualSceneId ?? resolveVisualScene({
                seed: card.title,
                mood: scene?.mood ?? 'violet',
              })

              return (
                <article
                  key={card.cardId}
                  role="listitem"
                  className="emotional-world-card"
                  data-scene={visualSceneId}
                >
                  <div className="emotional-world-card-art">
                    <ArtworkImage
                      src={worldArt}
                      alt=""
                      seed={card.cardId}
                      label={card.title}
                    />
                    <span className="emotional-world-card-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="emotional-world-play-btn"
                      aria-label={`Play ${card.title}`}
                      onClick={() => playWorld(card)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="emotional-world-card-select"
                    onClick={() => playWorld(card)}
                  >
                    <div className="emotional-world-card-copy">
                      <h3>{card.title}</h3>
                      <p className="emotional-world-card-tags">{card.tags}</p>
                      <p className="emotional-world-card-count">
                        {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </PageFrame>
    </div>
  )
}


function buildLibraryStats({
  songCount,
  albumCount,
  artistCount,
  playlistCount,
}: {
  songCount: number
  albumCount: number
  artistCount: number
  playlistCount: number
}) {
  return [
    {
      key: 'songs',
      label: 'Songs',
      value: formatLibraryCount(songCount),
      hint: 'All Songs',
      tone: 'violet',
      tab: 'Songs' as LibraryTabId,
    },
    {
      key: 'albums',
      label: 'Albums',
      value: formatLibraryCount(albumCount),
      hint: 'In Collection',
      tone: 'purple',
      nav: 'albums' as NavKey,
    },
    {
      key: 'artists',
      label: 'Artists',
      value: formatLibraryCount(artistCount),
      hint: 'In Catalog',
      tone: 'orange',
      nav: 'artists' as NavKey,
    },
    {
      key: 'playlists',
      label: 'Playlists',
      value: formatLibraryCount(playlistCount),
      hint: 'Curated',
      tone: 'pink',
      tab: 'Playlists' as LibraryTabId,
    },
  ]
}

function PsdLibraryStatIcon({ type }: { type: string }) {
  if (type === 'songs') return <MusicNoteIcon className="psd-library-stat-svg" />
  if (type === 'albums') {
    return (
      <svg className="psd-library-stat-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <circle cx="12" cy="12" r="3" fill="rgba(5,5,9,0.42)" />
      </svg>
    )
  }
  if (type === 'artists') {
    return (
      <svg className="psd-library-stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M12 4v10" />
        <path d="M8.5 9.5A3.5 3.5 0 1012 13" />
        <path d="M15.5 9.5A3.5 3.5 0 1112 13" />
      </svg>
    )
  }
  if (type === 'playlists') {
    return (
      <svg className="psd-library-stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M4 7h10M4 12h8M4 17h5" />
        <circle cx="17" cy="17" r="3" fill="currentColor" stroke="none" />
        <path d="M17 7v10" />
      </svg>
    )
  }
  return <PsdIconHeart className="psd-library-stat-svg" />
}

function LibraryPage({
  onOpenSong,
  onOpenArtist,
  onOpenAlbum,
  onNavigateNav,
  query = '',
  setPlaylistsQuery,
}: {
  onOpenSong: QueueSongHandler
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onNavigateNav: (navKey: NavKey) => void
  query?: string
  setPlaylistsQuery?: (value: string) => void
}) {
  const { songs, albums, artists, artistNames, indexes, artworkContext } = useCatalog()
  const [tab, setTab] = useState<LibraryTabId>('Overview')
  const recentRowRef = useRef<HTMLDivElement>(null)

  const filteredSongs = useMemo(
    () => sortSongsList(filterSongsByLibraryQuery(songs, query), 'latest'),
    [query, songs],
  )
  const filteredAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, query, artistNames), 'latest'),
    [albums, artistNames, query],
  )
  const filteredArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, query), 'az'),
    [artists, query],
  )

  const recentCards = useMemo(
    () => filteredSongs.slice(0, LIBRARY_RECENT_PREVIEW),
    [filteredSongs],
  )
  const songTabCards = useMemo(
    () => filteredSongs.slice(0, LIBRARY_TAB_LIMIT),
    [filteredSongs],
  )
  const albumTabCards = useMemo(
    () => filteredAlbums.slice(0, LIBRARY_TAB_LIMIT),
    [filteredAlbums],
  )
  const artistTabCards = useMemo(
    () => filteredArtists.slice(0, LIBRARY_TAB_LIMIT),
    [filteredArtists],
  )

  const playlistCards = useMemo(
    () => LIBRARY_CURATED_PLAYLISTS.map((playlist, index) => {
      const sliceStart = index * 4
      const playlistSongs = filteredSongs.slice(sliceStart, sliceStart + 12)
      const coverArt = getArtworkForPlaylist(
        { title: playlist.title, songs: playlistSongs },
        artworkContext,
      )
      return {
        ...playlist,
        songCount: playlistSongs.length,
        countLabel: `${playlistSongs.length} ${playlistSongs.length === 1 ? 'song' : 'songs'}`,
        collage: getArtworkForPlaylistCollage(playlistSongs, artworkContext),
        coverArt,
      }
    }),
    [artworkContext, filteredSongs],
  )

  const libraryStats = useMemo(
    () => buildLibraryStats({
      songCount: songs.length,
      albumCount: albums.length,
      artistCount: artists.length,
      playlistCount: LIBRARY_CURATED_PLAYLISTS.length,
    }),
    [albums.length, artists.length, songs.length],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playLibrarySong = useCallback(
    (song: ApiSong, queue: ApiSong[], queueTitle: string) => {
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue.length > 0 ? queue : [song], queueIndex, 'manual', queueTitle, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools],
  )

  const playRecentSong = useCallback(
    (song: ApiSong) => {
      playLibrarySong(song, filteredSongs, 'Recently Added')
    },
    [filteredSongs, playLibrarySong],
  )

  const openPlaylist = useCallback(
    (title: string) => {
      setPlaylistsQuery?.(title)
      onNavigateNav('playlists')
    },
    [onNavigateNav, setPlaylistsQuery],
  )

  const scrollRecentRow = useCallback((direction: 'prev' | 'next') => {
    const node = recentRowRef.current
    if (!node) return
    const amount = Math.max(220, node.clientWidth * 0.82)
    node.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: 'smooth',
    })
  }, [])

  const showSongs = tab === 'Overview' || tab === 'Songs'
  const showAlbums = tab === 'Overview' || tab === 'Albums'
  const showArtists = tab === 'Overview' || tab === 'Artists'
  const showPlaylists = tab === 'Overview' || tab === 'Playlists'
  const showStats = tab === 'Overview'
  const hasVisibleContent =
    filteredSongs.length > 0
    || filteredAlbums.length > 0
    || filteredArtists.length > 0
    || playlistCards.some((playlist) => playlist.songCount > 0)

  return (
    <div className="psd-library-destination">
      <PageFrame cinematic>
        <header className="psd-library-header" aria-labelledby="library-heading">
          <h1 id="library-heading" className="psd-library-title">My Library</h1>
          <p className="psd-library-subtitle">All your music, in one place.</p>
        </header>

        <div className="psd-library-toolbar">
          <div className="psd-library-tabs" role="tablist" aria-label="Library sections">
            {LIBRARY_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                className={`psd-library-tab${tab === entry ? ' is-active' : ''}`}
                aria-selected={tab === entry}
                onClick={() => setTab(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        {showStats ? (
          <section className="psd-library-stats" aria-label="Library statistics">
            {libraryStats.map((card) => (
              <button
                key={card.key}
                type="button"
                className="psd-library-stat-card"
                data-tone={card.tone}
                onClick={() => {
                  if ('nav' in card && card.nav) {
                    onNavigateNav(card.nav)
                    return
                  }
                  if ('tab' in card && card.tab) {
                    setTab(card.tab)
                  }
                }}
              >
                <span className="psd-library-stat-icon" aria-hidden="true">
                  <PsdLibraryStatIcon type={card.key} />
                </span>
                <span className="psd-library-stat-copy">
                  <span className="psd-library-stat-label">{card.label}</span>
                  <strong className="psd-library-stat-value">{card.value}</strong>
                  <span className="psd-library-stat-hint">{card.hint}</span>
                </span>
              </button>
            ))}
          </section>
        ) : null}

        {!hasVisibleContent ? (
          <CatalogEmpty
            title={query.trim() ? 'No library matches' : 'Your library is empty'}
            detail={
              query.trim()
                ? `Nothing in your catalog matched "${query.trim()}".`
                : 'Songs will appear here once your catalog loads.'
            }
          />
        ) : null}

        {showSongs && (tab === 'Songs' ? songTabCards : recentCards).length > 0 ? (
          <section className="psd-library-section" aria-labelledby="recently-added-heading">
            <header className="psd-library-section-header">
              <h2 id="recently-added-heading">
                {tab === 'Songs' ? 'Songs' : 'Recently Added'}
              </h2>
              {tab === 'Overview' && filteredSongs.length > LIBRARY_RECENT_PREVIEW ? (
                <div className="psd-library-section-actions">
                  <button
                    type="button"
                    className="psd-library-view-all"
                    onClick={() => setTab('Songs')}
                  >
                    View all
                  </button>
                  <button
                    type="button"
                    aria-label="Previous recently added"
                    className="psd-library-round-btn"
                    onClick={() => scrollRecentRow('prev')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Next recently added"
                    className="psd-library-round-btn"
                    onClick={() => scrollRecentRow('next')}
                  >
                    <PsdIconChevronRight />
                  </button>
                </div>
              ) : null}
            </header>
            <div
              ref={tab === 'Overview' ? recentRowRef : undefined}
              className={`psd-library-card-row${tab === 'Overview' ? ' psd-library-card-row--scroll' : ''}`}
            >
              {(tab === 'Songs' ? songTabCards : recentCards).map((song, index) => (
                <article
                  key={song.id}
                  className="psd-library-cover-card"
                  data-tone={LIBRARY_CARD_TONES[index % LIBRARY_CARD_TONES.length]}
                >
                  <div className="psd-library-cover-art">
                    <ArtworkImage src={song.artwork} alt="" seed={song.id} label={song.title} />
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="psd-library-play-btn"
                      aria-label={`Play ${song.title}`}
                      onClick={() => playRecentSong(song)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {showAlbums && tab === 'Albums' && albumTabCards.length > 0 ? (
          <section className="psd-library-section" aria-labelledby="library-albums-heading">
            <header className="psd-library-section-header">
              <h2 id="library-albums-heading">Albums</h2>
              {filteredAlbums.length > LIBRARY_TAB_LIMIT ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => onNavigateNav('albums')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row">
              {albumTabCards.map((album, index) => (
                <button
                  key={album.id}
                  type="button"
                  className="psd-library-cover-card"
                  data-tone={LIBRARY_CARD_TONES[index % LIBRARY_CARD_TONES.length]}
                  onClick={() => onOpenAlbum(album)}
                >
                  <div className="psd-library-cover-art">
                    <ArtworkImage
                      src={album.artwork}
                      alt=""
                      seed={album.id}
                      label={album.title}
                    />
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{album.title}</strong>
                    <span>{formatAlbumSearchMeta(album, artistNames)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showArtists && tab === 'Artists' && artistTabCards.length > 0 ? (
          <section className="psd-library-section" aria-labelledby="library-artists-heading">
            <header className="psd-library-section-header">
              <h2 id="library-artists-heading">Artists</h2>
              {filteredArtists.length > LIBRARY_TAB_LIMIT ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => onNavigateNav('artists')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row psd-library-card-row--artists">
              {artistTabCards.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  className="psd-library-cover-card psd-library-cover-card--artist"
                  onClick={() => onOpenArtist(artist)}
                >
                  <div className="psd-library-cover-art psd-library-cover-art--artist">
                    <ArtistAvatar artist={artist} />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{artist.name}</strong>
                    <span>{artist.songCount} {artist.songCount === 1 ? 'song' : 'songs'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showPlaylists && playlistCards.some((playlist) => playlist.songCount > 0) ? (
          <section className="psd-library-section psd-library-section--playlists" aria-labelledby="your-playlists-heading">
            <header className="psd-library-section-header">
              <h2 id="your-playlists-heading">Your Playlists</h2>
              {tab === 'Overview' ? (
                <button
                  type="button"
                  className="psd-library-view-all"
                  onClick={() => setTab('Playlists')}
                >
                  View all
                </button>
              ) : null}
            </header>
            <div className="psd-library-card-row">
              {playlistCards.filter((playlist) => playlist.songCount > 0).map((playlist) => (
                <button
                  key={playlist.title}
                  type="button"
                  className="psd-library-cover-card psd-library-cover-card--playlist"
                  data-tone={playlist.tone}
                  onClick={() => openPlaylist(playlist.title)}
                >
                  <div className="psd-library-cover-art">
                    {playlist.coverArt ? (
                      <ArtworkImage
                        src={playlist.coverArt}
                        alt=""
                        seed={playlist.title}
                        label={playlist.title}
                      />
                    ) : (
                      <ArtworkCollage
                        urls={playlist.collage}
                        seed={playlist.title}
                        label={playlist.title}
                      />
                    )}
                    <span className="psd-library-cover-veil" aria-hidden="true" />
                  </div>
                  <div className="psd-library-cover-copy">
                    <strong>{playlist.title}</strong>
                    <span>{playlist.countLabel}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}



function ArtistsPage({
  onOpenArtist,
  onOpenAlbum,
  onOpenSong,
}: {
  onOpenArtist: (artist: ApiArtist) => void
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenSong: QueueSongHandler
}) {
  const { artists, indexes } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [tab, setTab] = useState<'overview' | 'songs' | 'albums'>('overview')

  const featuredArtist = useMemo(
    () => artists.find((artist) => artist.name.toLowerCase().includes('wills')) ?? artists[0] ?? null,
    [artists],
  )

  const artistSongs = useMemo(
    () => (
      featuredArtist
        ? sortSongsList(
            resolveSongsForArtist(
              featuredArtist,
              indexes.songsByArtistId,
              indexes.songsByArtistName,
            ),
            'latest',
          )
        : []
    ),
    [featuredArtist, indexes.songsByArtistId, indexes.songsByArtistName],
  )

  const popularSongs = useMemo(() => artistSongs, [artistSongs])

  const artistAlbums = useMemo(
    () => (
      featuredArtist
        ? resolveAlbumsForArtist(featuredArtist, indexes.albumsByArtistId)
        : []
    ),
    [featuredArtist, indexes.albumsByArtistId],
  )

  const primaryGenre = useMemo(
    () => resolveArtistPrimaryGenre(popularSongs),
    [popularSongs],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playArtistSong = useCallback(
    (song: ApiSong, index: number) => {
      if (!featuredArtist || popularSongs.length === 0) return
      onOpenSong(
        song,
        popularSongs,
        index,
        'artist',
        featuredArtist.name,
        {
          seedType: 'artist',
          seedId: featuredArtist.id,
          seedTracks: capSongPool(artistSongs),
          candidatePools: queuePools,
        },
      )
    },
    [artistSongs, featuredArtist, onOpenSong, popularSongs, queuePools],
  )

  const playFeaturedArtist = useCallback(() => {
    const song = popularSongs[0]
    if (!song) return
    playArtistSong(song, 0)
  }, [playArtistSong, popularSongs])

  const artistHeroArt = useMemo(
    () => (featuredArtist ? getArtworkForArtist(featuredArtist) : null),
    [featuredArtist],
  )

  const artistTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
  ] as const

  const visiblePopular = useMemo(() => {
    const limit = tab === 'songs' ? ARTIST_POPULAR_EXPANDED : ARTIST_POPULAR_PREVIEW
    return popularSongs.slice(0, limit)
  }, [popularSongs, tab])

  const visibleAlbums = useMemo(() => {
    const limit = tab === 'albums' ? artistAlbums.length : ARTIST_ALBUM_PREVIEW
    return artistAlbums.slice(0, limit)
  }, [artistAlbums, tab])

  const isSongActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  const showOverview = tab === 'overview'
  const showPopular = tab === 'overview' || tab === 'songs'
  const showAlbums = tab === 'overview' || tab === 'albums'
  const showBrowseGrid = tab === 'overview' && artists.length > 1

  return (
    <div className="psd-artists-destination">
      <PageFrame cinematic>
        {featuredArtist ? (
          <section className="psd-artist-hero" aria-labelledby="artist-profile-heading">
            <EntityAtmosphereBackdrop
              className="psd-artist-hero-backdrop"
              artworkUrl={artistHeroArt}
              label={featuredArtist.name}
              variant="hero"
            />
            <div className="psd-artist-hero-veil" aria-hidden="true" />
            <div className="psd-artist-hero-inner">
              <div className="psd-artist-portrait-wrap">
                <ArtistAvatar artist={featuredArtist} />
              </div>
              <div className="psd-artist-hero-copy">
                <h1 id="artist-profile-heading" className="psd-artist-hero-name">
                  {featuredArtist.name}
                </h1>
                <p className="psd-artist-hero-label">Artist</p>
                <p className="psd-artist-hero-stats">
                  {formatArtistStatLine(
                    featuredArtist.songCount || popularSongs.length,
                    artistAlbums.length,
                  )}
                </p>
                <div className="psd-artist-hero-actions">
                  <button
                    type="button"
                    className="psd-artist-btn psd-artist-btn--play"
                    disabled={popularSongs.length === 0}
                    onClick={playFeaturedArtist}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </button>
                  <button
                    type="button"
                    className="psd-artist-btn psd-artist-btn--follow"
                    onClick={() => onOpenArtist(featuredArtist)}
                  >
                    View Profile
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <CatalogEmpty
            title="No artists in catalog"
            detail="Artist profiles will appear once your catalog loads."
          />
        )}

        {featuredArtist ? (
          <>
            <div className="psd-artist-tab-row" role="tablist" aria-label="Artist sections">
              {artistTabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  className={`psd-artist-tab${tab === entry.id ? ' is-active' : ''}`}
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="psd-artist-content-grid">
              {showPopular && visiblePopular.length > 0 ? (
                <section className="psd-artist-popular-panel" aria-labelledby="popular-songs-heading">
                  <header className="psd-artist-section-header">
                    <h2 id="popular-songs-heading">Popular</h2>
                    {tab === 'overview' && popularSongs.length > ARTIST_POPULAR_PREVIEW ? (
                      <button
                        type="button"
                        className="psd-artist-view-all"
                        onClick={() => setTab('songs')}
                      >
                        View all
                      </button>
                    ) : null}
                  </header>
                  <div className="psd-artist-popular-card">
                    {visiblePopular.map((song, index) => (
                      <button
                        key={song.id}
                        type="button"
                        className={`psd-artist-popular-row${isSongActive(song.id) ? ' is-active' : ''}`}
                        onClick={() => playArtistSong(song, index)}
                      >
                        <span className="psd-artist-popular-rank">{index + 1}</span>
                        <span className="psd-artist-popular-thumb">
                          <ArtworkImage
                            src={song.artwork ?? null}
                            alt=""
                            seed={song.id}
                            label={song.title}
                          />
                        </span>
                        <span className="psd-artist-popular-copy">
                          <strong>{song.title}</strong>
                        </span>
                        <span className="psd-artist-popular-streams">{song.album || 'Single'}</span>
                        <span className="psd-artist-popular-duration">
                          {formatSongDurationLabel(song)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {showOverview && primaryGenre ? (
                <section className="psd-artist-about-panel" aria-labelledby="artist-about-heading">
                  <h2 id="artist-about-heading">About</h2>
                  <p className="psd-artist-about-bio">
                    {featuredArtist.name} appears across your catalog with a focus on {primaryGenre}.
                  </p>
                  <dl className="psd-artist-about-details">
                    <div>
                      <dt>Genre</dt>
                      <dd>{primaryGenre}</dd>
                    </div>
                    <div>
                      <dt>Catalog</dt>
                      <dd>
                        {formatArtistStatLine(
                          featuredArtist.songCount || popularSongs.length,
                          artistAlbums.length,
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {showAlbums && visibleAlbums.length > 0 ? (
                <section className="psd-artist-albums-panel" aria-labelledby="artist-albums-heading">
                  <header className="psd-artist-section-header">
                    <h2 id="artist-albums-heading">Albums</h2>
                    {tab === 'overview' && artistAlbums.length > ARTIST_ALBUM_PREVIEW ? (
                      <button
                        type="button"
                        className="psd-artist-view-all"
                        onClick={() => setTab('albums')}
                      >
                        View all
                      </button>
                    ) : null}
                  </header>
                  <div className="psd-artist-albums-grid">
                    {visibleAlbums.map((album) => {
                      const albumSongCount = countSongsForAlbum(album, indexes)
                      return (
                        <button
                          key={album.id}
                          type="button"
                          className="psd-artist-album-card"
                          onClick={() => onOpenAlbum(album)}
                        >
                          <div className="psd-artist-album-art">
                            <ArtworkImage
                              src={album.artwork ?? null}
                              alt=""
                              seed={album.id}
                              label={album.title}
                            />
                          </div>
                          <strong>{album.title}</strong>
                          <span>{featuredArtist.name}</span>
                          <span className="psd-artist-album-meta">
                            {album.releaseYear ? `${album.releaseYear} • ` : ''}
                            {albumSongCount} {albumSongCount === 1 ? 'song' : 'songs'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </div>

            {showBrowseGrid ? (
              <section className="psd-artist-browse-panel" aria-labelledby="artist-browse-heading">
                <header className="psd-artist-section-header">
                  <h2 id="artist-browse-heading">Artists in your catalog</h2>
                </header>
                <ApiArtistGrid
                  artists={artists}
                  onSelect={onOpenArtist}
                  listKey="artists-page-browse"
                  paginate={false}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </PageFrame>
    </div>
  )
}



function AlbumsPage({
  onOpenAlbum,
  query: externalQuery,
  setQuery: externalSetQuery,
}: {
  onOpenAlbum: (album: ApiAlbum) => void
  query?: string
  setQuery?: (value: string) => void
}) {
  const { albums, artistNames, indexes } = useCatalog()
  const [internalQuery, setInternalQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSearch,
    '',
    parseStoredSearchTerm,
  )
  const query = externalQuery ?? internalQuery
  const setQuery = externalSetQuery ?? setInternalQuery
  void setQuery
  const [sort, setSort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSort,
    'latest' as AlbumSort,
    parseStoredAlbumSort,
  )
  const [tab, setTab] = useState<'all' | 'collection' | 'recent' | 'by-artist'>('all')
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const visibleAlbums = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q && q.length < 2) return []
    const filtered = filterAlbumsByQuery(albums, debouncedQuery, artistNames)
    return sortAlbumsList(filtered, sort)
  }, [albums, debouncedQuery, artistNames, sort])

  const resolveAlbumAtIndex = useCallback(
    (index: number) => visibleAlbums[index] ?? albums[index] ?? null,
    [albums, visibleAlbums],
  )

  const albumsSubtitle = visibleAlbums.length === 1
    ? '1 album in your library.'
    : `${visibleAlbums.length} albums in your library.`
  const albumsFooterCount = visibleAlbums.length === 1
    ? '1 album'
    : `${visibleAlbums.length} albums`
  const sortLabel = sort === 'latest' ? 'Recently Added' : 'A–Z'

  const albumTabs = [
    { id: 'all', label: 'All Albums' },
    { id: 'collection', label: 'In Collection' },
    { id: 'recent', label: 'Recently Added' },
    { id: 'by-artist', label: 'By Artist' },
  ] as const

  return (
    <div className="psd-albums-destination">
      <div className="psd-albums-atmosphere" aria-hidden="true" />
      <PageFrame cinematic>
        <header className="psd-albums-page-header" aria-labelledby="albums-heading">
          <h1 id="albums-heading" className="psd-albums-page-title">Albums</h1>
          <p className="psd-albums-page-subtitle">{albumsSubtitle}</p>
        </header>

        <div className="psd-albums-toolbar-row">
          <div className="psd-albums-tab-row" role="tablist" aria-label="Album filters">
            {albumTabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                className={`psd-albums-tab${tab === entry.id ? ' is-active' : ''}`}
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="psd-albums-sort-pill"
            aria-label={`Sort albums: ${sortLabel}`}
            onClick={() => setSort(sort === 'latest' ? 'az' : 'latest')}
          >
            {sortLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <div className="psd-albums-grid">
          {PSD_ALBUMS_GRID_CARDS.map((card, index) => {
            const album = resolveAlbumAtIndex(index)
            return (
              <article key={card.key} className="psd-albums-gallery-card">
                <button
                  type="button"
                  className="psd-albums-gallery-card-btn"
                  onClick={() => album && onOpenAlbum(album)}
                >
                  <div className="psd-albums-gallery-art-wrap">
                    <div className="psd-albums-gallery-art">
                      <ArtworkImage
                        src={album?.artwork ?? null}
                        alt=""
                        seed={album?.id ?? card.key}
                        label={album?.title ?? card.title}
                      />
                    </div>
                    <span className="psd-albums-gallery-art-veil" aria-hidden="true" />
                    <span className="psd-albums-gallery-play-fab" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </div>
                  <div className="psd-albums-gallery-copy">
                    <strong className="psd-albums-gallery-title">{album?.title ?? '—'}</strong>
                    <span className="psd-albums-gallery-artist">
                      {album ? (album.artistId ? artistNames.get(album.artistId) ?? 'Unknown artist' : 'Unknown artist') : '—'}
                    </span>
                    <span className="psd-albums-gallery-meta">
                      {album?.releaseYear ?? '—'} • {album ? countSongsForAlbum(album, indexes) : 0} songs
                    </span>
                    <span className="psd-albums-gallery-more" aria-hidden="true"><PsdIconMore /></span>
                  </div>
                </button>
              </article>
            )
          })}
        </div>

        <p className="psd-albums-footer-count">{albumsFooterCount}</p>
      </PageFrame>
    </div>
  )
}

function PlaylistsPage({
  onOpenSong,
  query: selectedPlaylistQuery = '',
  setQuery: setSelectedPlaylistQuery,
}: {
  onOpenSong: QueueSongHandler
  query?: string
  setQuery?: (value: string) => void
}) {
  const { songs, indexes, artworkContext } = useCatalog()
  const { currentTrack, isPlaying } = useDesktopPlayback()
  const [trackSearch, setTrackSearch] = useState('')

  const activeSpec = useMemo(
    () => resolveEditorialPlaylistSpec(selectedPlaylistQuery),
    [selectedPlaylistQuery],
  )

  const playlistTracks = useMemo(
    () => resolveEditorialPlaylistTracks(songs, activeSpec.sceneId),
    [activeSpec.sceneId, songs],
  )

  const visibleTracks = useMemo(
    () => filterPlaylistTracksBySearch(playlistTracks, trackSearch),
    [playlistTracks, trackSearch],
  )

  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const playlistHeroArt = useMemo(() => {
    const registryCover = getArtworkForPlaylist(
      { id: activeSpec.id, title: activeSpec.title },
      artworkContext,
    )
    if (registryCover) return [registryCover]
    return getArtworkForPlaylistCollage(playlistTracks, artworkContext)
  }, [activeSpec.id, activeSpec.title, artworkContext, playlistTracks])

  const relatedPlaylists = useMemo(
    () => EDITORIAL_PLAYLIST_SPECS.filter((spec) => spec.id !== activeSpec.id),
    [activeSpec.id],
  )

  const playPlaylistTrack = useCallback(
    (song: ApiSong, index: number) => {
      if (playlistTracks.length === 0) return
      onOpenSong(song, playlistTracks, index, 'manual', activeSpec.title, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', playlistTracks, indexes, song),
        candidatePools: queuePools,
      })
    },
    [activeSpec.title, indexes, onOpenSong, playlistTracks, queuePools],
  )

  const playAll = useCallback(() => {
    const first = playlistTracks[0]
    if (!first) return
    playPlaylistTrack(first, 0)
  }, [playPlaylistTrack, playlistTracks])

  const selectPlaylist = useCallback(
    (title: string) => {
      setSelectedPlaylistQuery?.(title)
      setTrackSearch('')
    },
    [setSelectedPlaylistQuery],
  )

  const isTrackActive = useCallback(
    (songId: string) => currentTrack?.id === songId && isPlaying,
    [currentTrack?.id, isPlaying],
  )

  const playlistMeta = formatPlaylistMetaLine(playlistTracks.length, playlistTracks)
  const hasPlayableTracks = playlistTracks.length > 0

  return (
    <div className="psd-playlists-destination">
      <PageFrame cinematic>
        <form className="psd-playlist-inpage-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <span className="psd-playlist-search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            value={trackSearch}
            onChange={(event) => setTrackSearch(event.target.value)}
            placeholder="Search in playlist"
            aria-label="Search in playlist"
          />
        </form>

        <section className="psd-playlist-hero" aria-labelledby="playlist-detail-heading">
          <EntityAtmosphereBackdrop
            className="psd-playlist-hero-backdrop"
            artworkUrl={playlistHeroArt[0] ?? null}
            label={activeSpec.title}
            variant="hero"
          />
          <div className="psd-playlist-hero-art" aria-hidden="true">
            <ArtworkCollage
              urls={playlistHeroArt}
              seed={activeSpec.id}
              label={activeSpec.title}
            />
          </div>
          <div className="psd-playlist-hero-copy">
            <span className="psd-playlist-eyebrow">PLAYLIST</span>
            <h1 id="playlist-detail-heading" className="psd-playlist-title">
              {activeSpec.title}
              {activeSpec.showMoon ? (
                <svg className="psd-playlist-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21 14.5A8.5 8.5 0 1111.5 4a6.5 6.5 0 109.5 10.5z" />
                </svg>
              ) : null}
            </h1>
            <p className="psd-playlist-description">{activeSpec.description}</p>
            <div className="psd-playlist-owner">
              <span className="psd-playlist-owner-avatar" aria-hidden="true">
                <PsdWaveformStrip className="psd-playlist-owner-wave" />
              </span>
              <span className="psd-playlist-owner-name">{activeSpec.owner}</span>
            </div>
            <p className="psd-playlist-meta">{playlistMeta}</p>
          </div>
        </section>

        <div className="psd-playlist-actions" role="toolbar" aria-label="Playlist actions">
          <button
            type="button"
            className="psd-playlist-btn psd-playlist-btn--play"
            disabled={!hasPlayableTracks}
            onClick={playAll}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
        </div>

        <section className="psd-playlist-table-section" aria-label="Playlist tracks">
          {!hasPlayableTracks ? (
            <CatalogEmpty
              title="No tracks available"
              detail={`${activeSpec.title} has no catalog matches yet. Tracks appear when listening-scene identity resolves in your library.`}
            />
          ) : visibleTracks.length === 0 ? (
            <CatalogEmpty
              title="No matches in playlist"
              detail={trackSearch.trim() ? `Nothing in ${activeSpec.title} matched "${trackSearch.trim()}".` : 'Try another search.'}
            />
          ) : (
            <div className="psd-playlist-table-wrap">
              <table className="psd-playlist-table">
                <thead>
                  <tr>
                    <th scope="col" className="psd-playlist-col-index">#</th>
                    <th scope="col" className="psd-playlist-col-title">TITLE</th>
                    <th scope="col" className="psd-playlist-col-artist">ARTIST</th>
                    <th scope="col" className="psd-playlist-col-duration" aria-label="Duration">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTracks.map((song, index) => {
                    const sourceIndex = playlistTracks.findIndex((entry) => entry.id === song.id)
                    const queueIndex = sourceIndex >= 0 ? sourceIndex : index
                    const active = isTrackActive(song.id)
                    return (
                      <tr
                        key={song.id}
                        className={`psd-playlist-table-row${active ? ' is-active' : ''}`}
                      >
                        <td className="psd-playlist-col-index">
                          {active ? (
                            <PsdIconEqualizer className="psd-playlist-row-equalizer" />
                          ) : (
                            queueIndex + 1
                          )}
                        </td>
                        <td className="psd-playlist-col-title">
                          <button
                            type="button"
                            className="psd-playlist-title-btn"
                            onClick={() => playPlaylistTrack(song, queueIndex)}
                          >
                            <span className="psd-playlist-row-thumb">
                              <ArtworkImage
                                src={song.artwork ?? null}
                                alt=""
                                seed={song.id}
                                label={song.title}
                              />
                            </span>
                            <span className="psd-playlist-title-copy">
                              <strong>{song.title}</strong>
                            </span>
                          </button>
                        </td>
                        <td className="psd-playlist-col-artist">{song.artist}</td>
                        <td className="psd-playlist-col-duration">{formatSongDurationLabel(song)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasPlayableTracks ? (
            <p className="psd-playlist-table-footer">{playlistMeta}</p>
          ) : null}
        </section>

        {relatedPlaylists.length > 0 ? (
          <section className="psd-playlist-related-panel" aria-labelledby="playlist-related-heading">
            <header className="psd-playlist-section-header">
              <h2 id="playlist-related-heading">More playlists</h2>
            </header>
            <div className="psd-playlist-related-grid">
              {relatedPlaylists.map((spec) => {
                const cover = getArtworkForPlaylist(
                  { id: spec.id, title: spec.title },
                  artworkContext,
                )
                const trackCount = resolveEditorialPlaylistTracks(songs, spec.sceneId).length
                return (
                  <button
                    key={spec.id}
                    type="button"
                    className="psd-playlist-related-card"
                    onClick={() => selectPlaylist(spec.title)}
                  >
                    <div className="psd-playlist-related-art">
                      {cover ? (
                        <ArtworkImage
                          src={cover}
                          alt=""
                          seed={spec.id}
                          label={spec.title}
                        />
                      ) : (
                        <ArtworkCollage
                          urls={getArtworkForPlaylistCollage(
                            resolveEditorialPlaylistTracks(songs, spec.sceneId),
                            artworkContext,
                          )}
                          seed={spec.id}
                          label={spec.title}
                        />
                      )}
                    </div>
                    <strong>{spec.title}</strong>
                    <span>
                      {trackCount} {trackCount === 1 ? 'song' : 'songs'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}



function LikedPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes } = useCatalog()
  const likedSongs = useMemo(() => sortSongsList([...songs], 'latest'), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const resolveLikedSongAtIndex = useCallback(
    (index: number) => {
      const row = PSD_LIKED_TABLE_ROWS[index]
      if (!row) return null
      const exact = likedSongs.find(
        (song) =>
          song.title.toLowerCase() === row.title.toLowerCase()
          && song.artist.toLowerCase() === row.artist.toLowerCase(),
      )
      return exact ?? likedSongs[index] ?? null
    },
    [likedSongs],
  )

  const playLikedSong = useCallback(
    (index: number) => {
      const song = resolveLikedSongAtIndex(index)
      if (!song) return
      const queue = likedSongs.length > 0 ? likedSongs : [song]
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue, queueIndex, 'manual', 'Liked Songs', {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, likedSongs, onOpenSong, queuePools, resolveLikedSongAtIndex],
  )

  const playAllLiked = useCallback(() => {
    playLikedSong(0)
  }, [playLikedSong])

  const likedMeta = useMemo(() => {
    const count = likedSongs.length
    const totalSeconds = likedSongs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    return `${count} ${count === 1 ? 'song' : 'songs'} • ${durationLabel}`
  }, [likedSongs])

  const visibleLikedSongs = likedSongs.slice(0, PSD_LIKED_TABLE_ROWS.length)

  return (
    <div className="psd-liked-destination">
      <PageFrame cinematic>
        <section className="psd-liked-hero" aria-labelledby="liked-heading">
          <div className="psd-liked-hero-art-wrap">
            <div className="psd-liked-hero-heart-art" aria-hidden="true">
              <span className="psd-liked-hero-heart-glow" />
              <svg className="psd-liked-hero-heart-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
              </svg>
            </div>

          </div>

          <div className="psd-liked-hero-copy">
            <h1 id="liked-heading" className="psd-liked-page-title">Liked Songs</h1>
            <p className="psd-liked-page-meta">{likedMeta}</p>
            <p className="psd-liked-page-description">{PSD_LIKED_DESCRIPTION}</p>
            <div className="psd-liked-hero-toolbar">
              <div className="psd-liked-hero-actions">
                <button type="button" className="psd-liked-btn psd-liked-btn--play" onClick={playAllLiked}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </button>
                <button type="button" className="psd-liked-btn psd-liked-btn--shuffle" onClick={playAllLiked}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                  </svg>
                  Shuffle
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="psd-liked-table-section" aria-label="Liked songs">
          <div className="psd-liked-table-wrap">
            <table className="psd-liked-table">
              <thead>
                <tr>
                  <th scope="col" className="psd-liked-col-index">#</th>
                  <th scope="col" className="psd-liked-col-title">TITLE</th>
                  <th scope="col" className="psd-liked-col-artist">ARTIST</th>
                  <th scope="col" className="psd-liked-col-album">ALBUM</th>
                  <th scope="col" className="psd-liked-col-date">DATE ADDED</th>
                  <th scope="col" className="psd-liked-col-duration" aria-label="Duration">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </th>
                  <th scope="col" className="psd-liked-col-menu"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleLikedSongs.map((song, index) => (
                    <tr key={song.id} className="psd-liked-table-row">
                      <td className="psd-liked-col-index">{index + 1}</td>
                      <td className="psd-liked-col-title">
                        <button
                          type="button"
                          className="psd-liked-title-btn"
                          onClick={() => playLikedSong(index)}
                        >
                          <span className="psd-liked-row-thumb">
                            <ArtworkImage
                              src={song.artwork ?? null}
                              alt=""
                              seed={song.id}
                              label={song.title}
                            />
                          </span>
                          <span className="psd-liked-title-copy">
                            <strong>{song.title}</strong>
                            <svg className="psd-liked-row-heart" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                            </svg>
                          </span>
                        </button>
                      </td>
                      <td className="psd-liked-col-artist">{song.artist}</td>
                      <td className="psd-liked-col-album">{song.album ?? '—'}</td>
                      <td className="psd-liked-col-date">—</td>
                      <td className="psd-liked-col-duration">{formatSongDurationLabel(song)}</td>
                      <td className="psd-liked-col-menu" aria-hidden="true" />
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </PageFrame>
    </div>
  )
}

/* Phase 42O: Recently Played page exact PSD reconstruction */
function RecentPage({
  onOpenSong,
  query = '',
}: {
  onOpenSong: QueueSongHandler
  query?: string
}) {
  const { songs, indexes } = useCatalog()
  const recentSongs = useMemo(() => sortSongsList([...songs], 'latest'), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const resolveRecentSongAtIndex = useCallback(
    (index: number) => {
      const row = PSD_RECENT_TABLE_ROWS[index]
      if (!row || row.itemType !== 'Song') return null
      const exact = recentSongs.find(
        (song) => song.title.toLowerCase() === row.title.toLowerCase(),
      )
      return exact ?? recentSongs[index] ?? null
    },
    [recentSongs],
  )

  const playRecentSong = useCallback(
    (index: number) => {
      const song = resolveRecentSongAtIndex(index)
      if (!song) return
      const queue = recentSongs.length > 0 ? recentSongs : [song]
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue, queueIndex, 'manual', 'Recent Plays', {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools, recentSongs, resolveRecentSongAtIndex],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const visibleSongs = useMemo(() => {
    const base = recentSongs.slice(0, 10)
    if (!normalizedQuery) return base
    return base.filter((song) => {
      const haystack = [song.title, song.artist, song.album ?? ''].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, recentSongs])

  return (
    <div className="psd-recent-destination">
      <PageFrame cinematic>
        <header className="psd-recent-header" aria-labelledby="recent-heading">
          <h1 id="recent-heading" className="psd-recent-page-title">Recently Played</h1>
          <p className="psd-recent-page-subtitle">Your recent music activity</p>
        </header>

        <section className="psd-recent-table-section" aria-label="Recently played items">
          <div className="psd-recent-table-wrap">
            <table className="psd-recent-table">
              <thead>
                <tr>
                  <th scope="col" className="psd-recent-col-index">#</th>
                  <th scope="col" className="psd-recent-col-title">TITLE</th>
                  <th scope="col" className="psd-recent-col-artist">ARTIST</th>
                  <th scope="col" className="psd-recent-col-type">TYPE</th>
                  <th scope="col" className="psd-recent-col-played">
                    <span className="psd-recent-played-label">
                      PLAYED
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </th>
                  <th scope="col" className="psd-recent-col-duration" aria-label="Duration">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </th>
                  <th scope="col" className="psd-recent-col-menu"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleSongs.map((song, index) => (
                    <tr key={song.id} className="psd-recent-table-row">
                      <td className="psd-recent-col-index">{index + 1}</td>
                      <td className="psd-recent-col-title">
                        <button
                          type="button"
                          className="psd-recent-title-btn"
                          onClick={() => playRecentSong(index)}
                        >
                          <span className="psd-recent-row-thumb">
                            <ArtworkImage
                              src={song.artwork ?? null}
                              alt=""
                              seed={song.id}
                              label={song.title}
                            />
                          </span>
                          <span className="psd-recent-title-copy">
                            <strong>{song.title}</strong>
                            <span>{song.album ?? 'Song'}</span>
                          </span>
                        </button>
                      </td>
                      <td className="psd-recent-col-artist">{song.artist}</td>
                      <td className="psd-recent-col-type">
                        <span className="psd-recent-type-pill">
                          <PsdRecentTypeIcon type="Song" />
                          <span>Song</span>
                        </span>
                      </td>
                      <td className="psd-recent-col-played">—</td>
                      <td className="psd-recent-col-duration">{formatSongDurationLabel(song)}</td>
                      <td className="psd-recent-col-menu" aria-hidden="true" />
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="psd-recent-table-footer">
              {visibleSongs.length === 0 ? "No recent plays yet" : `Showing ${visibleSongs.length} recently played songs`}
            </p>
          </div>
        </section>
      </PageFrame>
    </div>
  )
}

/* Phase 42X-FIX-2: Downloads page desktop shell + PSD content */

function DownloadsPage({
  onOpenSong,
  query = '',
}: {
  onOpenSong: QueueSongHandler
  query?: string
}) {
  void query
  const { songs, albums, indexes, artworkContext } = useCatalog()
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const [activeTab, setActiveTab] = useState<(typeof PSD_DOWNLOADS_TABS)[number]>('All')

  const resolveSong = useCallback(
    (title: string, index = 0) => songs.find((song) => song.title.toLowerCase() === title.toLowerCase()) ?? songs[index] ?? null,
    [songs],
  )

  const resolveDownloadAlbum = useCallback(
    (title: string, index = 0) => albums.find((album) => album.title.toLowerCase() === title.toLowerCase()) ?? albums[index] ?? null,
    [albums],
  )

  const playShuffleAll = useCallback(() => {
    const firstSong = resolveSong(PSD_DOWNLOADS_SONGS[0].title) ?? songs[0]
    if (!firstSong) return
    const queue = songs.length > 0 ? songs : [firstSong]
    const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === firstSong.id))
    onOpenSong(firstSong, queue, queueIndex, 'manual', 'Downloads', {
      seedType: 'manual',
      seedTracks: buildQueueSeedPool('manual', queue, indexes, firstSong),
      candidatePools: queuePools,
    })
  }, [indexes, onOpenSong, queuePools, resolveSong, songs])

  const showPlaylists = activeTab === 'All' || activeTab === 'Playlists'
  const showAlbums = activeTab === 'All' || activeTab === 'Albums'
  const showSongs = activeTab === 'All' || activeTab === 'Songs'

  return (
    <div className="psd-downloads-destination">
      <PageFrame cinematic>
        <h1 className="psd-downloads-title">Downloads</h1>

        <section className="psd-downloads-storage" aria-label="Offline downloads preview">
          <div className="psd-downloads-storage-copy">
            <strong>Offline downloads preview</strong>
            <span>Device download storage and sync are not connected in this desktop build yet.</span>
          </div>
        </section>

        <div className="psd-downloads-tabs" role="tablist" aria-label="Download categories">
          {PSD_DOWNLOADS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`psd-downloads-tab${activeTab === tab ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="psd-downloads-controls">
          <button type="button" className="psd-downloads-shuffle-all" onClick={playShuffleAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            Shuffle All
          </button>

        </div>

        {showPlaylists ? (
          <section className="psd-downloads-section" aria-label="Downloaded playlists">
            <h2 className="psd-downloads-section-title">Playlists ({PSD_DOWNLOADS_PLAYLISTS.length})</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_PLAYLISTS.map((row, index) => {
                const playlistSongs = songs.slice(index * 4, index * 4 + 8)
                return (
                <li key={row.key} className="psd-downloads-row">
                  <span className="psd-downloads-row-art">
                    <ArtworkCollage
                      urls={getArtworkForPlaylistCollage(playlistSongs, artworkContext)}
                      seed={row.key}
                      label={row.title}
                    />
                  </span>
                  <div className="psd-downloads-row-copy">
                    <p className="psd-downloads-row-title">
                      {row.title}
                      <svg className="psd-downloads-row-badge" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </p>
                    <span className="psd-downloads-row-meta">{row.meta}</span>
                    <span className="psd-downloads-row-status">Downloaded</span>
                  </div>
                  <span className="psd-downloads-row-check" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l2.5 2.5L16 9" />
                    </svg>
                  </span>
                </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {showAlbums ? (
          <section className="psd-downloads-section" aria-label="Downloaded albums">
            <h2 className="psd-downloads-section-title">Albums ({PSD_DOWNLOADS_ALBUMS.length})</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_ALBUMS.map((row, index) => {
                const album = resolveDownloadAlbum(row.title, index)
                return (
                <li key={row.key} className="psd-downloads-row">
                  <span className="psd-downloads-row-art">
                    <ArtworkImage
                      src={album?.artwork ?? null}
                      alt=""
                      seed={album?.id ?? row.key}
                      label={album?.title ?? row.title}
                    />
                  </span>
                  <div className="psd-downloads-row-copy">
                    <p className="psd-downloads-row-title">
                      {album?.title ?? row.title}
                      <svg className="psd-downloads-row-badge" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </p>
                    <span className="psd-downloads-row-meta">{row.artist}</span>
                    <span className="psd-downloads-row-meta">{row.meta}</span>
                    <span className="psd-downloads-row-status">Downloaded</span>
                  </div>
                  <span className="psd-downloads-row-check" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l2.5 2.5L16 9" />
                    </svg>
                  </span>
                </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {showSongs ? (
          <section className="psd-downloads-section" aria-label="Downloaded songs">
            <h2 className="psd-downloads-section-title">Songs ({PSD_DOWNLOADS_SONGS.length})</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_SONGS.map((row, index) => {
                const song = resolveSong(row.title, index)
                return (
                <li key={row.key} className="psd-downloads-row">
                  <span className="psd-downloads-row-art">
                    <ArtworkImage
                      src={song?.artwork ?? null}
                      alt=""
                      seed={song?.id ?? row.key}
                      label={song?.title ?? row.title}
                    />
                  </span>
                  <div className="psd-downloads-row-copy">
                    <p className="psd-downloads-row-title">
                      {song?.title ?? row.title}
                      <svg className="psd-downloads-row-badge" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </p>
                    <span className="psd-downloads-row-meta">
                      {song ? `${song.artist}${song.album ? ` • ${song.album}` : ''}` : row.meta}
                    </span>
                  </div>
                  <span className="psd-downloads-row-check" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l2.5 2.5L16 9" />
                    </svg>
                  </span>
                </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}

type PremiumFeatureAction = 'settings' | 'worlds'

type PremiumFeatureSpec = {
  id: string
  title: string
  description: string
  status: 'available' | 'coming-soon'
  action?: PremiumFeatureAction
  actionLabel?: string
}

type PremiumPlanSpec = {
  id: string
  title: string
  priceLabel: string
  detail: string
  badge?: string
}

const PREMIUM_FEATURE_SPECS: PremiumFeatureSpec[] = [
  {
    id: 'hq-audio',
    title: 'High Quality Audio',
    description: 'Choose standard, high-quality, or lossless playback for this desktop install.',
    status: 'available',
    action: 'settings',
    actionLabel: 'Open settings',
  },
  {
    id: 'worlds',
    title: 'Emotional Worlds',
    description: 'Browse cinematic listening scenes curated from your catalog moods and genres.',
    status: 'available',
    action: 'worlds',
    actionLabel: 'Browse worlds',
  },
  {
    id: 'cinema',
    title: 'Cinematic Player Modes',
    description: 'Full-screen premium player experiences with reactive visuals and lyrics stages.',
    status: 'coming-soon',
  },
  {
    id: 'offline',
    title: 'Offline Listening',
    description: 'Keep selected songs and playlists available when you are away from the network.',
    status: 'coming-soon',
  },
]

const PREMIUM_PLAN_SPECS: PremiumPlanSpec[] = [
  {
    id: 'monthly',
    title: 'Monthly',
    priceLabel: 'Coming soon',
    detail: 'Flexible membership preview for desktop.',
  },
  {
    id: 'annual',
    title: 'Annual',
    priceLabel: 'Coming soon',
    detail: 'Best value membership preview for desktop.',
    badge: 'Best value',
  },
]

function PremiumPage({ onNavigateNav }: { onNavigateNav: (navKey: NavKey) => void }) {
  const premiumHeroArt = getArtworkForPremium('hero')
  const featuresRef = useRef<HTMLElement | null>(null)
  const plansRef = useRef<HTMLElement | null>(null)

  const scrollToSection = useCallback((node: HTMLElement | null) => {
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleFeatureAction = useCallback(
    (feature: PremiumFeatureSpec) => {
      if (feature.status !== 'available' || !feature.action) return
      if (feature.action === 'settings') {
        onNavigateNav('settings')
        return
      }
      onNavigateNav('worlds')
    },
    [onNavigateNav],
  )

  return (
    <div className="psd-premium-destination">
      <PageFrame cinematic>
        <section className="psd-premium-hero" aria-labelledby="premium-heading">
          <EntityAtmosphereBackdrop
            className="psd-premium-hero-backdrop"
            artworkUrl={premiumHeroArt}
            label="Hidden Tunes Premium"
            variant="hero"
          />
          <div className="psd-premium-hero-veil" aria-hidden="true" />
          <div className="psd-premium-glow" aria-hidden="true" />
          <div className="psd-premium-hero-inner">
            <div className="psd-premium-hero-art" aria-hidden="true">
              <ArtworkImage
                src={premiumHeroArt}
                alt=""
                seed="premium-hero"
                label="Hidden Tunes Premium"
              />
            </div>
            <div className="psd-premium-hero-copy">
              <p className="psd-page-eyebrow">Hidden Tunes Premium</p>
              <h1 id="premium-heading">Unlock Every World</h1>
              <p className="psd-page-subtitle">
                Cinematic listening, deeper worlds, and gold-tier atmosphere — built for emotional immersion.
              </p>
              <div className="psd-hero-actions psd-premium-hero-actions">
                <button
                  type="button"
                  className="psd-btn psd-btn--gold"
                  onClick={() => scrollToSection(featuresRef.current)}
                >
                  Explore features
                </button>
                <button
                  type="button"
                  className="psd-btn psd-btn--ghost"
                  onClick={() => scrollToSection(plansRef.current)}
                >
                  Compare plans
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="psd-premium-notice" aria-label="Membership availability">
          <span className="psd-premium-notice-badge">Preview</span>
          <div className="psd-premium-notice-copy">
            <strong>Membership checkout is not available on this desktop preview.</strong>
            <p>
              Explore included playback quality settings and emotional worlds now. Billing and plan management will arrive in a future release.
            </p>
          </div>
          <button
            type="button"
            className="psd-btn psd-btn--ghost psd-btn--compact"
            onClick={() => onNavigateNav('settings')}
          >
            Manage in Settings
          </button>
        </section>

        <section
          ref={featuresRef}
          className="psd-premium-section"
          aria-labelledby="premium-features-heading"
        >
          <header className="psd-premium-section-header">
            <h2 id="premium-features-heading">Premium features</h2>
            <p>Only live capabilities are marked available. Everything else stays clearly preview-only.</p>
          </header>
          <div className="psd-premium-grid">
            {PREMIUM_FEATURE_SPECS.map((feature) => (
              <article key={feature.id} className="psd-premium-card" data-status={feature.status}>
                <div className="psd-premium-card-top">
                  <span className="psd-premium-card-icon" aria-hidden="true">✦</span>
                  <span className={`psd-premium-status${feature.status === 'available' ? ' is-live' : ''}`}>
                    {feature.status === 'available' ? 'Available' : 'Coming soon'}
                  </span>
                </div>
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
                {feature.status === 'available' && feature.action && feature.actionLabel ? (
                  <button
                    type="button"
                    className="psd-premium-card-action"
                    onClick={() => handleFeatureAction(feature)}
                  >
                    {feature.actionLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section
          ref={plansRef}
          className="psd-premium-section psd-premium-plans"
          aria-labelledby="premium-plans-heading"
        >
          <header className="psd-premium-section-header">
            <h2 id="premium-plans-heading">Plans</h2>
            <p>Preview pricing only — checkout is not connected on desktop yet.</p>
          </header>
          <div className="psd-premium-plan-grid">
            {PREMIUM_PLAN_SPECS.map((plan) => (
              <article key={plan.id} className="psd-premium-plan-card" data-plan={plan.id}>
                {plan.badge ? <span className="psd-premium-plan-badge">{plan.badge}</span> : null}
                <h3>{plan.title}</h3>
                <p className="psd-premium-plan-price">{plan.priceLabel}</p>
                <p className="psd-premium-plan-detail">{plan.detail}</p>
                <button type="button" className="psd-premium-plan-cta" disabled>
                  Not available yet
                </button>
              </article>
            ))}
          </div>
        </section>
      </PageFrame>
    </div>
  )
}



function AudioQualitySelector({
  value,
  onChange,
  compact = false,
}: {
  value: AudioQualityMode
  onChange: (mode: AudioQualityMode) => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <select
        className="audio-quality-select"
        value={value}
        onChange={(event) => onChange(event.target.value as AudioQualityMode)}
        aria-label="Audio quality"
      >
        {AUDIO_QUALITY_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {AUDIO_QUALITY_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      className="audio-quality-selector"
      role="group"
      aria-label="Desktop audio quality"
    >
      {AUDIO_QUALITY_MODES.map((mode) => {
        const active = mode === value

        return (
          <button
            key={mode}
            type="button"
            className={'audio-quality-option' + (active ? ' active' : '')}
            aria-pressed={active}
            onClick={() => onChange(mode)}
          >
            {AUDIO_QUALITY_MODE_LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}

function SettingsPage({
  onOpenPlayerByStyle,
}: {
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
}) {
  const {
    audioQualityMode,
    setAudioQualityMode,
    currentTrack,
    currentQueue,
    currentIndex,
  } = useDesktopPlayback()
  const { resetDesktopPreferencesState } = usePreferencesReset()
  const { clearCatalogCache } = useCatalog()
  const [resetNotice, setResetNotice] = useState('')
  const [cacheNotice, setCacheNotice] = useState('')

  const hasActivePlayback = Boolean(
    currentTrack && currentQueue.length > 0 && currentIndex >= 0,
  )

  const handleResetPreferences = () => {
    resetDesktopPreferencesState()
    setResetNotice('Desktop preferences cleared. UI defaults restored locally.')
  }

  const handleClearCatalogCache = () => {
    clearCatalogCache()
    setCacheNotice('Saved catalog cache cleared locally.')
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Desktop appearance and product information for this install."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className="settings-nav-item active">
            About
          </button>
          <button type="button" className="settings-nav-item" disabled>
            Appearance
          </button>
          <button type="button" className="settings-nav-item" disabled>
            Playback
          </button>
        </nav>
        <div className="settings-panels">
          <section className="settings-panel settings-panel--about">
            <h2>About &amp; identity</h2>
            <p className="settings-panel-desc">
              Installable desktop preview for browsing the Hidden Tunes catalog.
            </p>
            <dl className="settings-identity-list">
              <div className="settings-identity-row">
                <dt>App name</dt>
                <dd>{APP_NAME}</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Version</dt>
                <dd>{APP_VERSION}</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Build</dt>
                <dd>Desktop Preview Build</dd>
              </div>
              <div className="settings-identity-row">
                <dt>Catalog</dt>
                <dd>Read-only catalog mode</dd>
              </div>
            </dl>
            <p className="settings-identity-note">
              Mobile app and playback remain separate.
            </p>
          </section>
          <section className="settings-panel">
            <h2>Desktop preferences</h2>
            <p className="settings-panel-desc">
              Saved locally on this device — sidebar page, search terms, and sort options only.
            </p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Reset desktop preferences</span>
                <small>Clears local UI state · catalog and mobile stay unchanged</small>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm settings-reset-btn"
                onClick={handleResetPreferences}
              >
                Reset
              </button>
            </div>
            {resetNotice ? (
              <p className="settings-reset-note" role="status">
                {resetNotice}
              </p>
            ) : null}
          </section>
          <CatalogStatusSettings
            cacheNotice={cacheNotice}
            onClearCache={handleClearCatalogCache}
          />
          <section className="settings-panel settings-panel--playback">
            <h2>Playback quality</h2>
            <p className="settings-panel-desc">
              Audio quality mode is saved locally for this desktop install. Playback source selection stays unchanged.
            </p>
            <div className="settings-row settings-row--stacked">
              <div className="settings-label">
                <span>Audio quality</span>
                <small>Selected: {AUDIO_QUALITY_MODE_LABELS[audioQualityMode]}</small>
              </div>
              <AudioQualitySelector
                value={audioQualityMode}
                onChange={setAudioQualityMode}
              />
            </div>
          </section>
          <AtmosphereSettingsPanel />
          <PreferredPlayerStyleSelector
            hasActivePlayback={hasActivePlayback}
            onOpenPlayerByStyle={onOpenPlayerByStyle}
          />
          <section className="settings-panel">
            <h2>Appearance</h2>
            <p className="settings-panel-desc">Cinematic dark theme tuned for desktop browsing.</p>
            <div className="settings-row">
              <div className="settings-label">
                <span>Cinematic dark theme</span>
                <small>Low-light, premium contrast</small>
              </div>
              <span className="settings-badge">Active</span>
            </div>
            <div className="settings-row">
              <div className="settings-label">
                <span>Accent glow intensity</span>
                <small>Highlights on cards and navigation</small>
              </div>
              <div className="settings-slider" aria-hidden="true">
                <div className="settings-slider-fill" style={{ width: '70%' }} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageFrame>
  )
}

const PlaybackTransportControls = memo(function PlaybackTransportControls({
  activeTrackId,
  className = 'player-controls',
  showShuffleRepeat = false,
}: {
  activeTrackId: string | null
  className?: string
  showShuffleRepeat?: boolean
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    shuffleEnabled,
    repeatMode,
    pause,
    resume,
    next,
    previous,
    toggleShuffle,
    toggleRepeat,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && (
    currentIndex > 0 || (repeatMode === 'all' && currentQueue.length > 1)
  )
  const hasNext = isActive && (
    (currentIndex >= 0 && currentIndex < currentQueue.length - 1) || repeatMode !== 'off'
  )
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading

  const handlePlayPause = () => {
    if (!isActive || isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    resume()
  }

  const playLabel = showLoading
    ? 'Loading track'
    : showPlaying
      ? 'Pause'
      : isActive
        ? 'Play'
        : 'Play (select a track)'

  const repeatLabel = repeatMode === 'one'
    ? 'Repeat one'
    : repeatMode === 'all'
      ? 'Repeat all'
      : 'Repeat off'

  return (
    <div className={`transport-controls ${className}`} role="group" aria-label="Playback controls">
      {showShuffleRepeat ? (
        <button
          type="button"
          className={`control-btn control-btn--shuffle${shuffleEnabled ? ' is-active' : ''}`}
          onClick={toggleShuffle}
          disabled={!isActive}
          aria-label={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
          aria-pressed={shuffleEnabled}
          title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className={
          'control-btn play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
          + (!isActive ? ' is-idle' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        <span className="control-btn-icon control-btn-icon--play" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        className="control-btn control-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <span className="control-btn-icon control-btn-icon--skip" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
          </svg>
        </span>
      </button>
      {showShuffleRepeat ? (
        <button
          type="button"
          className={
            'control-btn control-btn--repeat'
            + (repeatMode !== 'off' ? ' is-active' : '')
            + (repeatMode === 'one' ? ' is-repeat-one' : '')
          }
          onClick={toggleRepeat}
          disabled={!isActive}
          aria-label={repeatLabel}
          aria-pressed={repeatMode !== 'off'}
          title={repeatLabel}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        </button>
      ) : null}
    </div>
  )
})

const PlayerBar = memo(function PlayerBar({
  track,
  onOpenPlayerByStyle,
}: {
  track: ApiSong | null
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueTitle,
    isPlaying,
    isLoading,
    error,
    volume,
    audioQualityMode,
    setAudioQualityMode,
    seekTo,
    setVolume,
  } = useDesktopPlayback()
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const volumeBeforeMuteRef = useRef(1)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)

  const hasPlayback = Boolean(currentTrack && currentQueue.length > 0 && currentIndex >= 0)
  const displayTrack = hasPlayback ? (track ?? currentTrack) : null
  const shellMetadata = useMemo(
    () => resolvePlayerShellMetadata({
      currentTrack: displayTrack,
      preferredTrack: null,
      queueTitle,
      audioQualityMode,
    }),
    [audioQualityMode, displayTrack, queueTitle],
  )
  const title = shellMetadata.displayTitle
  const artist = shellMetadata.displayArtist
  const subtitle = resolvePlayerSubtitle(displayTrack)
  const showShuffleRepeat = Boolean(displayTrack)
    && !isAudiobookQueueSong(displayTrack)
    && !isPodcastQueueSong(displayTrack)
    && !isRadioQueueSong(displayTrack)
    && !isTvQueueSong(displayTrack)
  const isTvLive = Boolean(displayTrack && isTvQueueSong(displayTrack))
  const progressMax = isTvLive ? 0 : (durationSeconds > 0 ? durationSeconds : 0)
  const progressValue = scrubSeconds ?? (progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0)
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const volumeLevel =
    volume <= 0 ? 'muted' : volume < 0.35 ? 'low' : volume > 0.7 ? 'high' : 'normal'

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
  }, [])

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!displayTrack || progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!displayTrack || progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubSeconds(seconds)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) setScrubSeconds(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (scrubSeconds != null) seekTo(scrubSeconds)
    setScrubSeconds(null)
  }

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const barState = error
    ? 'error'
    : isLoading
      ? 'loading'
      : isPlaying
        ? 'playing'
        : displayTrack
          ? 'paused'
          : 'idle'

  return (
    <footer
      className={`player-bar player-bar--${barState}`}
      aria-label="Player"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >
      <div className="player-track">
        <div className="player-artwork" aria-hidden="true">
          <ArtworkImage
            src={displayTrack?.artwork ?? null}
            alt=""
            seed={displayTrack?.id ?? 'player-bar'}
            label={title}
            priority
          />
        </div>
        <div className="player-meta">
          <h4>{title}</h4>
          <p>{artist}</p>
          {subtitle ? <p className="player-meta-subtitle">{subtitle}</p> : null}
          {error ? <p className="player-error">{error}</p> : null}
        </div>
      </div>

      <div className="player-center">
        <PlaybackTransportControls
          activeTrackId={displayTrack?.id ?? null}
          showShuffleRepeat={showShuffleRepeat}
        />
        <div
          className={`progress-wrap${isTvLive ? ' progress-wrap--live' : ''}`}
          role="group"
          aria-label={isTvLive ? 'Live TV status' : 'Playback progress'}
        >
          {isTvLive ? (
            <>
              <span className="progress-time progress-time--live">LIVE</span>
              <div className="progress-track progress-track--live" aria-hidden="true">
                <div className="progress-fill progress-fill--live" />
              </div>
              <span className="progress-time progress-time--live-edge">
                {isLoading ? 'Connecting' : isPlaying ? 'On air' : 'Paused'}
              </span>
            </>
          ) : (
            <>
              <span className="progress-time">{formatPlaybackTime(progressValue)}</span>
              <div
                ref={progressTrackRef}
                className={`progress-track${progressMax > 0 && displayTrack ? ' progress-track--interactive' : ''}`}
                role="slider"
                aria-label="Seek position"
                aria-valuemin={0}
                aria-valuemax={Math.round(progressMax)}
                aria-valuenow={Math.round(progressValue)}
                aria-disabled={!displayTrack || progressMax <= 0 || isLoading}
                onClick={handleSeekClick}
                onPointerDown={handleSeekPointerDown}
                onPointerMove={handleSeekPointerMove}
                onPointerUp={handleSeekPointerUp}
                onPointerCancel={handleSeekPointerUp}
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="progress-time">
                {progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="player-right">
        <PlayerModeLauncher
          hasPlayback={hasPlayback}
          onOpenPlayerByStyle={onOpenPlayerByStyle}
          variant="footer"
        />
        <div className="player-quality">
          {isTvLive ? (
            <span className="player-quality-live" aria-label="Live TV">LIVE TV</span>
          ) : (
            <AudioQualitySelector
              value={audioQualityMode}
              onChange={setAudioQualityMode}
              compact
            />
          )}
        </div>
        <div className={`player-volume player-volume--${volumeLevel}`}>
        <button
          type="button"
          className="control-btn player-volume-toggle"
          aria-label={
            volume <= 0
              ? 'Unmute'
              : volume < 0.35
                ? 'Volume low'
                : 'Mute'
          }
          onClick={() => {
            if (volume <= 0) {
              setVolume(volumeBeforeMuteRef.current > 0 ? volumeBeforeMuteRef.current : 0.7)
              return
            }
            volumeBeforeMuteRef.current = volume
            setVolume(0)
          }}
        >
          {volume <= 0 ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M23 9l-6 6M17 9l6 6" />
            </svg>
          ) : volume < 0.35 ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
            </svg>
          )}
        </button>
        <div
          ref={volumeTrackRef}
          className="volume-slider"
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volumePercent)}
          onClick={handleVolumeClick}
          onPointerDown={handleVolumePointerDown}
          onPointerMove={handleVolumePointerMove}
          onPointerUp={handleVolumePointerUp}
          onPointerCancel={handleVolumePointerUp}
        >
          <div
            className="volume-fill"
            style={{ width: `${volumePercent}%` }}
          />
        </div>
      </div>
      </div>
    </footer>
  )
})


const QueueUpNextPanel = memo(function QueueUpNextPanel({
  onOpenPlayerByStyle,
}: {
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  onNavigateNav?: (navKey: NavKey) => void
  activeNavKey?: NavKey
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    clearUpcomingQueue,
    getUpcomingTracks,
  } = useDesktopPlayback()

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)

  const queueStats = useMemo(
    () => buildPlayerQueueStats(currentQueue, currentIndex),
    [currentIndex, currentQueue],
  )

  const canClearQueue = getUpcomingTracks().length > 0

  const handleClearQueue = useCallback(() => {
    clearUpcomingQueue()
  }, [clearUpcomingQueue])

  if (!hasPlayback) return null

  return (
    <aside className="queue-rail queue-rail--workspace" aria-label="Up next queue">
      <header className="queue-rail-header queue-rail-header--workspace">
        <div className="queue-rail-header-copy">
          <h2>Up Next</h2>
          <span className="queue-rail-stats">
            {queueStats.songCount} tracks · {queueStats.remainingCount} remaining · {queueStats.remainingDurationLabel}
          </span>
        </div>
        {canClearQueue ? (
          <button
            type="button"
            className="queue-rail-clear"
            onClick={handleClearQueue}
          >
            Clear
          </button>
        ) : null}
      </header>

      <div className="queue-rail-queue-body">
        <PlayerQueuePanel />
      </div>

      <footer className="queue-rail-footer queue-rail-footer--workspace">
        <PlayerModeLauncher
          hasPlayback={hasPlayback}
          onOpenPlayerByStyle={onOpenPlayerByStyle}
          variant="sidebar"
        />
      </footer>
    </aside>
  )
})


type ActiveView = 'page' | 'song' | 'album' | 'artist' | 'mood' | 'podcast-show' | 'audiobook-book'

function formatDateLabel(value: string | null) {
  if (!value) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}


function DetailTopBar({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack: () => void
}) {
  return (
    <div className="detail-topbar">
      <button type="button" className="detail-back" onClick={onBack}>
        <span aria-hidden="true">←</span>
        Back
      </button>
      <div className="detail-titles">
        <h2 className="detail-title">{title}</h2>
        {subtitle ? <p className="detail-subtitle">{subtitle}</p> : null}
      </div>
    </div>
  )
}


function PlayerWorkspace({
  song,
  onBack,
  onOpenCinema,
}: {
  song: ApiSong
  onBack: () => void
  onOpenCinema?: () => void
}) {
  const {
    currentTrack,
    queueTitle,
    isPlaying,
    isLoading,
    audioQualityMode,
  } = useDesktopPlayback()

  const isActive = currentTrack?.id === song.id
  const qualityLabel =
    resolveSearchRowQualityBadge(song) !== 'SONG'
      ? resolveSearchRowQualityBadge(song)
      : isActive
        ? AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
        : null
  const albumLabel = song.album ?? (isActive ? queueTitle ?? null : null)

  return (
    <div
      className="player-workspace"
      data-playing={isActive && isPlaying ? 'true' : 'false'}
      data-loading={isActive && isLoading ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      <header className="player-workspace-toolbar">
        <button type="button" className="player-workspace-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back
        </button>
        {onOpenCinema ? (
          <button
            type="button"
            className="player-workspace-fullscreen"
            onClick={onOpenCinema}
            aria-label="Open fullscreen player"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
            </svg>
            Fullscreen
          </button>
        ) : null}
      </header>

      <div className="player-workspace-grid">
        <section className="player-workspace-art" aria-label="Artwork">
          <div className="player-workspace-art-frame">
            <ArtworkImage src={song.artwork} alt="" seed={song.id} priority />
            {isActive && isLoading ? (
              <span className="player-workspace-art-spinner player-spinner" aria-hidden="true" />
            ) : null}
          </div>
        </section>

        <section className="player-workspace-info" aria-label="Now playing">
          <p className="player-workspace-eyebrow">Now Playing</p>
          <h1 className="player-workspace-title">{song.title}</h1>
          <p className="player-workspace-artist">{song.artist}</p>
          {albumLabel ? (
            <p className="player-workspace-album">{albumLabel}</p>
          ) : null}
          {qualityLabel ? (
            <span className="player-workspace-quality">{qualityLabel}</span>
          ) : null}
          <PlaybackTransportControls
            activeTrackId={song.id}
            className="player-workspace-controls"
            showShuffleRepeat
          />
        </section>
      </div>
    </div>
  )
}

function AlbumDetailView({
  album,
  onBack,
  onOpenSong,
  selectedTrackId,
}: {
  album: ApiAlbum
  onBack: () => void
  onOpenSong: QueueSongHandler
  selectedTrackId: string | null
}) {
  const { artistNames, indexes } = useCatalog()
  const created = formatDateLabel(album.createdAt)

  const albumSongs = useMemo(() => {
    const byAlbum = resolveSongsForAlbum(
      album,
      indexes.songsByAlbumId,
      indexes.songsByAlbumName,
      indexes.artistNames,
    )
    return sortSongsList(byAlbum, 'az')
  }, [album, indexes.songsByAlbumId, indexes.songsByAlbumName, indexes.artistNames])

  const artistName = useMemo(
    () => resolveAlbumDisplayArtist(album, albumSongs, artistNames),
    [album, albumSongs, artistNames],
  )

  const artwork = album.artwork
  const tracks = useMemo(
    () => albumSongs.slice(0, CATALOG_DETAIL_TRACK_PREVIEW_LIMIT),
    [albumSongs],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playAlbumSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      tracks,
      index,
      'album',
      album.title,
      {
        seedType: 'album',
        seedId: album.id,
        seedTracks: capSongPool(albumSongs),
        candidatePools: queuePools,
      },
    ),
    [album.id, album.title, albumSongs, onOpenSong, queuePools, tracks],
  )

  return (
    <PageFrame>
      <DetailTopBar title={album.title} onBack={onBack} />
      <section className="detail-hero detail-hero--album">
        <div className="detail-artwork detail-artwork--wide">
          <ArtworkImage src={artwork} alt="" seed={album.id} variant="wide" priority />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Album</p>
          <h1 className="detail-h1">{album.title}</h1>
          <p className="detail-byline">
            <span className="detail-pill">{artistName || 'Unknown artist'}</span>
            <span className="detail-pill detail-pill--muted">
              {album.releaseYear ? `Released ${album.releaseYear}` : 'Release year unknown'}
            </span>
          </p>
          <p className="detail-stats">
            {albumSongs.length} {albumSongs.length === 1 ? 'track' : 'tracks'}
            {created ? ` · Added ${created}` : ''}
          </p>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Track list</h3>
        </div>
        {tracks.length === 0 ? (
          <CatalogEmpty title="No verified tracks" detail="Only identity-matched album tracks are shown here." />
        ) : (
          <ol className="detail-tracklist">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <button
                  type="button"
                  className="detail-track detail-track-button"
                  data-selected={selectedTrackId === track.id ? 'true' : undefined}
                  onClick={() => playAlbumSong(track, index)}
                  aria-label={`Open ${track.title} by ${track.artist}`}
                >
                  <span className="detail-track-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="detail-track-title">{track.title}</span>
                  <span className="detail-track-meta">{track.artist}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageFrame>
  )
}

function ArtistDetailView({
  artist,
  onBack,
  onOpenSong,
  onOpenAlbum,
}: {
  artist: ApiArtist
  onBack: () => void
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
}) {
  const { artistNames, indexes } = useCatalog()

  const artistSongs = useMemo(() => {
    const byArtist = resolveSongsForArtist(
      artist,
      indexes.songsByArtistId,
      indexes.songsByArtistName,
    )
    return sortSongsList(byArtist, 'latest')
  }, [artist, indexes.songsByArtistId, indexes.songsByArtistName])
  const topSongs = useMemo(() => artistSongs.slice(0, 12), [artistSongs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playArtistSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      topSongs,
      index,
      'artist',
      artist.name,
      {
        seedType: 'artist',
        seedId: artist.id,
        seedTracks: capSongPool(artistSongs),
        candidatePools: queuePools,
      },
    ),
    [artist.id, artist.name, artistSongs, onOpenSong, queuePools, topSongs],
  )

  const artistAlbums = useMemo(
    () => resolveAlbumsForArtist(artist, indexes.albumsByArtistId).slice(0, 12),
    [artist, indexes.albumsByArtistId],
  )

  return (
    <PageFrame>
      <DetailTopBar title="Artist" onBack={onBack} />
      <section className="detail-hero detail-hero--artist">
        <div className="detail-artist-badge">
          <ArtistAvatar artist={artist} />
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Artist</p>
          <h1 className="detail-h1">{artist.name}</h1>
          <p className="detail-stats">
            {artist.songCount || artistSongs.length}{' '}
            {(artist.songCount || artistSongs.length) === 1 ? 'track' : 'tracks'} · {artistAlbums.length}{' '}
            {artistAlbums.length === 1 ? 'album' : 'albums'}
          </p>
          <div className="detail-hero-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={topSongs.length === 0}
              onClick={() => topSongs[0] && playArtistSong(topSongs[0], 0)}
            >
              Play
            </button>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Top songs</h3>
          <span>From cached catalog</span>
        </div>
        {topSongs.length === 0 ? (
          <CatalogEmpty title="No verified songs" detail="Only identity-matched artist tracks are shown here." />
        ) : (
          <ApiSongGrid
            songs={topSongs}
            onSelect={playArtistSong}
            listKey={`artist-songs-${artist.id}`}
            paginate={false}
            showEmpty={false}
          />
        )}
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Albums</h3>
          <span>From cached catalog</span>
        </div>
        {artistAlbums.length === 0 ? (
          <CatalogEmpty title="No verified albums" detail="Only identity-matched artist albums are shown here." />
        ) : (
          <ApiAlbumGrid
            albums={artistAlbums}
            artistNames={artistNames}
            indexes={indexes}
            onSelect={onOpenAlbum}
            listKey={`artist-albums-${artist.id}`}
            paginate={false}
          />
        )}
      </section>
    </PageFrame>
  )
}

function MoodDetailView({
  mood,
  onBack,
  onOpenSong,
}: {
  mood: MoodRoom
  onBack: () => void
  onOpenSong: QueueSongHandler
}) {
  const { songs, indexes, artworkContext } = useCatalog()

  const moodSongs = useMemo(
    () =>
      resolveSongsForMoodRoom(
        mood.title,
        mood.mood,
        indexes.songsByMood,
        indexes.songsByGenre,
        songs,
      ),
    [indexes.songsByGenre, indexes.songsByMood, mood.mood, mood.title, songs],
  )
  const curated = useMemo(() => moodSongs.slice(0, 12), [moodSongs])
  const moodHeroCollage = useMemo(
    () => getArtworkForPlaylistCollage(curated, artworkContext),
    [artworkContext, curated],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const descriptionByMood: Record<Mood, string> = useMemo(
    () => ({
      violet: 'Velvet signals, neon hush, and after-hours romance.',
      cyan: 'Clean air, moonlit focus, and oceanic clarity.',
      rose: 'Heat, heart, and luminous emotional peaks.',
      mint: 'Green calm, organic drift, and restorative quiet.',
    }),
    [],
  )

  const sceneId = moodRoomScene(mood)
  const playMoodSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      curated,
      index,
      'mood',
      mood.title,
      {
        seedType: 'mood',
        seedId: mood.title,
        seedTracks: capSongPool(moodSongs),
        candidatePools: queuePools,
      },
    ),
    [curated, mood.title, moodSongs, onOpenSong, queuePools],
  )

  return (
    <PageFrame>
      <DetailTopBar title="Mood Room" subtitle="UI-only room detail" onBack={onBack} />
      <section
        className={`detail-hero detail-hero--mood detail-hero--${mood.mood}`}
        data-scene={sceneId}
      >
        <div className="detail-hero-mood-art" aria-hidden="true">
          {moodHeroCollage.length > 1 ? (
            <ArtworkCollage urls={moodHeroCollage} seed={mood.title} label={mood.title} />
          ) : (
            <ArtworkImage
              src={moodHeroCollage[0] ?? null}
              alt=""
              seed={mood.title}
              label={mood.title}
              variant="wide"
              priority
            />
          )}
        </div>
        <div className="detail-hero-copy">
          <p className="detail-eyebrow">Mood Room</p>
          <h1 className="detail-h1">{mood.title}</h1>
          <p className="detail-mood-desc">{descriptionByMood[mood.mood]}</p>
          <div className="detail-byline">
            <span className="detail-pill">{mood.listeners} listening</span>
            <span className="detail-pill detail-pill--muted">{mood.subtitle}</span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <div className="detail-panel-header">
          <h3>Curated songs</h3>
          <span>From cached catalog</span>
        </div>
        <ApiSongGrid
          songs={curated}
          onSelect={playMoodSong}
          listKey={`mood-${mood.title}`}
          paginate={false}
        />
      </section>
    </PageFrame>
  )
}

function CatalogDetailRouter({
  activeView,
  selectedSong,
  selectedAlbum,
  selectedArtist,
  selectedMood,
  desktopSelectedTrack,
  onBack,
  activePage,
  activeNavKey,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood,
  onOpenCinema,
  discoverQuery,
  setDiscoverQuery,
  albumsQuery,
  setAlbumsQuery,
  onPlaylistBack,
  onNavigateNav,
  onOpenPlayerByStyle,
  recentQuery = '',
  downloadsQuery = '',
  playlistsQuery = '',
  setPlaylistsQuery,
  libraryQuery = '',
  radioQuery = '',
  podcastsQuery = '',
  audiobooksQuery = '',
  tvQuery = '',
  onPlayRadioStation,
  onPlayTvChannel,
  selectedPodcastShowId = null,
  selectedAudiobookId = null,
  onOpenPodcastShow,
  onOpenAudiobookBook,
  onPlayPodcastEpisode,
  onPlayAudiobookChapter,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  selectedPodcastShowId?: string | null
  selectedAudiobookId?: string | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenPodcastShow?: (showId: string) => void
  onOpenAudiobookBook?: (bookId: string) => void
  onPlayPodcastEpisode?: (
    episode: PodcastEpisodeMeta,
    queue: PodcastEpisodeMeta[],
    startIndex: number,
    queueTitle: string,
    options?: {
      show?: PodcastShowMeta | null
      resumePositionSeconds?: number | null
    },
  ) => void
  onPlayAudiobookChapter?: PlayAudiobookChapterHandler
  onOpenCinema?: () => void
  discoverQuery: string
  setDiscoverQuery: (value: string) => void
  albumsQuery: string
  setAlbumsQuery: (value: string) => void
  onPlaylistBack: () => void
  onNavigateNav: (navKey: NavKey) => void
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  recentQuery?: string
  downloadsQuery?: string
  playlistsQuery?: string
  setPlaylistsQuery?: (value: string) => void
  libraryQuery?: string
  radioQuery?: string
  podcastsQuery?: string
  audiobooksQuery?: string
  tvQuery?: string
  onPlayRadioStation?: (
    station: RadioStationMeta,
    queue: RadioStationMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
  onPlayTvChannel?: (
    channel: TvChannelMeta,
    queue: TvChannelMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
}) {
  if (activeView === 'song' && selectedSong) {
    return (
      <PlayerWorkspace
        song={selectedSong}
        onBack={onBack}
        onOpenCinema={onOpenCinema}
      />
    )
  }

  if (activeView === 'album' && selectedAlbum) {
    return (
      <AlbumDetailView
        album={selectedAlbum}
        onBack={onBack}
        onOpenSong={onOpenSong}
        selectedTrackId={desktopSelectedTrack?.id ?? null}
      />
    )
  }

  if (activeView === 'artist' && selectedArtist) {
    return (
      <ArtistDetailView
        artist={selectedArtist}
        onBack={onBack}
        onOpenSong={onOpenSong}
        onOpenAlbum={onOpenAlbum}
      />
    )
  }

  if (activeView === 'mood' && selectedMood) {
    return (
      <MoodDetailView
        mood={selectedMood}
        onBack={onBack}
        onOpenSong={onOpenSong}
      />
    )
  }

  if (activeView === 'podcast-show' && selectedPodcastShowId) {
    return (
      <PodcastShowPage
        showId={selectedPodcastShowId}
        onBack={onBack}
        onPlayPodcastEpisode={onPlayPodcastEpisode ?? (() => {})}
        ArtworkImage={ArtworkImage}
      />
    )
  }

  if (activeView === 'audiobook-book' && selectedAudiobookId) {
    return (
      <AudiobookBookPage
        bookId={selectedAudiobookId}
        onBack={onBack}
        onPlayAudiobookChapter={onPlayAudiobookChapter ?? (() => {})}
        ArtworkImage={ArtworkImage}
      />
    )
  }

  return (
    <PageContent
      page={activePage}
      activeNavKey={activeNavKey}
      onOpenSong={onOpenSong}
      onOpenAlbum={onOpenAlbum}
      onOpenArtist={onOpenArtist}
      onOpenMood={onOpenMood}
      discoverQuery={discoverQuery}
      setDiscoverQuery={setDiscoverQuery}
      albumsQuery={albumsQuery}
      setAlbumsQuery={setAlbumsQuery}
      onPlaylistBack={onPlaylistBack}
      onNavigateNav={onNavigateNav}
      onOpenPlayerByStyle={onOpenPlayerByStyle}
      recentQuery={recentQuery}
      downloadsQuery={downloadsQuery}
      playlistsQuery={playlistsQuery}
      setPlaylistsQuery={setPlaylistsQuery}
      libraryQuery={libraryQuery}
      radioQuery={radioQuery}
      podcastsQuery={podcastsQuery}
      audiobooksQuery={audiobooksQuery}
      tvQuery={tvQuery}
      onPlayRadioStation={onPlayRadioStation}
      onPlayTvChannel={onPlayTvChannel}
      onOpenPodcastShow={onOpenPodcastShow}
      onOpenAudiobookBook={onOpenAudiobookBook}
      onPlayPodcastEpisode={onPlayPodcastEpisode}
      onPlayAudiobookChapter={onPlayAudiobookChapter}
    />
  )
}

function PageContent({
  page,
  activeNavKey,
  onOpenSong,
  onOpenAlbum,
  onOpenArtist,
  onOpenMood: _onOpenMood,
  discoverQuery,
  setDiscoverQuery,
  albumsQuery,
  setAlbumsQuery,
  onPlaylistBack,
  onNavigateNav,
  onOpenPlayerByStyle,
  recentQuery = '',
  downloadsQuery = '',
  playlistsQuery = '',
  setPlaylistsQuery,
  libraryQuery = '',
  radioQuery = '',
  podcastsQuery = '',
  audiobooksQuery = '',
  tvQuery = '',
  onPlayRadioStation,
  onPlayTvChannel,
  onOpenPodcastShow,
  onOpenAudiobookBook,
  onPlayPodcastEpisode,
  onPlayAudiobookChapter,
}: {
  page: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenPodcastShow?: (showId: string) => void
  onOpenAudiobookBook?: (bookId: string) => void
  onPlayPodcastEpisode?: (
    episode: PodcastEpisodeMeta,
    queue: PodcastEpisodeMeta[],
    startIndex: number,
    queueTitle: string,
    options?: {
      show?: PodcastShowMeta | null
      resumePositionSeconds?: number | null
    },
  ) => void
  onPlayAudiobookChapter?: PlayAudiobookChapterHandler
  discoverQuery: string
  setDiscoverQuery: (value: string) => void
  albumsQuery: string
  setAlbumsQuery: (value: string) => void
  onPlaylistBack: () => void
  onNavigateNav: (navKey: NavKey) => void
  onOpenPlayerByStyle: (style: NowPlayingStyle) => void
  recentQuery?: string
  downloadsQuery?: string
  playlistsQuery?: string
  setPlaylistsQuery?: (value: string) => void
  libraryQuery?: string
  radioQuery?: string
  podcastsQuery?: string
  audiobooksQuery?: string
  tvQuery?: string
  onPlayRadioStation?: (
    station: RadioStationMeta,
    queue: RadioStationMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
  onPlayTvChannel?: (
    channel: TvChannelMeta,
    queue: TvChannelMeta[],
    startIndex: number,
    queueTitle: string,
  ) => void
}) {
  void _onOpenMood
  void onPlaylistBack
  if (activeNavKey === 'liked') return <LikedPage onOpenSong={onOpenSong} />
  if (activeNavKey === 'recent') return <RecentPage onOpenSong={onOpenSong} query={recentQuery} />
  if (activeNavKey === 'downloads') {
    return <DownloadsPage onOpenSong={onOpenSong} query={downloadsQuery} />
  }
  if (activeNavKey === 'premium') return <PremiumPage onNavigateNav={onNavigateNav} />

  switch (page) {
    case 'home':
      return (
        <HomePage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          onBrowseSearch={(query) => {
            setDiscoverQuery(query)
            onNavigateNav('search')
          }}
        />
      )
    case 'radio':
      return (
        <RadioPage
          query={radioQuery ?? ''}
          onPlayRadioStation={onPlayRadioStation ?? (() => {})}
          ArtworkImage={ArtworkImage}
        />
      )
    case 'podcasts':
      return (
        <PodcastsPage
          query={podcastsQuery ?? ''}
          onOpenPodcastShow={onOpenPodcastShow ?? (() => {})}
          onPlayPodcastEpisode={onPlayPodcastEpisode ?? (() => {})}
          ArtworkImage={ArtworkImage}
        />
      )
    case 'audiobooks':
      return (
        <AudiobooksPage
          query={audiobooksQuery ?? ''}
          onOpenBook={onOpenAudiobookBook ?? (() => {})}
          onPlayAudiobookChapter={onPlayAudiobookChapter ?? (() => {})}
          ArtworkImage={ArtworkImage}
        />
      )
    case 'discover':
      return (
        <DiscoverPage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          query={discoverQuery}
          setQuery={setDiscoverQuery}
        />
      )
    case 'mood':
      return <EmotionalWorldsPage onOpenSong={onOpenSong} />
    case 'library':
      return (
        <LibraryPage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          query={libraryQuery}
          setPlaylistsQuery={setPlaylistsQuery}
        />
      )
    case 'artists':
      return (
        <ArtistsPage
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onOpenSong={onOpenSong}
        />
      )
    case 'albums':
      return (
        <AlbumsPage
          onOpenAlbum={onOpenAlbum}
          query={albumsQuery}
          setQuery={setAlbumsQuery}
        />
      )
    case 'playlists':
      return (
        <PlaylistsPage
          onOpenSong={onOpenSong}
          query={playlistsQuery}
          setQuery={setPlaylistsQuery}
        />
      )
    case 'tv':
      return (
        <TvPage
          query={tvQuery ?? ''}
          onPlayTvChannel={onPlayTvChannel ?? (() => {})}
          ArtworkImage={ArtworkImage}
        />
      )
    case 'settings':
      return <SettingsPage onOpenPlayerByStyle={onOpenPlayerByStyle} />
    default:
      return (
        <HomePage
          onOpenSong={onOpenSong}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          onNavigateNav={onNavigateNav}
          onBrowseSearch={(query) => {
            setDiscoverQuery(query)
            onNavigateNav('search')
          }}
        />
      )
  }
}

function App() {
  return (
    <PreferencesResetProvider>
      <DesktopPlaybackProvider>
        <AtmosphereProvider>
          <PremiumAudioVisualizerProvider>
            <CatalogProvider>
              <AppShell />
            </CatalogProvider>
          </PremiumAudioVisualizerProvider>
        </AtmosphereProvider>
      </DesktopPlaybackProvider>
    </PreferencesResetProvider>
  )
}

function AppShell() {
  const { currentTrack, currentQueue, currentIndex, playQueue, isPlaying, isLoading } = useDesktopPlayback()
  const hasQueueRail = currentIndex >= 0
    && currentQueue.length > 0
    && Boolean(currentTrack ?? currentQueue[currentIndex])
  const { songs } = useCatalog()
  const songsById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])
  const [activePage, setActivePage] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.activePage,
    'home' as PageId,
    parseStoredPageId,
  )
  const [activeNavKey, setActiveNavKey] = useState<NavKey>(() => resolveDefaultNavKey(activePage))
  const [activeView, setActiveView] = useState<ActiveView>('page')
  const [selectedSong, setSelectedSong] = useState<ApiSong | null>(null)
  const [selectedAlbum, setSelectedAlbum] = useState<ApiAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<ApiArtist | null>(null)
  const [selectedMood, setSelectedMood] = useState<MoodRoom | null>(null)
  const [selectedPodcastShowId, setSelectedPodcastShowId] = useState<string | null>(null)
  const [selectedAudiobookId, setSelectedAudiobookId] = useState<string | null>(null)
  const [desktopSelectedTrack, setDesktopSelectedTrack] = useState<ApiSong | null>(null)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const {
    renderedPlayerStyle,
    overlayPhase,
    anyPlayerShellVisible,
    openPlayerByStyle: setOpenPlayerStyle,
    closePlayerOverlay,
  } = usePlayerOverlayController()
  const [likedQuery, setLikedQuery] = useState('')
  const [recentQuery, setRecentQuery] = useState('')
  const [downloadsQuery, setDownloadsQuery] = useState('')
  const [playlistsQuery, setPlaylistsQuery] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [radioQuery, setRadioQuery] = useState('')
  const [podcastsQuery, setPodcastsQuery] = useState('')
  const [audiobooksQuery, setAudiobooksQuery] = useState('')
  const [tvQuery, setTvQuery] = useState('')
  const [discoverQuery, setDiscoverQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    '',
    parseStoredSearchTerm,
  )
  const [albumsQuery, setAlbumsQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSearch,
    '',
    parseStoredSearchTerm,
  )

  const anyPlayerOverlayOpen =
    anyPlayerShellVisible
    || lyricsOpen

  const openPlayerByStyle = useCallback((style: NowPlayingStyle) => {
    setLyricsOpen(false)
    setOpenPlayerStyle(style)
  }, [setOpenPlayerStyle])

  const playerPreferredTrack = currentTrack ?? desktopSelectedTrack

  const {
    cancelAutoOpenPlayer,
    openPreferredNowPlayingPage,
  } = useAutoOpenPreferredPlayer({
    isPlaying,
    isLoading,
    currentTrackId: currentTrack?.id ?? null,
    activePage,
    activeNavKey,
    activeView,
    anyPlayerOverlayOpen,
    openPlayerByStyle,
  })

  const openPlayerByStyleNow = useCallback((style: NowPlayingStyle) => {
    cancelAutoOpenPlayer()
    openPlayerByStyle(style)
  }, [cancelAutoOpenPlayer, openPlayerByStyle])

  const openCinemaPlayer = useCallback(() => {
    openPreferredNowPlayingPage()
  }, [openPreferredNowPlayingPage])

  const openSong = useCallback((song: ApiSong) => {
    setDesktopSelectedTrack(song)
    setSelectedSong(song)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setSelectedPodcastShowId(null)
    setSelectedAudiobookId(null)
    setActiveView('song')
  }, [])

  useEffect(() => {
    if (!currentTrack) return
    setDesktopSelectedTrack(currentTrack)
    setSelectedSong((previousSong) => (
      activeView === 'song' ? currentTrack : previousSong
    ))
  }, [activeView, currentTrack])

  const selectAndPlay = useCallback(
    (
      song: ApiSong,
      queue: ApiSong[] = [song],
      startIndex = 0,
      context: QueueContext = 'manual',
      queueTitle?: string,
      seedMetadata?: QueueSeedMetadata,
    ) => {
      const resolved = songsById.get(song.id) ?? song
      const playableQueue = queue.length > 0
        ? queue.map((entry) => songsById.get(entry.id) ?? entry)
        : [resolved]
      const selectedIndex = playableQueue.findIndex((entry) => entry.id === resolved.id)
      const safeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, Math.min(startIndex, playableQueue.length - 1))

      playQueue(playableQueue, safeIndex, context, queueTitle, seedMetadata)
      startTransition(() => {
        openSong(resolved)
      })
    },
    [openSong, playQueue, songsById],
  )

  const playRadioStation = useCallback(
    (
      _station: RadioStationMeta,
      queue: RadioStationMeta[],
      startIndex: number,
      queueTitle: string,
    ) => {
      const apiQueue = buildRadioQueueSongs(queue)
      if (apiQueue.length === 0) return

      const safeIndex = Math.max(0, Math.min(startIndex, apiQueue.length - 1))
      const track = apiQueue[safeIndex]
      setDesktopSelectedTrack(track)
      playQueue(apiQueue, safeIndex, 'radio', queueTitle, {
        seedType: 'manual',
        seedTracks: apiQueue,
      })
    },
    [playQueue],
  )

  const playPodcastEpisode = useCallback(
    (
      _episode: PodcastEpisodeMeta,
      queue: PodcastEpisodeMeta[],
      startIndex: number,
      queueTitle: string,
      options?: {
        show?: PodcastShowMeta | null
        resumePositionSeconds?: number | null
      },
    ) => {
      const showMap = new Map<string, PodcastShowMeta>()
      if (options?.show?.id) {
        showMap.set(options.show.id, options.show)
      }

      const apiQueue = buildPodcastQueueSongs(
        queue,
        showMap.size > 0 ? showMap : undefined,
      )
      if (apiQueue.length === 0) return

      const safeIndex = Math.max(0, Math.min(startIndex, apiQueue.length - 1))
      const track = apiQueue[safeIndex]
      setDesktopSelectedTrack(track)
      setPendingPodcastResumeSeconds(options?.resumePositionSeconds ?? null)
      playQueue(apiQueue, safeIndex, 'podcast', queueTitle, {
        seedType: 'manual',
        seedTracks: apiQueue,
      })
    },
    [playQueue],
  )

  const playAudiobookChapter = useCallback<PlayAudiobookChapterHandler>(
    (
      book: AudiobookBookMeta,
      _chapter: AudiobookChapterMeta,
      queue: AudiobookChapterMeta[],
      startIndex: number,
      queueTitle: string,
      options?: {
        resumePositionSeconds?: number | null
      },
    ) => {
      const apiQueue = buildAudiobookQueueSongs(book, queue)
      if (apiQueue.length === 0) return

      const safeIndex = Math.max(0, Math.min(startIndex, apiQueue.length - 1))
      const track = apiQueue[safeIndex]
      setDesktopSelectedTrack(track)
      setPendingAudiobookResumeSeconds(options?.resumePositionSeconds ?? null)
      playQueue(apiQueue, safeIndex, 'audiobook', queueTitle, {
        seedType: 'manual',
        seedTracks: apiQueue,
      })
    },
    [playQueue],
  )

  const playTvChannel = useCallback(
    (
      _channel: TvChannelMeta,
      queue: TvChannelMeta[],
      startIndex: number,
      queueTitle: string,
    ) => {
      const apiQueue = buildTvQueueSongs(queue)
      if (apiQueue.length === 0) return

      const safeIndex = Math.max(0, Math.min(startIndex, apiQueue.length - 1))
      const track = apiQueue[safeIndex]
      setDesktopSelectedTrack(track)
      playQueue(apiQueue, safeIndex, 'tv', queueTitle, {
        seedType: 'manual',
        seedTracks: apiQueue,
      })
    },
    [playQueue],
  )

  const openAlbum = useCallback((album: ApiAlbum) => {
    cancelAutoOpenPlayer()
    setSelectedAlbum(album)
    setSelectedSong(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setSelectedPodcastShowId(null)
    setSelectedAudiobookId(null)
    setActiveView('album')
  }, [cancelAutoOpenPlayer])

  const openArtist = useCallback((artist: ApiArtist) => {
    cancelAutoOpenPlayer()
    setSelectedArtist(artist)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedMood(null)
    setSelectedPodcastShowId(null)
    setSelectedAudiobookId(null)
    setActiveView('artist')
  }, [cancelAutoOpenPlayer])

  const openMood = useCallback((mood: MoodRoom) => {
    cancelAutoOpenPlayer()
    setSelectedMood(mood)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedPodcastShowId(null)
    setSelectedAudiobookId(null)
    setActiveView('mood')
  }, [cancelAutoOpenPlayer])

  const openPodcastShow = useCallback((showId: string) => {
    cancelAutoOpenPlayer()
    const cleanId = showId.trim()
    if (!cleanId) return
    setSelectedPodcastShowId(cleanId)
    setSelectedAudiobookId(null)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('podcast-show')
  }, [cancelAutoOpenPlayer])

  const openAudiobookBook = useCallback((bookId: string) => {
    cancelAutoOpenPlayer()
    const cleanId = bookId.trim()
    if (!cleanId) return
    setSelectedAudiobookId(cleanId)
    setSelectedPodcastShowId(null)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('audiobook-book')
  }, [cancelAutoOpenPlayer])

  const backToPage = useCallback(() => {
    setActiveView('page')
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setSelectedPodcastShowId(null)
    setSelectedAudiobookId(null)
  }, [])

  const navigateNav = useCallback((navKey: NavKey) => {
    cancelAutoOpenPlayer()
    const page = resolvePageFromNavKey(navKey)
    setActivePage(page)
    setActiveNavKey(navKey)
    backToPage()
  }, [backToPage, cancelAutoOpenPlayer, setActivePage])

  const navigatePage = useCallback((page: PageId, navKey?: NavKey) => {
    cancelAutoOpenPlayer()
    setActivePage(page)
    setActiveNavKey(navKey ?? resolveDefaultNavKey(page))
    backToPage()
  }, [backToPage, cancelAutoOpenPlayer, setActivePage])

  const backToPageWithCancel = useCallback(() => {
    cancelAutoOpenPlayer()
    backToPage()
  }, [backToPage, cancelAutoOpenPlayer])

  return (
    <>
      <div className="app-shell">
        <Sidebar activeNavKey={activeNavKey} onNavigateNav={navigateNav} />
        <div className="main-area">
          <div
            className="main-composition"
            data-queue-expanded={hasQueueRail ? 'true' : 'false'}
          >
            <main
              className={`main-scroll${
                activeNavKey === 'home' && activeView === 'page' ? ' main-scroll--home' : ''
              }${
                activeNavKey === 'worlds' && activeView === 'page' ? ' main-scroll--mood' : ''
              }${
                isPsdDestinationNav(activeNavKey) && activeView === 'page' ? ' main-scroll--psd' : ''
              }${
                activeView === 'song' ? ' main-scroll--player-workspace' : ''
              }`}
            >
              {isPsdDestinationNav(activeNavKey) && activeView === 'page' ? (
                <HomeTopBar
                  placeholder={TOP_BAR_PLACEHOLDERS[activeNavKey]}
                  onOpenDiscover={() => navigatePage('discover', 'search')}
                  onSearchSubmit={(query) => {
                    if (activeNavKey === 'home' && query) {
                      setDiscoverQuery(query)
                    }
                  }}
                  variant={
                    activeNavKey === 'search'
                      || activeNavKey === 'albums'
                      || activeNavKey === 'liked'
                      || activeNavKey === 'library'
                      || activeNavKey === 'recent'
                      || activeNavKey === 'downloads'
                      || activeNavKey === 'playlists'
                      || activeNavKey === 'radio'
                      || activeNavKey === 'podcasts'
                      || activeNavKey === 'audiobooks'
                      || activeNavKey === 'tv'
                      ? 'search'
                      : 'default'
                  }
                  searchValue={
                    activeNavKey === 'search'
                      ? discoverQuery
                      : activeNavKey === 'albums'
                        ? albumsQuery
                        : activeNavKey === 'liked'
                          ? likedQuery
                          : activeNavKey === 'library'
                            ? libraryQuery
                            : activeNavKey === 'recent'
                              ? recentQuery
                              : activeNavKey === 'downloads'
                                ? downloadsQuery
                                : activeNavKey === 'playlists'
                                  ? playlistsQuery
                                  : activeNavKey === 'radio'
                                    ? radioQuery
                                    : activeNavKey === 'podcasts'
                                      ? podcastsQuery
                                      : activeNavKey === 'audiobooks'
                                        ? audiobooksQuery
                                        : activeNavKey === 'tv'
                                          ? tvQuery
                                  : undefined
                  }
                  onSearchChange={
                    activeNavKey === 'search'
                      ? setDiscoverQuery
                      : activeNavKey === 'albums'
                        ? setAlbumsQuery
                        : activeNavKey === 'liked'
                          ? setLikedQuery
                          : activeNavKey === 'library'
                            ? setLibraryQuery
                            : activeNavKey === 'recent'
                              ? setRecentQuery
                              : activeNavKey === 'downloads'
                                ? setDownloadsQuery
                                : activeNavKey === 'playlists'
                                  ? setPlaylistsQuery
                                  : activeNavKey === 'radio'
                                    ? setRadioQuery
                                    : activeNavKey === 'podcasts'
                                      ? setPodcastsQuery
                                      : activeNavKey === 'audiobooks'
                                        ? setAudiobooksQuery
                                        : activeNavKey === 'tv'
                                          ? setTvQuery
                                  : undefined
                  }
                />
              ) : null}
              {!isPsdDestinationNav(activeNavKey) ? <CatalogStatusBar /> : null}
              <CatalogStaleBanner />
              <div className="page-view" data-page={activePage} data-nav={activeNavKey} data-view={activeView}>
                <CatalogDetailRouter
                  activeView={activeView}
                  selectedSong={selectedSong}
                  selectedAlbum={selectedAlbum}
                  selectedArtist={selectedArtist}
                  selectedMood={selectedMood}
                  selectedPodcastShowId={selectedPodcastShowId}
                  selectedAudiobookId={selectedAudiobookId}
                  desktopSelectedTrack={desktopSelectedTrack}
                  onBack={backToPageWithCancel}
                  activePage={activePage}
                  activeNavKey={activeNavKey}
                  onOpenSong={selectAndPlay}
                  onOpenAlbum={openAlbum}
                  onOpenArtist={openArtist}
                  onOpenMood={openMood}
                  onOpenPodcastShow={openPodcastShow}
                  onOpenAudiobookBook={openAudiobookBook}
                  onOpenCinema={openCinemaPlayer}
                  discoverQuery={discoverQuery}
                  setDiscoverQuery={setDiscoverQuery}
                  albumsQuery={albumsQuery}
                  setAlbumsQuery={setAlbumsQuery}
                  onPlaylistBack={() => navigateNav('library')}
                  onNavigateNav={navigateNav}
                  onOpenPlayerByStyle={openPlayerByStyleNow}
                  recentQuery={recentQuery}
                  downloadsQuery={downloadsQuery}
                  playlistsQuery={playlistsQuery}
                  setPlaylistsQuery={setPlaylistsQuery}
                  libraryQuery={libraryQuery}
                  radioQuery={radioQuery}
                  podcastsQuery={podcastsQuery}
                  audiobooksQuery={audiobooksQuery}
                  tvQuery={tvQuery}
                  onPlayRadioStation={playRadioStation}
                  onPlayTvChannel={playTvChannel}
                  onPlayPodcastEpisode={playPodcastEpisode}
                  onPlayAudiobookChapter={playAudiobookChapter}
                />
              </div>
            </main>
            {activeNavKey === 'tv' ? (
              <TvNowPlayingPanel
                onBrowseAll={() => navigateNav('tv')}
                onBrowseFeatured={() => navigateNav('tv')}
              />
            ) : (
              <QueueUpNextPanel
                onOpenPlayerByStyle={openPlayerByStyleNow}
                onNavigateNav={navigateNav}
                activeNavKey={activeNavKey}
              />
            )}
          </div>
        </div>
      </div>
      {!lyricsOpen && !anyPlayerShellVisible && activeNavKey !== 'recent' ? (
        <PlayerBar
          track={playerPreferredTrack}
          onOpenPlayerByStyle={openPlayerByStyleNow}
        />
      ) : null}
      {(anyPlayerShellVisible || lyricsOpen) ? (
        <PremiumFullscreenShell
          preferredTrack={playerPreferredTrack}
          activePlayerMode={renderedPlayerStyle ?? getPreferredNowPlayingStyle()}
          overlayPhase={overlayPhase}
          onSwitchPlayerMode={openPlayerByStyleNow}
          onClose={() => {
            if (lyricsOpen) setLyricsOpen(false)
            closePlayerOverlay()
          }}
          initialTab={lyricsOpen ? 'lyrics' : 'queue'}
        />
      ) : null}
    </>
  )
}

export default App
