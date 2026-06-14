import {
  createContext,
  memo,
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
  buildCatalogIndexes,
  buildQueueSeedPool,
  CATALOG_DETAIL_TRACK_PREVIEW_LIMIT,
  capSongPool,
  resolveAlbumArtwork,
  resolveAlbumDisplayArtist,
  resolveAlbumsForArtist,
  resolveSongsForAlbum,
  resolveSongsForArtist,
  resolveSongsForMoodRoom,
  type CatalogIndexes,
} from './lib/catalogIndexes'
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
import { VisualSceneBackdrop } from './components/VisualSceneBackdrop'
import { PremiumAudioVisualizerProvider } from './components/PremiumAudioVisualizerProvider'
import { PremiumCinematicWaveform } from './components/PremiumCinematicWaveform'
import { PremiumReactiveWaveform } from './components/PremiumReactiveWaveform'
import {
  DesktopPlaybackProvider,
  useDesktopPlayback,
} from './context/DesktopPlaybackProvider'
import type { QueueContext, QueueSeedMetadata } from './lib/desktopPlayback/types'
import {
  resolveVisualScene,
  type VisualSceneId,
} from './lib/visualScenes'
import {
  analyzeQueueSnapshot,
  describeQueueInsight,
} from './lib/queueSnapshot'
import {
  buildEmotionalLanes,
  filterSongsByEmotionalLane,
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
  buildListeningContext,
  deriveListeningAtmosphere,
  type ListeningContextLines,
} from './lib/listeningContext'
import heroPhotoUrl from './assets/hero.png'
import emotionalWorldsReferenceUrl from './assets/emotional-worlds-reference.jpg'
import psdPlaylistReferenceUrl from './assets/psd-playlist-reference.jpg'
import psdArtistsReferenceUrl from './assets/psd-artists-reference.jpg'
import psdAlbumsReferenceUrl from './assets/psd-albums-reference.png'
import psdLikedReferenceUrl from './assets/psd-liked-reference.jpg'
import psdSearchReferenceUrl from './assets/psd-search-reference.jpg'
import psdPlayerMasterReferenceUrl from './assets/psd-player-master-reference.jpg'
import psdPlayer2ReferenceUrl from './assets/psd-player2-reference.jpg'
import psdPlayer3ReferenceUrl from './assets/psd-player3-reference.jpg'
import psdPlayer4ReferenceUrl from './assets/psd-player4-reference.jpg'
import psdWaveformReferenceUrl from './assets/psd-waveform-reference.jpg'
import psdLyricsReferenceUrl from './assets/psd-lyrics-reference.jpg'
import psdRecentReferenceUrl from './assets/psd-recent-reference.jpg'
import psdNowPlayingReferenceUrl from './assets/psd-now-playing-reference.png'
import psdDownloadsReferenceUrl from './assets/psd-downloads-reference.jpg'
import psdLibraryReferenceUrl from './assets/psd-library-reference.jpg'
import './App.css'

const PSD_SEARCH_QUERY = 'midnight reflection'

const PSD_SEARCH_TOP_RESULT = {
  title: 'Midnight Reflection',
  artist: 'Wills Afrobeats',
  duration: '3:56',
  badges: ['SONG', 'FLAC', '24-bit', '48kHz'] as const,
}

const PSD_SEARCH_SONG_ROWS = [
  { key: 'psd-song-1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', badge: 'FLAC', duration: '3:56', active: true },
  { key: 'psd-song-2', title: 'Midnight Reflections', artist: 'Omari Lay', badge: 'FLAC', duration: '4:12', active: false },
  { key: 'psd-song-3', title: 'Reflection (Midnight Mix)', artist: 'Tems', badge: '24-bit', duration: '3:28', active: false },
  { key: 'psd-song-4', title: 'Midnight Reflections', artist: 'SZA', badge: 'FLAC', duration: '4:01', active: false },
  { key: 'psd-song-5', title: 'Late Night Reflection', artist: 'Joeboy', badge: '24-bit', duration: '3:44', active: false },
] as const

const PSD_SEARCH_ARTIST_ROWS = [
  { key: 'psd-artist-1', name: 'Wills Afrobeats', verified: true },
  { key: 'psd-artist-2', name: 'Midnight Reflection Band', verified: false },
] as const

const PSD_SEARCH_ALBUM_ROWS = [
  { key: 'psd-album-1', title: 'Midnight Reflection', meta: 'Wills Afrobeats • 2024' },
  { key: 'psd-album-2', title: 'Reflections at Midnight', meta: 'Various Artists • 2023' },
] as const

const PSD_LIBRARY_TABS = ['Overview', 'Songs', 'Albums', 'Artists', 'Playlists', 'Podcasts', 'Genres'] as const

const PSD_LIBRARY_STATS = [
  { key: 'songs', label: 'Songs', value: '1,248', hint: 'All Songs', tone: 'violet' },
  { key: 'albums', label: 'Albums', value: '156', hint: 'In Collection', tone: 'purple' },
  { key: 'artists', label: 'Artists', value: '89', hint: 'Followed', tone: 'orange' },
  { key: 'playlists', label: 'Playlists', value: '32', hint: 'Created', tone: 'pink' },
  { key: 'liked', label: 'Liked Songs', value: '482', hint: 'Favorites', tone: 'magenta' },
] as const

const PSD_LIBRARY_RECENT = [
  { title: 'Midnight Reflection', artist: 'Wills Afrobeats', tone: 'violet', artPosition: '6% 72%' },
  { title: 'Afro Sunset', artist: 'Wills Afrobeats', tone: 'sunset', artPosition: '18% 72%' },
  { title: 'Healing Slowly', artist: 'Wills Afrobeats', tone: 'moon', artPosition: '30% 72%' },
  { title: 'Night Drive', artist: 'Wills Afrobeats', tone: 'neon', artPosition: '42% 72%' },
  { title: 'Jazz Café', artist: 'Wills Afrobeats', tone: 'jazz', artPosition: '54% 72%' },
  { title: 'Love Vibes', artist: 'Wills Afrobeats', tone: 'love', artPosition: '66% 72%' },
] as const

const PSD_LIBRARY_PLAYLISTS = [
  { title: 'Deep Focus', count: '22 songs', tone: 'forest', artPosition: '6% 88%' },
  { title: 'Afro Vibes', count: '28 songs', tone: 'afro', artPosition: '18% 88%' },
  { title: 'Chill & Relax', count: '40 songs', tone: 'lounge', artPosition: '30% 88%' },
  { title: 'Workout Mix', count: '25 songs', tone: 'run', artPosition: '42% 88%' },
  { title: 'Late Night Drive', count: '19 songs', tone: 'drive', artPosition: '54% 88%' },
  { title: 'Rainy Day Comfort', count: '31 songs', tone: 'rain', artPosition: '66% 88%' },
] as const

const PSD_PLAYLIST_TITLE = 'Night Drive'
const PSD_PLAYLIST_DESCRIPTION = 'Late nights, open roads and the perfect soundtrack.'
const PSD_PLAYLIST_OWNER = 'Hidden Tunes'
const PSD_PLAYLIST_META = '50 songs • 3h 12m'
const PSD_PLAYLIST_FOOTER_META = '50 songs, 3h 12m'
const PSD_PLAYLIST_HERO_ART = '14% 24%'

const PSD_PLAYLIST_TRACK_ROWS = [
  { key: 'pt1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', duration: '3:56', active: true, artPosition: '8% 58%' },
  { key: 'pt2', title: 'Afro Sunset', artist: 'Wills Afrobeats', duration: '3:21', artPosition: '18% 58%' },
  { key: 'pt3', title: 'Love Vibes', artist: 'Wills Afrobeats', duration: '3:44', artPosition: '28% 58%' },
  { key: 'pt4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', duration: '4:12', artPosition: '38% 58%' },
  { key: 'pt5', title: 'Night Drive', artist: 'Wills Afrobeats', duration: '4:01', artPosition: '48% 58%' },
  { key: 'pt6', title: 'Healing Slowly', artist: 'Wills Afrobeats', duration: '3:48', artPosition: '58% 58%' },
  { key: 'pt7', title: 'Jazz Café', artist: 'Wills Afrobeats', duration: '3:36', artPosition: '68% 58%' },
  { key: 'pt8', title: 'Deep Focus', artist: 'Wills Afrobeats', duration: '4:20', artPosition: '78% 58%' },
] as const

const PSD_PLAYLIST_RAIL_ART_POSITION = PSD_PLAYLIST_TRACK_ROWS[0].artPosition

const PSD_PLAYLIST_UP_NEXT_ROWS = PSD_PLAYLIST_TRACK_ROWS.slice(1, 5)

const PSD_PLAYLIST_STATS_ROWS = [
  { value: '50', label: 'Songs' },
  { value: '3h 12m', label: 'Duration' },
  { value: '12', label: 'Albums' },
] as const
const PSD_PLAYLIST_STATS_UPDATED = 'May 12, 2024'

const PSD_WAVEFORM_HEIGHTS = [5, 9, 13, 7, 15, 11, 17, 9, 13, 19, 11, 15, 9, 13, 17, 11, 9, 15, 13, 9, 11, 15, 9, 7, 12, 16, 10, 14, 8, 12, 18, 10, 14, 8, 6] as const

const PSD_ARTIST_NAME = 'Wills Afrobeats'
const PSD_ARTIST_STATS = '2.4M Monthly Listeners • 24 Songs'
const PSD_ARTIST_BIO =
  'Wills Afrobeats is a soulful storyteller blending Afrobeat rhythms with modern sounds. His music captures the pulse of Lagos nights and the warmth of golden-hour reflection.'

const PSD_ARTIST_POPULAR_ROWS = [
  { key: 'ap1', rank: 1, title: 'Midnight Reflection', streams: '92.3M', duration: '3:56', explicit: true },
  { key: 'ap2', rank: 2, title: 'Afro Sunset', streams: '78.6M', duration: '3:21', explicit: true },
  { key: 'ap3', rank: 3, title: 'Love Vibes', streams: '65.4M', duration: '3:44', explicit: true },
  { key: 'ap4', rank: 4, title: 'Rain & Reflection', streams: '54.2M', duration: '4:12', explicit: true },
  { key: 'ap5', rank: 5, title: 'Night Drive', streams: '48.8M', duration: '4:01', explicit: true },
] as const

const PSD_ARTIST_ALBUM_CARDS = [
  { key: 'aa1', title: 'Reflections At Midnight', artist: 'Wills Afrobeats', year: '2024', songs: '12 songs' },
  { key: 'aa2', title: 'Afro Sunrise', artist: 'Wills Afrobeats', year: '2023', songs: '10 songs' },
  { key: 'aa3', title: 'Vibes from Lagos', artist: 'Wills Afrobeats', year: '2023', songs: '14 songs' },
  { key: 'aa4', title: 'Love & Rhythm', artist: 'Wills Afrobeats', year: '2022', songs: '11 songs' },
  { key: 'aa5', title: 'The Beginning', artist: 'Wills Afrobeats', year: '2021', songs: '9 songs' },
] as const

const PSD_ALBUMS_SUBTITLE = 'All albums in your library.'
const PSD_ALBUMS_FOOTER_COUNT = '24 albums'
const PSD_ALBUMS_RAIL_TITLE = 'Falling Slowly'
const PSD_ALBUMS_RAIL_ARTIST = 'Wills Afrobeats'
const PSD_ALBUMS_RAIL_ART_POSITION = '50% 22%'

const PSD_ALBUMS_UP_NEXT_ROWS = [
  { key: 'au1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', duration: '3:56', artPosition: '10% 58%' },
  { key: 'au2', title: 'Afro Sunset', artist: 'Wills Afrobeats', duration: '3:21', artPosition: '18% 58%' },
  { key: 'au3', title: 'Love Vibes', artist: 'Wills Afrobeats', duration: '3:44', artPosition: '26% 58%' },
  { key: 'au4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', duration: '4:12', artPosition: '34% 58%' },
] as const

const PSD_ALBUM_STATS_ROWS = [
  { value: '24', label: 'Albums' },
  { value: '196', label: 'Songs' },
  { value: '18h 42m', label: 'Total Time' },
] as const
const PSD_ALBUM_STATS_UPDATED = 'May 12, 2024'

const PSD_ALBUMS_GRID_CARDS = [
  { key: 'alb1', title: 'Reflections at Midnight', artist: 'Wills Afrobeats', year: '2024', songs: '12 songs', artPosition: '8% 24%' },
  { key: 'alb2', title: 'Afro Sunrise', artist: 'Wills Afrobeats', year: '2023', songs: '10 songs', artPosition: '22% 24%' },
  { key: 'alb3', title: 'Vibes from Lagos', artist: 'Wills Afrobeats', year: '2023', songs: '14 songs', artPosition: '36% 24%' },
  { key: 'alb4', title: 'Love & Rhythm', artist: 'Wills Afrobeats', year: '2022', songs: '11 songs', artPosition: '50% 24%' },
  { key: 'alb5', title: 'The Beginning', artist: 'Wills Afrobeats', year: '2021', songs: '9 songs', artPosition: '64% 24%' },
  { key: 'alb6', title: 'Jazz Café', artist: 'Wills Afrobeats', year: '2020', songs: '8 songs', artPosition: '78% 24%' },
  { key: 'alb7', title: 'Deep Focus', artist: 'Wills Afrobeats', year: '2019', songs: '15 songs', artPosition: '8% 58%' },
  { key: 'alb8', title: 'Moments of Us', artist: 'Wills Afrobeats', year: '2018', songs: '7 songs', artPosition: '22% 58%' },
  { key: 'alb9', title: 'Rainy Day Comfort', artist: 'Wills Afrobeats', year: '2017', songs: '13 songs', artPosition: '36% 58%' },
  { key: 'alb10', title: 'Live in Accra', artist: 'Wills Afrobeats', year: '2016', songs: '6 songs', artPosition: '50% 58%' },
] as const

const PSD_PLAYER_TITLE = 'Midnight Reflection'
const PSD_PLAYER_ARTIST = 'Wills Afrobeats'
const PSD_PLAYER_SOURCE_ALBUM = 'Night Drive'
const PSD_PLAYER_POSITION_SECONDS = 108
const PSD_PLAYER_DURATION_SECONDS = 236
const PSD_PLAYER_MASTER_BG_POSITION = '50% 50%'
const PSD_PLAYER_MASTER_ART_POSITION = '18% 46%'
const PSD_PLAYER_TABS = ['LYRICS', 'QUEUE', 'DETAILS'] as const
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
const PSD_PLAYER2_BG_POSITION = '50% 42%'
const PSD_PLAYER2_ART_POSITION = '24% 52%'
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
const PSD_PLAYER3_BG_POSITION = '50% 46%'
const PSD_PLAYER3_ART_POSITION = '28% 54%'
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
  { key: 'p3-u1', title: 'Midnight Reflection', artist: 'Wills AfroBeats', active: true, artPosition: '18% 58%' },
  { key: 'p3-u2', title: 'Afro Sunset', artist: 'Wills AfroBeats', active: false, artPosition: '26% 58%' },
  { key: 'p3-u3', title: 'Lost in Dreams', artist: 'Wills AfroBeats', active: false, artPosition: '34% 58%' },
  { key: 'p3-u4', title: 'Healing Slowly', artist: 'Wills AfroBeats', active: false, artPosition: '42% 58%' },
  { key: 'p3-u5', title: 'Night Drive', artist: 'Wills AfroBeats', active: false, artPosition: '50% 58%' },
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
const PSD_PLAYER4_BG_POSITION = '50% 44%'
const PSD_PLAYER4_ART_POSITION = '20% 50%'
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
  { key: 'p4-u1', title: 'Midnight Reflection', artist: 'Wills AfroBeats', duration: '3:56', active: true, artPosition: '18% 58%' },
  { key: 'p4-u2', title: 'Lost in Dreams', artist: 'Wills AfroBeats', duration: '4:12', active: false, artPosition: '26% 58%' },
  { key: 'p4-u3', title: 'City Lights', artist: 'Wills AfroBeats', duration: '3:28', active: false, artPosition: '34% 58%' },
  { key: 'p4-u4', title: 'After Hours', artist: 'Wills AfroBeats', duration: '4:01', active: false, artPosition: '42% 58%' },
  { key: 'p4-u5', title: 'Neon Skyline', artist: 'Wills AfroBeats', duration: '3:44', active: false, artPosition: '50% 58%' },
] as const
const PSD_PLAYER4_SOUND_MODES = [
  { key: 'atmos', label: 'DOLBY ATMOS' },
  { key: 'bass', label: 'BASS BOOST' },
  { key: 'spatial', label: 'SPATIAL AUDIO' },
] as const

const PSD_LIKED_META = '482 songs • 28h 47m'
const PSD_LIKED_DESCRIPTION = 'All your favorite tracks in one place.'

const PSD_LIKED_TABLE_ROWS = [
  { key: 'ls1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', album: 'Reflections at Midnight', dateAdded: 'May 12, 2024', duration: '3:56', active: true, artPosition: '10% 58%' },
  { key: 'ls2', title: 'Afro Sunset', artist: 'Wills Afrobeats', album: 'Afro Sunset', dateAdded: 'May 10, 2024', duration: '3:21', artPosition: '18% 58%' },
  { key: 'ls3', title: 'Love Vibes', artist: 'Wills Afrobeats', album: 'Love & Rhythm', dateAdded: 'May 9, 2024', duration: '3:44', artPosition: '26% 58%' },
  { key: 'ls4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', album: 'Rain & Reflection', dateAdded: 'May 8, 2024', duration: '4:12', artPosition: '34% 58%' },
  { key: 'ls5', title: 'Night Drive', artist: 'Wills Afrobeats', album: 'Vibes from Lagos', dateAdded: 'May 6, 2024', duration: '4:01', artPosition: '42% 58%' },
  { key: 'ls6', title: 'Healing Slowly', artist: 'Wills Afrobeats', album: 'The Beginning', dateAdded: 'May 5, 2024', duration: '3:48', artPosition: '50% 58%' },
  { key: 'ls7', title: 'Jazz Café', artist: 'Wills Afrobeats', album: 'Jazz Café', dateAdded: 'May 3, 2024', duration: '3:36', artPosition: '58% 58%' },
  { key: 'ls8', title: 'Deep Focus', artist: 'Wills Afrobeats', album: 'Deep Focus', dateAdded: 'May 1, 2024', duration: '4:20', artPosition: '66% 58%' },
  { key: 'ls9', title: 'Moments of Us', artist: 'Wills Afrobeats', album: 'Moments of Us', dateAdded: 'Apr 30, 2024', duration: '3:52', artPosition: '74% 58%' },
  { key: 'ls10', title: 'Lost In The Moment', artist: 'Zonkeelsy', album: 'Lost In The Moment', dateAdded: 'Apr 28, 2024', duration: '3:12', artPosition: '82% 58%' },
] as const

const PSD_RECENT_TABLE_ROWS = [
  { key: 'rp1', title: 'Falling Slowly', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '2 min ago', duration: '3:42', artPosition: '6% 58%' },
  { key: 'rp2', title: 'Midnight Reflection', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '8 min ago', duration: '3:56', artPosition: '14% 58%' },
  { key: 'rp3', title: 'Afro Sunset', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '15 min ago', duration: '3:21', artPosition: '22% 58%' },
  { key: 'rp4', title: 'Night Drive', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '24 min ago', duration: '4:01', artPosition: '30% 58%' },
  { key: 'rp5', title: 'Chill & Relax', subtitle: 'Playlist • 40 songs', artist: '', itemType: 'Playlist', played: '37 min ago', duration: '—', artPosition: '38% 58%' },
  { key: 'rp6', title: 'Healing Slowly', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '1 hour ago', duration: '3:48', artPosition: '46% 58%' },
  { key: 'rp7', title: 'Love Vibes', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '1 hour ago', duration: '3:44', artPosition: '54% 58%' },
  { key: 'rp8', title: 'Workout Mix', subtitle: 'Playlist • 25 songs', artist: '', itemType: 'Playlist', played: '2 hours ago', duration: '—', artPosition: '62% 58%' },
  { key: 'rp9', title: 'Live in Accra', subtitle: 'Wills Afrobeats', artist: '', itemType: 'Album', played: '3 hours ago', duration: '—', artPosition: '70% 58%' },
  { key: 'rp10', title: 'Rainy Day Comfort', subtitle: 'Wills Afrobeats', artist: 'Wills Afrobeats', itemType: 'Song', played: '4 hours ago', duration: '4:05', artPosition: '78% 58%' },
] as const

const PSD_RAIL_QUEUE_ROWS = [
  { key: 'rq1', title: 'Afro Sunset', artist: 'Wills Afrobeats', artPosition: '22% 58%' },
  { key: 'rq2', title: 'Love Vibes', artist: 'Wills Afrobeats', artPosition: '30% 58%' },
  { key: 'rq3', title: 'Rain & Reflection', artist: 'Wills Afrobeats', artPosition: '38% 58%' },
  { key: 'rq4', title: 'Jazz Café', artist: 'Wills Afrobeats', artPosition: '46% 58%' },
] as const
const PSD_RAIL_ART_POSITION = '50% 38%'

const PSD_DOWNLOADS_STORAGE_PERCENT = 72
const PSD_DOWNLOADS_PLAYLISTS = [
  { key: 'dw-pl1', title: 'Night Drive', meta: '50 songs • 3h 12m', artPosition: '42% 58%' },
  { key: 'dw-pl2', title: 'Chill Vibes', meta: '35 songs • 2h 17m', artPosition: '50% 58%' },
  { key: 'dw-pl3', title: 'Jazz Café', meta: '40 songs • 2h 45m', artPosition: '58% 58%' },
] as const
const PSD_DOWNLOADS_ALBUMS = [
  { key: 'dw-al1', title: 'Midnight Memories', artist: 'Wills Afrobeats', meta: '12 songs • 45 min', artPosition: '14% 58%' },
  { key: 'dw-al2', title: 'After Hours', artist: 'Wills Afrobeats', meta: '10 songs • 38 min', artPosition: '22% 58%' },
] as const
const PSD_DOWNLOADS_SONGS = [
  { key: 'dw-s1', title: 'Midnight Reflection', meta: 'Wills Afrobeats • Night Drive', artPosition: '10% 58%' },
  { key: 'dw-s2', title: 'Afro Sunset', meta: 'Wills Afrobeats • Night Drive', artPosition: '18% 58%' },
  { key: 'dw-s3', title: 'Love Vibes', meta: 'Wills Afrobeats • Night Drive', artPosition: '26% 58%' },
  { key: 'dw-s4', title: 'Healing Slowly', meta: 'Wills Afrobeats • Night Drive', artPosition: '34% 58%' },
  { key: 'dw-s5', title: 'Night Drive', meta: 'Wills Afrobeats • Night Drive', artPosition: '42% 58%' },
  { key: 'dw-s6', title: 'Rainy Day Comfort', meta: 'Wills Afrobeats • Night Drive', artPosition: '50% 58%' },
] as const
const PSD_DOWNLOADS_TABS = ['All', 'Playlists', 'Albums', 'Songs', 'Podcasts'] as const

const PSD_WAVEFORM_ALBUM = 'Reflections at Midnight'
const PSD_WAVEFORM_LYRICS = [
  'City lights paint the sky',
  'Dreams awake as I pass by',
] as const

const PSD_LYRICS_ALBUM = 'Reflections at Midnight'
const PSD_LYRICS_BG_POSITION = '62% 46%'
const PSD_LYRICS_ART_POSITION = '10% 58%'
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
const PSD_WAVEFORM_BG_POSITION = '50% 38%'

function PsdSocialIcon({ network }: { network: 'instagram' | 'twitter' | 'youtube' | 'spotify' }) {
  const paths: Record<typeof network, ReactNode> = {
    instagram: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    twitter: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.9 4.5h3.4l-7.5 8.6 8.8 11.4h-6.9l-5.4-7-6.2 7H2.7l8-9.2L2 4.5h7.1l4.8 6.4 5-6.4z" />
      </svg>
    ),
    youtube: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.6 7.2a2.5 2.5 0 00-1.8-1.8C17.9 5 12 5 12 5s-5.9 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8C6.1 19 12 19 12 19s5.9 0 7.8-.4a2.5 2.5 0 001.8-1.8 26 26 0 00.4-4.8 26 26 0 00-.4-4.8zM10 15.5V8.5l5.5 3.5L10 15.5z" />
      </svg>
    ),
    spotify: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 14.3c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.8-9.3-1-.4.1-.7-.2-.8-.5s.2-.7.5-.8c4.1-.9 7.6-.6 10.5 1.1.3.2.4.6.2.9zm1.6-3.2c-.2.4-.7.5-1 .3-2.9-1.7-7.2-2.2-10.6-1.2-.4.1-.9-.2-1-.6-.1-.4.2-.9.6-1 3.9-1.1 8.6-.6 11.9 1.3.4.2.5.7.3 1.1zm.1-3.4c-.3.5-1 .6-1.4.3-3.3-2-8.8-2.2-12-1.2-.5.2-1.1-.1-1.3-.6-.2-.5.1-1.1.6-1.3 3.7-1.1 9.8-.9 13.7 1.5.5.3.6 1 .3 1.4z" />
      </svg>
    ),
  }
  return <span className="psd-artist-social-icon">{paths[network]}</span>
}

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

function PsdIconPlus({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
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

function PsdIconVerified({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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

const QUEUE_CONTEXT_LABELS: Record<QueueContext, string> = {
  home: 'Home Queue',
  discover: 'Discover Queue',
  album: 'Album Queue',
  artist: 'Artist Queue',
  mood: 'Mood Queue',
  manual: 'Manual Queue',
  radio: 'Radio Queue',
  scene: 'Scene Queue',
  smart: 'Smart Queue',
}

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

function buildQueueCandidatePools(indexes: CatalogIndexes) {
  return {
    songsByGenre: indexes.songsByGenre,
    songsByArtistId: indexes.songsByArtistId,
    songsByAlbumName: indexes.songsByAlbumName,
  }
}

type CatalogContextValue = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  indexes: CatalogIndexes
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

    if (catalogSessionFetchDone && reloadKey === 0 && catalogMemoryCache) {
      applyBundle(
        catalogMemoryCache,
        catalogSourceRef.current,
        readCachedCatalog()?.cachedAt ?? null,
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const fetchStarted = performance.now()
    fetchCatalogBundle()
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
    }
  }, [reloadKey, applyBundle])

  const catalogIndexes = useMemo(
    () => buildCatalogIndexes(displaySongs, albums, artists),
    [displaySongs, albums, artists],
  )

  const searchMetadataIndex = useMemo(
    () => buildSearchMetadataIndex(displaySongs, artists),
    [displaySongs, artists],
  )

  const value = useMemo(
    () => ({
      songs: displaySongs,
      albums,
      artists,
      indexes: catalogIndexes,
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
      displaySongs,
      albums,
      artists,
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
    default:
      return navKey as PageId
  }
}


type SidebarNavItem = {
  key: string
  page: PageId
  label: string
  icon: ReactNode
}

type Mood = 'violet' | 'cyan' | 'rose' | 'mint'

type DiscoveryCard = {
  title: string
  subtitle: string
  mood: Mood
}

type DiscoverySection = {
  title: string
  hint: string
  cards: DiscoveryCard[]
}

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

function isSidebarNavActive(item: SidebarNavItem, activeNavKey: NavKey) {
  return item.key === activeNavKey
}

function moodRoomScene(room: Pick<MoodRoom, 'title' | 'mood' | 'sceneId'>): VisualSceneId {
  return room.sceneId ?? resolveVisualScene({ seed: room.title, mood: room.mood })
}

const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    key: 'home',
    page: 'home',
    label: 'Home',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    key: 'worlds',
    page: 'mood',
    label: 'Emotional Worlds',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 12c1.2-2.2 2.4-3.3 3.5-3.3s2.3 1.1 3.5 3.3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      </svg>
    ),
  },
  {
    key: 'search',
    page: 'discover',
    label: 'Search',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    key: 'library',
    page: 'library',
    label: 'My Library',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M4 19V5h4l2 14 4-14h4v14" />
      </svg>
    ),
  },
  {
    key: 'playlists',
    page: 'playlists',
    label: 'Playlists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    key: 'artists',
    page: 'artists',
    label: 'Artists',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    key: 'albums',
    page: 'albums',
    label: 'Albums',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'liked',
    page: 'library',
    label: 'Liked Songs',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
      </svg>
    ),
  },
  {
    key: 'recent',
    page: 'library',
    label: 'Recent Played',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: 'downloads',
    page: 'library',
    label: 'Downloads',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <path d="M12 4v10" />
        <path d="M8.5 10.5L12 14l3.5-3.5" />
        <path d="M5 18h14" />
      </svg>
    ),
  },
  {
    key: 'settings',
    page: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
]

const HOME_SECTIONS: DiscoverySection[] = [
  {
    title: 'Trending Now',
    hint: 'Curated for the moment',
    cards: [
      { title: 'Neon Pulse', subtitle: 'Electric emotions', mood: 'violet' },
      { title: 'Midnight Drive', subtitle: 'Late-night energy', mood: 'cyan' },
      { title: 'Velvet Sky', subtitle: 'Dreamy atmospheres', mood: 'rose' },
      { title: 'Crystal Echo', subtitle: 'Shimmering highs', mood: 'mint' },
      { title: 'Deep Current', subtitle: 'Submerged bass', mood: 'cyan' },
    ],
  },
  {
    title: 'Emotional Picks',
    hint: 'Feel something real',
    cards: [
      { title: 'Soft Collapse', subtitle: 'Intimate & raw', mood: 'rose' },
      { title: 'Golden Hour', subtitle: 'Warm nostalgia', mood: 'violet' },
      { title: 'Silent Storm', subtitle: 'Power in restraint', mood: 'mint' },
      { title: 'Fading Light', subtitle: 'Bittersweet closure', mood: 'violet' },
    ],
  },
  {
    title: 'Night Vibes',
    hint: 'After dark selections',
    cards: [
      { title: 'Lunar Drift', subtitle: 'Weightless nights', mood: 'cyan' },
      { title: 'Smoke & Mirrors', subtitle: 'Mysterious grooves', mood: 'violet' },
      { title: 'City Glow', subtitle: 'Urban nocturne', mood: 'rose' },
      { title: '3AM Frequency', subtitle: 'Insomniac anthems', mood: 'mint' },
    ],
  },
  {
    title: 'Focus Mode',
    hint: 'Clarity without distraction',
    cards: [
      { title: 'Deep Work', subtitle: 'Minimal & steady', mood: 'mint' },
      { title: 'Flow State', subtitle: 'Rhythmic precision', mood: 'cyan' },
      { title: 'Quiet Mind', subtitle: 'Ambient clarity', mood: 'violet' },
      { title: 'Monk Mode', subtitle: 'Zero friction', mood: 'mint' },
    ],
  },
]


const TV_SHOWS = [
  { title: 'Live from the Mood Room', subtitle: 'Session 07 · Violet hour', mood: 'violet' as Mood },
  { title: 'Artist Residency', subtitle: 'Luna Veil · Behind the feeling', mood: 'rose' as Mood },
  { title: 'Visual Album Night', subtitle: 'Noir Ensemble · Full film', mood: 'cyan' as Mood },
  { title: 'Hidden Sessions', subtitle: 'Exclusive desktop premiere', mood: 'mint' as Mood },
]

function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
    </svg>
  )
}
function catalogFallbackTone(seed: string): Mood {
  const code = seed.charCodeAt(0) + seed.charCodeAt(seed.length - 1 || 0)
  const tones: Mood[] = ['violet', 'cyan', 'rose', 'mint']
  return tones[code % tones.length]
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

const ArtworkImage = memo(function ArtworkImage({
  src,
  alt,
  seed,
  variant = 'square',
  priority = false,
}: {
  src: string | null
  alt: string
  seed: string
  variant?: 'square' | 'wide' | 'circle'
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const tone = useMemo(() => catalogFallbackTone(seed), [seed])

  return (
    <div className={`art-frame art-frame--${variant}`}>
      {!src || failed ? (
        <div
          className={`art-fallback art-fallback--${tone} art-fallback--${variant === 'circle' ? 'square' : variant}`}
          aria-hidden={alt ? undefined : true}
        >
          <MusicNoteIcon className="card-art-icon" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="card-art-img"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
})

const ArtistAvatar = memo(function ArtistAvatar({
  artist,
}: {
  artist: ApiArtist
}) {
  const tone = useMemo(() => catalogFallbackTone(artist.id), [artist.id])

  return (
    <span className="artist-avatar" aria-hidden="true" data-tone={tone}>
      <ArtworkImage
        src={artist.artwork}
        alt=""
        seed={artist.id}
        variant="circle"
      />
      <span className="artist-initial">{artist.name.charAt(0)}</span>
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
              <ArtworkImage src={song.artwork} alt="" seed={song.id} />
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
          const artwork = resolveAlbumArtwork(album, albumSongs)
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

function CatalogSection({
  title,
  hint,
  loading,
  error,
  onRetry,
  count,
  children,
}: {
  title: string
  hint: string
  loading: boolean
  error: string | null
  onRetry: () => void
  count?: number
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

function HomeTopBar({
  placeholder = 'Search songs, artists, moods…',
  onOpenDiscover,
  variant = 'default',
  searchValue,
  onSearchChange,
}: {
  placeholder?: string
  onOpenDiscover?: () => void
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
      onOpenDiscover?.()
    },
    [onOpenDiscover],
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
      <div className="home-top-actions">
        <button type="button" className="home-top-icon-btn home-top-icon-btn--notify" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {isSearchShell ? <span className="home-top-notify-badge">3</span> : null}
        </button>
        <button type="button" className="home-top-icon-btn" aria-label="Theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </button>
        <button type="button" className="home-top-avatar" aria-label="Profile">
          <span aria-hidden="true">H</span>
        </button>
      </div>
    </header>
  )
}

function CatalogStaleBanner() {
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
}

function CatalogStatusBar() {
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
}

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
  const lanes = useMemo(() => buildEmotionalLanes(songs), [songs])
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
                  <VisualSceneBackdrop sceneId={sceneId} seed={lane.id} variant="thumb" />
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
  const scenes = useMemo(() => buildListeningScenes(songs), [songs])
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
                  <VisualSceneBackdrop
                    sceneId={scene.visualSceneId}
                    seed={scene.id}
                    variant="card"
                  />
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

function DiscoveryGrid({ section }: { section: DiscoverySection }) {
  return (
    <section className="discovery-section" aria-labelledby={`section-${section.title}`}>
      <div className="section-header">
        <h2 id={`section-${section.title}`}>{section.title}</h2>
        <span>{section.hint}</span>
      </div>
      <div className="card-row">
        {section.cards.map((card) => {
          const sceneId = resolveVisualScene({ seed: card.title, mood: card.mood })
          return (
          <article
            key={card.title}
            className="discovery-card"
            data-mood={card.mood}
            data-scene={sceneId}
          >
            <div className="card-art">
              <VisualSceneBackdrop sceneId={sceneId} seed={card.title} variant="thumb" />
              <MusicNoteIcon className="card-art-icon" />
            </div>
            <div className="card-info">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
          </article>
          )
        })}
      </div>
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
        {SIDEBAR_NAV.map((item) => {
          const isActive = isSidebarNavActive(item, activeNavKey)
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigateNav(item.key as NavKey)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
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
              <span className="sidebar-user-badge-check" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
              </span>
              Premium User
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
})

function Hero() {
  return (
    <section className="hero hero--psd" aria-label="Tonight's listening invitation">
      <img
        className="hero-photo"
        src={heroPhotoUrl}
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

function PopularWorldsSection({
  songs,
  loading = false,
  selectedSceneId,
  onSelectScene,
  onPlayWorld,
}: {
  songs: ApiSong[]
  loading?: boolean
  selectedSceneId: string | null
  onSelectScene: (sceneId: string | null) => void
  onPlayWorld: (scene: BuiltListeningScene) => void
}) {
  const worlds = useMemo(
    () => buildListeningScenes(songs, { minTracks: 0 }).slice(0, 5),
    [songs],
  )

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
          {worlds.map((world) => {
            const presentation = resolveWorldPresentation(world)
            const coverSong = world.songIds
              .map((songId) => songs.find((entry) => entry.id === songId))
              .find(Boolean)
            const isActive = selectedSceneId === world.id
            const sceneId = world.visualSceneId ?? resolveVisualScene({
              seed: world.label,
              mood: world.mood,
            })

            return (
              <article
                key={world.id}
                role="listitem"
                className={`world-card${isActive ? ' is-active' : ''}`}
                data-scene={sceneId}
              >
                <button
                  type="button"
                  className="world-card-select"
                  aria-pressed={isActive}
                  onClick={() => onSelectScene(isActive ? null : world.id)}
                >
                  <div className="world-card-art">
                    {coverSong?.artwork ? (
                      <ArtworkImage
                        src={coverSong.artwork}
                        alt=""
                        seed={world.id}
                        priority={worlds.indexOf(world) < 2}
                      />
                    ) : (
                      <VisualSceneBackdrop
                        sceneId={sceneId}
                        seed={world.id}
                        variant="thumb"
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
                </button>
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
}: {
  onOpenSong: QueueSongHandler
}) {
  const { songs, indexes, showCatalogSkeleton, showCatalogError, error, retry } = useCatalog()
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  const featured = useMemo(
    () => sortSongsList(songs, 'latest').slice(0, 12),
    [songs],
  )
  const browseSongs = useMemo(() => {
    let result = songs
    if (selectedLaneId) {
      result = filterSongsByEmotionalLane(result, selectedLaneId)
    }
    if (selectedSceneId) {
      result = filterSongsByListeningScene(result, selectedSceneId)
    }
    return result
  }, [songs, selectedLaneId, selectedSceneId])
  const selectedLane = useMemo(
    () => findEmotionalLane(buildEmotionalLanes(songs), selectedLaneId),
    [songs, selectedLaneId],
  )
  const selectedScene = useMemo(
    () => findListeningScene(buildListeningScenes(songs), selectedSceneId),
    [songs, selectedSceneId],
  )
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playHomeSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      featured,
      index,
      'home',
      'Home',
      {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', featured, indexes, song),
        candidatePools: queuePools,
      },
    ),
    [featured, indexes, onOpenSong, queuePools],
  )
  const browseQueueTitle = selectedScene
    ? `In this scene · ${selectedScene.label}`
    : selectedLane
      ? `For this mood · ${selectedLane.label}`
      : 'Home'

  const playBrowseSong = useCallback(
    (song: ApiSong, index: number) => onOpenSong(
      song,
      browseSongs,
      index,
      'home',
      browseQueueTitle,
      {
        seedType: 'home',
        seedTracks: buildQueueSeedPool('home', browseSongs, indexes, song),
        candidatePools: queuePools,
      },
    ),
    [browseQueueTitle, browseSongs, indexes, onOpenSong, queuePools],
  )

  const handleStartRadio = useCallback(
    (station: BuiltRadioStation) => {
      if (station.tracks.length === 0) return
      onOpenSong(
        station.tracks[0],
        station.tracks,
        0,
        'radio',
        station.title,
        {
          seedType: 'discover',
          seedTracks: station.tracks,
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools],
  )

  const playWorld = useCallback(
    (scene: BuiltListeningScene) => {
      const tracks = filterSongsByListeningScene(songs, scene.id)
      if (tracks.length === 0) return
      onOpenSong(
        tracks[0],
        tracks,
        0,
        'home',
        resolveWorldPresentation(scene).title,
        {
          seedType: 'home',
          seedTracks: buildQueueSeedPool('home', tracks, indexes, tracks[0]),
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, songs],
  )

  return (
    <div className="home-destination">
      <PageFrame cinematic>
        <Hero />
        <PopularWorldsSection
          songs={songs}
          loading={showCatalogSkeleton}
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
          onPlayWorld={playWorld}
        />
      <div className="home-secondary" aria-label="More listening paths">
      <EmotionalLanesSection
        songs={songs}
        selectedLaneId={selectedLaneId}
        onSelectLane={setSelectedLaneId}
        loading={showCatalogSkeleton}
      />
      <SceneListeningSection
        songs={songs}
        selectedSceneId={selectedSceneId}
        onSelectScene={setSelectedSceneId}
        loading={showCatalogSkeleton}
      />
      <RadioFoundationSection
        songs={songs}
        browseSongs={browseSongs}
        selectedLaneId={selectedLaneId}
        selectedLaneLabel={selectedLane?.label ?? null}
        selectedSceneId={selectedSceneId}
        selectedSceneLabel={selectedScene?.label ?? null}
        onStartRadio={handleStartRadio}
        loading={showCatalogSkeleton}
      />
      {(selectedLaneId || selectedSceneId) && browseSongs.length > 0 ? (
        <CatalogSection
          title={selectedSceneId ? 'In this scene' : 'For this mood'}
          hint={
            selectedScene
              ? `${selectedScene.label} · scene collection`
              : selectedLane
                ? `${selectedLane.label} · emotional lane`
                : 'Browse filter'
          }
          loading={showCatalogSkeleton}
          error={showCatalogError ? error : null}
          onRetry={retry}
          count={browseSongs.length}
        >
          <ApiSongGrid
            songs={browseSongs}
            onSelect={playBrowseSong}
            listKey={`home-browse-${selectedLaneId ?? 'all'}-${selectedSceneId ?? 'all'}`}
            paginate
          />
        </CatalogSection>
      ) : null}
      <CatalogSection
        title="From your collection"
        hint="Quiet highlights beneath the worlds"
        loading={showCatalogSkeleton}
        error={showCatalogError ? error : null}
        onRetry={retry}
        count={featured.length}
      >
        {!showCatalogSkeleton && !showCatalogError && songs.length === 0 ? (
          <CatalogEmpty
            title="Catalog is empty"
            detail="The API responded but returned no songs yet."
          />
        ) : (
          <ApiSongGrid songs={featured} onSelect={playHomeSong} listKey="home-featured" paginate={false} />
        )}
      </CatalogSection>
      {HOME_SECTIONS.slice(1, 3).map((section) => (
        <DiscoveryGrid key={section.title} section={section} />
      ))}
      </div>
      </PageFrame>
    </div>
  )
}

function DiscoverPage({
  onOpenSong,
  query: externalQuery,
  setQuery: externalSetQuery,
}: {
  onOpenSong: QueueSongHandler
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
  const [internalQuery, setInternalQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    PSD_SEARCH_QUERY,
    parseStoredSearchTerm,
  )
  const query = externalQuery ?? internalQuery
  const setQuery = externalSetQuery ?? setInternalQuery
  void setQuery
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isSearchPending = query !== debouncedQuery
  const [sort, setSort] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSort,
    'latest' as SongSort,
    parseStoredSongSort,
  )
  void setSort

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

  const hasEvaluatedQuery = debouncedQuery.trim().length > 0
  const showNoMatches =
    !isSearchPending &&
    hasEvaluatedQuery &&
    visibleRecords.length === 0 &&
    searchMetadataIndex.entries.length > 0
  void showNoMatches

  const catalogSongs = visibleSongs
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const playDiscoverSong = useCallback(
    (song: ApiSong, index: number) => {
      const record =
        visibleRecords.find((entry) => entry.id === song.id)
        ?? visibleRecords[index]
      const playableSong = record ? metadataRecordToApiSong(record) : song
      const queueSongs = catalogSongs
      const queueIndex = queueSongs.findIndex((entry) => entry.id === playableSong.id)
      const safeIndex = queueIndex >= 0 ? queueIndex : index

      onOpenSong(
        playableSong,
        queueSongs,
        safeIndex,
        'discover',
        'Discover',
        {
          seedType: 'discover',
          seedTracks: buildQueueSeedPool('discover', queueSongs, indexes, playableSong),
          candidatePools: queuePools,
        },
      )
    },
    [catalogSongs, indexes, onOpenSong, queuePools, visibleRecords],
  )

  const handleStartRadio = useCallback(
    (station: BuiltRadioStation) => {
      if (station.tracks.length === 0) return
      const record =
        visibleRecords.find((entry) => entry.id === station.tracks[0].id) ?? null
      const playableSong = record
        ? metadataRecordToApiSong(record)
        : station.tracks[0]

      onOpenSong(
        playableSong,
        station.tracks,
        0,
        'radio',
        station.title,
        {
          seedType: 'discover',
          seedTracks: station.tracks,
          candidatePools: queuePools,
        },
      )
    },
    [indexes, onOpenSong, queuePools, visibleRecords],
  )
  void handleStartRadio

  const [searchTab, setSearchTab] = useState<
    'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'podcasts' | 'profiles'
  >('all')

  const matchedArtists = useMemo(
    () => sortArtistsList(filterArtistsByQuery(artists, debouncedQuery), 'az').slice(0, 8),
    [artists, debouncedQuery],
  )
  const matchedAlbums = useMemo(
    () => sortAlbumsList(filterAlbumsByQuery(albums, debouncedQuery, artistNames), 'latest').slice(0, 8),
    [albums, artistNames, debouncedQuery],
  )
  const topResult = visibleSongs[0] ?? null
  const trimmedQuery = debouncedQuery.trim()
  const searchTabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: 'Songs' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'podcasts', label: 'Podcasts' },
    { id: 'profiles', label: 'Profiles' },
  ] as const

  const displayQuery = trimmedQuery || PSD_SEARCH_QUERY
  const showMainResults = searchTab === 'all' || searchTab === 'songs'
  const showArtistPanel = searchTab === 'all' || searchTab === 'artists'
  const showAlbumPanel = searchTab === 'all' || searchTab === 'albums'
  const resolveSongAtIndex = useCallback(
    (index: number) => catalogSongs[index] ?? topResult ?? null,
    [catalogSongs, topResult],
  )

  return (
    <div className="psd-search-destination">
      <PageFrame cinematic>
        <header className="psd-search-page-header" aria-labelledby="search-results-heading">
          <h1 id="search-results-heading" className="psd-search-page-title">
            Search Results
          </h1>
          <p className="psd-search-page-subtitle">
            Showing results for <strong>&ldquo;{displayQuery}&rdquo;</strong>
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

        {showMainResults ? (
          <>
            <section className="psd-search-top-result" aria-label="Top result">
              <span className="psd-search-top-result-label">Top Result</span>
              <div className="psd-search-top-result-card">
                <button
                  type="button"
                  className="psd-search-top-result-art-btn"
                  aria-label={`Play ${PSD_SEARCH_TOP_RESULT.title}`}
                  onClick={() => {
                    const playable = topResult ?? catalogSongs[0]
                    if (playable) playDiscoverSong(playable, 0)
                  }}
                >
                  <div
                    className="psd-search-top-result-art"
                    style={topResult?.artwork ? undefined : { backgroundImage: `url(${psdSearchReferenceUrl})` }}
                  >
                    {topResult?.artwork ? (
                      <ArtworkImage src={topResult.artwork} alt="" seed={topResult.id} priority />
                    ) : null}
                    <span className="psd-search-top-result-play" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </div>
                </button>

                <div className="psd-search-top-result-meta">
                  <h2>{PSD_SEARCH_TOP_RESULT.title}</h2>
                  <p className="psd-search-top-result-artist">
                    {PSD_SEARCH_TOP_RESULT.artist}
                    <PsdIconVerified className="psd-search-verified" />
                  </p>
                  <div className="psd-search-top-result-badges">
                    {PSD_SEARCH_TOP_RESULT.badges.map((badge) => (
                      <span key={badge} className="psd-search-quality-badge">{badge}</span>
                    ))}
                  </div>
                </div>

                <div className="psd-search-top-result-actions">
                  <button type="button" className="psd-search-icon-btn" aria-label="Save to library"><PsdIconHeart /></button>
                  <button type="button" className="psd-search-icon-btn" aria-label="Add to queue"><PsdIconPlus /></button>
                  <button type="button" className="psd-search-icon-btn" aria-label="More options"><PsdIconMore /></button>
                </div>

                <div className="psd-search-top-result-wave">
                  <PsdWaveformStrip className="psd-search-top-result-waveform" />
                  <span className="psd-search-top-result-duration">{PSD_SEARCH_TOP_RESULT.duration}</span>
                </div>
              </div>
            </section>

            <section className="psd-search-songs-panel" aria-labelledby="search-songs-heading">
              <header className="psd-search-section-header">
                <h2 id="search-songs-heading">Songs</h2>
                <button type="button" className="psd-search-view-all">View all</button>
              </header>

              {showCatalogSkeleton ? (
                <CatalogSkeleton count={5} variant="card" />
              ) : showCatalogError ? (
                <CatalogError message={error || ''} onRetry={retry} />
              ) : (
                <div className="psd-search-songs-card">
                  {PSD_SEARCH_SONG_ROWS.map((row, index) => {
                    const playable = resolveSongAtIndex(index)
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className={`psd-search-song-row${row.active ? ' is-active' : ''}`}
                        onClick={() => playable && playDiscoverSong(playable, index)}
                      >
                        <span className="psd-search-song-leading" aria-hidden="true">
                          {row.active ? <PsdIconEqualizer className="psd-search-equalizer" /> : null}
                        </span>
                        <span className="psd-search-song-thumb">
                          {playable?.artwork ? (
                            <ArtworkImage src={playable.artwork} alt="" seed={playable.id} />
                          ) : (
                            <span
                              className="psd-search-song-thumb-fallback"
                              style={{ backgroundImage: `url(${psdSearchReferenceUrl})` }}
                            />
                          )}
                        </span>
                        <span className="psd-search-song-copy">
                          <strong>{row.title}</strong>
                          <span>{row.artist}</span>
                        </span>
                        <span className="psd-search-quality-badge psd-search-quality-badge--row">{row.badge}</span>
                        <span className="psd-search-song-duration">{row.duration}</span>
                        <span className="psd-search-song-actions" aria-hidden="true">
                          <PsdIconHeart />
                          <PsdIconPlus />
                          <PsdIconMore />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}

        {(showArtistPanel || showAlbumPanel) ? (
          <div className="psd-search-lower-panels">
            {showArtistPanel ? (
              <section className="psd-search-side-panel" aria-labelledby="search-artists-heading">
                <header className="psd-search-section-header">
                  <h2 id="search-artists-heading">Artists</h2>
                  <button type="button" className="psd-search-view-all">View all</button>
                </header>
                <div className="psd-search-side-card">
                  {PSD_SEARCH_ARTIST_ROWS.map((row, index) => {
                    const artist = matchedArtists[index] ?? null
                    return (
                      <button key={row.key} type="button" className="psd-search-side-row">
                        <span className="psd-search-side-avatar">
                          {artist ? (
                            <ArtistAvatar artist={artist} />
                          ) : (
                            <span
                              className="psd-search-side-avatar-fallback"
                              style={{ backgroundImage: `url(${psdSearchReferenceUrl})` }}
                            />
                          )}
                        </span>
                        <span className="psd-search-side-copy">
                          <strong>
                            {row.name}
                            {row.verified ? <PsdIconVerified className="psd-search-verified" /> : null}
                          </strong>
                        </span>
                        <PsdIconChevronRight className="psd-search-side-chevron" />
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {showAlbumPanel ? (
              <section className="psd-search-side-panel" aria-labelledby="search-albums-heading">
                <header className="psd-search-section-header">
                  <h2 id="search-albums-heading">Albums</h2>
                  <button type="button" className="psd-search-view-all">View all</button>
                </header>
                <div className="psd-search-side-card">
                  {PSD_SEARCH_ALBUM_ROWS.map((row, index) => {
                    const album = matchedAlbums[index] ?? null
                    const albumSongs = album
                      ? resolveSongsForAlbum(album, indexes.songsByAlbumId, indexes.songsByAlbumName, indexes.artistNames)
                      : []
                    return (
                      <button key={row.key} type="button" className="psd-search-side-row">
                        <span className="psd-search-side-art">
                          {album ? (
                            <ArtworkImage
                              src={resolveAlbumArtwork(album, albumSongs)}
                              alt=""
                              seed={album.id}
                            />
                          ) : (
                            <span
                              className="psd-search-side-art-fallback"
                              style={{ backgroundImage: `url(${psdSearchReferenceUrl})` }}
                            />
                          )}
                        </span>
                        <span className="psd-search-side-copy">
                          <strong>{row.title}</strong>
                          <span>{row.meta}</span>
                        </span>
                        <PsdIconChevronRight className="psd-search-side-chevron" />
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
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
  const scenes = useMemo(() => buildListeningScenes(songs), [songs])
  const [selectedChip, setSelectedChip] = useState<EmotionalWorldChipId>('all')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const visibleCards = useMemo(() => {
    if (selectedChip === 'all') return EMOTIONAL_WORLDS_CARDS
    return EMOTIONAL_WORLDS_CARDS.filter((card) => card.chips.includes(selectedChip))
  }, [selectedChip])

  const playWorld = useCallback(
    (card: EmotionalWorldCardSpec) => {
      const tracks = filterSongsByListeningScene(songs, card.sceneId)
      if (tracks.length === 0) return
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
    [indexes, onOpenSong, queuePools, songs],
  )

  return (
    <div className="emotional-worlds-destination">
      <PageFrame cinematic>
        <section className="emotional-worlds-hero" aria-labelledby="emotional-worlds-heading">
          <div
            className="emotional-worlds-hero-backdrop"
            style={{ backgroundImage: `url(${emotionalWorldsReferenceUrl})` }}
            aria-hidden="true"
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
          </div>
        </section>

        <div className="emotional-worlds-chips" role="toolbar" aria-label="World categories">
          {EMOTIONAL_WORLDS_CHIPS.map((chip) => (
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
          <span className="emotional-worlds-chips-more" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </div>

        {showCatalogSkeleton ? (
          <div className="emotional-worlds-grid emotional-worlds-grid--loading" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="emotional-world-card emotional-world-card--skeleton">
                <div className="emotional-world-card-art" />
                <div className="emotional-world-card-line" />
              </div>
            ))}
          </div>
        ) : (
          <div className="emotional-worlds-grid" role="list" aria-label="Emotional worlds">
            {visibleCards.map((card) => {
              const scene = scenes.find((entry) => entry.id === card.sceneId)
              const tracks = filterSongsByListeningScene(songs, card.sceneId)
              const coverSong = tracks[0]
              const isActive = selectedCardId === card.cardId
              const visualSceneId = scene?.visualSceneId ?? resolveVisualScene({
                seed: card.title,
                mood: scene?.mood ?? 'violet',
              })

              return (
                <article
                  key={card.cardId}
                  role="listitem"
                  className={`emotional-world-card${isActive ? ' is-active' : ''}`}
                  data-scene={visualSceneId}
                >
                  <button
                    type="button"
                    className="emotional-world-card-select"
                    aria-pressed={isActive}
                    onClick={() => setSelectedCardId(isActive ? null : card.cardId)}
                  >
                    <div className="emotional-world-card-art">
                      {coverSong?.artwork ? (
                        <ArtworkImage
                          src={coverSong.artwork}
                          alt=""
                          seed={card.cardId}
                        />
                      ) : (
                        <VisualSceneBackdrop
                          sceneId={visualSceneId}
                          seed={card.cardId}
                          variant="thumb"
                        />
                      )}
                      <span className="emotional-world-card-veil" aria-hidden="true" />
                      <button
                        type="button"
                        className="emotional-world-play-btn"
                        aria-label={`Play ${card.title}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          playWorld(card)
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
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

function LibraryPage({ onOpenSong }: { onOpenSong: QueueSongHandler }) {
  const { songs, indexes } = useCatalog()
  const [tab, setTab] = useState<(typeof PSD_LIBRARY_TABS)[number]>('Overview')
  const recentSongs = useMemo(() => sortSongsList([...songs], 'latest'), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const resolveRecentSong = useCallback(
    (title: string, index: number) => {
      const exact = recentSongs.find(
        (song) => song.title.toLowerCase() === title.toLowerCase(),
      )
      return exact ?? recentSongs[index] ?? null
    },
    [recentSongs],
  )

  const playRecentSong = useCallback(
    (title: string, index: number) => {
      const song = resolveRecentSong(title, index)
      if (!song) return
      const queue = recentSongs.length > 0 ? recentSongs : [song]
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue, queueIndex, 'manual', 'Recently Added', {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, queuePools, recentSongs, resolveRecentSong],
  )

  return (
    <div className="psd-library-destination">
      <PageFrame cinematic>
        <header className="psd-library-header" aria-labelledby="library-heading">
          <h1 id="library-heading" className="psd-library-title">My Library</h1>
          <p className="psd-library-subtitle">All your music, in one place.</p>
        </header>

        <div className="psd-library-toolbar">
          <div className="psd-library-tabs" role="tablist" aria-label="Library sections">
            {PSD_LIBRARY_TABS.map((entry) => (
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
          <button type="button" className="psd-library-add-btn" aria-label="Add New">
            <PsdIconPlus />
            <span>Add New</span>
          </button>
        </div>

        <section className="psd-library-stats" aria-label="Library statistics">
          {PSD_LIBRARY_STATS.map((card) => (
            <article key={card.key} className="psd-library-stat-card" data-tone={card.tone}>
              <span className="psd-library-stat-icon" aria-hidden="true">
                <PsdLibraryStatIcon type={card.key} />
              </span>
              <span className="psd-library-stat-copy">
                <span className="psd-library-stat-label">{card.label}</span>
                <strong className="psd-library-stat-value">{card.value}</strong>
                <span className="psd-library-stat-hint">{card.hint}</span>
              </span>
            </article>
          ))}
        </section>

        <section className="psd-library-section" aria-labelledby="recently-added-heading">
          <header className="psd-library-section-header">
            <h2 id="recently-added-heading">Recently Added</h2>
            <div className="psd-library-section-actions">
              <button type="button" className="psd-library-view-all">View all</button>
              <button type="button" aria-label="Previous recently added" className="psd-library-round-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button type="button" aria-label="Next recently added" className="psd-library-round-btn">
                <PsdIconChevronRight />
              </button>
            </div>
          </header>
          <div className="psd-library-card-row">
            {PSD_LIBRARY_RECENT.map((song, index) => (
              <article key={song.title} className="psd-library-cover-card" data-tone={song.tone}>
                <div
                  className="psd-library-cover-art"
                  style={{
                    backgroundImage: `url(${psdLibraryReferenceUrl})`,
                    backgroundPosition: song.artPosition,
                  }}
                >
                  <span className="psd-library-cover-veil" aria-hidden="true" />
                  <button
                    type="button"
                    className="psd-library-play-btn"
                    aria-label={`Play ${song.title}`}
                    onClick={() => playRecentSong(song.title, index)}
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

        <section className="psd-library-section psd-library-section--playlists" aria-labelledby="your-playlists-heading">
          <header className="psd-library-section-header">
            <h2 id="your-playlists-heading">Your Playlists</h2>
            <button type="button" className="psd-library-view-all">View all</button>
          </header>
          <div className="psd-library-card-row">
            {PSD_LIBRARY_PLAYLISTS.map((playlist) => (
              <article
                key={playlist.title}
                className="psd-library-cover-card psd-library-cover-card--playlist"
                data-tone={playlist.tone}
              >
                <div
                  className="psd-library-cover-art"
                  style={{
                    backgroundImage: `url(${psdLibraryReferenceUrl})`,
                    backgroundPosition: playlist.artPosition,
                  }}
                >
                  <span className="psd-library-cover-veil" aria-hidden="true" />
                  <span className="psd-library-music-badge" aria-hidden="true">
                    <MusicNoteIcon />
                  </span>
                </div>
                <div className="psd-library-cover-copy">
                  <strong>{playlist.title}</strong>
                  <span>{playlist.count}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </PageFrame>
    </div>
  )
}


function ArtistsPage({ onOpenArtist }: { onOpenArtist: (artist: ApiArtist) => void }) {
  const { artists, albums, indexes } = useCatalog()
  const [tab, setTab] = useState<'overview' | 'songs' | 'albums' | 'playlists' | 'related' | 'about'>('overview')

  const featuredArtist = useMemo(
    () => artists.find((artist) => artist.name.toLowerCase().includes('wills')) ?? artists[0] ?? null,
    [artists],
  )
  const popularSongs = useMemo(
    () => (
      featuredArtist
        ? resolveSongsForArtist(
            featuredArtist,
            indexes.songsByArtistId,
            indexes.songsByArtistName,
          ).slice(0, 8)
        : []
    ),
    [featuredArtist, indexes.songsByArtistId, indexes.songsByArtistName],
  )
  const artistAlbums = useMemo(
    () => (featuredArtist ? albums.filter((album) => album.artistId === featuredArtist.id).slice(0, 8) : []),
    [albums, featuredArtist],
  )
  const resolvePopularSong = useCallback(
    (index: number) => popularSongs[index] ?? popularSongs[0] ?? null,
    [popularSongs],
  )

  const artistTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'related', label: 'Related Artists' },
    { id: 'about', label: 'About' },
  ] as const

  return (
    <div className="psd-artists-destination">
      <PageFrame cinematic>
        <section className="psd-artist-hero" aria-labelledby="artist-profile-heading">
          <div
            className="psd-artist-hero-backdrop"
            style={{ backgroundImage: `url(${psdArtistsReferenceUrl})` }}
            aria-hidden="true"
          />
          <div className="psd-artist-hero-veil" aria-hidden="true" />
          <div className="psd-artist-hero-inner">
            <div className="psd-artist-portrait-wrap">
              {featuredArtist ? (
                <ArtistAvatar artist={featuredArtist} />
              ) : (
                <span
                  className="psd-artist-portrait-fallback"
                  style={{ backgroundImage: `url(${psdArtistsReferenceUrl})` }}
                  aria-hidden="true"
                />
              )}
              <span className="psd-artist-portrait-badge" aria-hidden="true">
                <PsdIconVerified />
              </span>
            </div>
            <div className="psd-artist-hero-copy">
              <h1 id="artist-profile-heading" className="psd-artist-hero-name">
                {PSD_ARTIST_NAME}
                <PsdIconVerified className="psd-artist-name-verified" />
              </h1>
              <p className="psd-artist-hero-label">Artist</p>
              <p className="psd-artist-hero-stats">{PSD_ARTIST_STATS}</p>
              <div className="psd-artist-hero-actions">
                <button
                  type="button"
                  className="psd-artist-btn psd-artist-btn--play"
                  disabled={!featuredArtist}
                  onClick={() => featuredArtist && onOpenArtist(featuredArtist)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </button>
                <button type="button" className="psd-artist-btn psd-artist-btn--follow">Follow</button>
                <button type="button" className="psd-artist-btn psd-artist-btn--more" aria-label="More options">
                  <PsdIconMore />
                </button>
              </div>
            </div>
          </div>
        </section>

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
          <section className="psd-artist-popular-panel" aria-labelledby="popular-songs-heading">
            <header className="psd-artist-section-header">
              <h2 id="popular-songs-heading">Popular</h2>
              <button type="button" className="psd-artist-view-all">View all</button>
            </header>
            <div className="psd-artist-popular-card">
              {PSD_ARTIST_POPULAR_ROWS.map((row, index) => {
                const playable = resolvePopularSong(index)
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="psd-artist-popular-row"
                    onClick={() => featuredArtist && onOpenArtist(featuredArtist)}
                  >
                    <span className="psd-artist-popular-rank">{row.rank}</span>
                    <span className="psd-artist-popular-thumb">
                      {playable?.artwork ? (
                        <ArtworkImage src={playable.artwork} alt="" seed={playable.id} />
                      ) : (
                        <span
                          className="psd-artist-popular-thumb-fallback"
                          style={{ backgroundImage: `url(${psdArtistsReferenceUrl})` }}
                        />
                      )}
                    </span>
                    <span className="psd-artist-popular-copy">
                      <strong>{row.title}</strong>
                      {row.explicit ? <span className="psd-artist-explicit-badge">E</span> : null}
                    </span>
                    <span className="psd-artist-popular-streams">{row.streams}</span>
                    <span className="psd-artist-popular-duration">{row.duration}</span>
                    <span className="psd-artist-popular-more" aria-hidden="true"><PsdIconMore /></span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="psd-artist-about-panel" aria-labelledby="artist-about-heading">
            <h2 id="artist-about-heading">About</h2>
            <p className="psd-artist-about-bio">
              {PSD_ARTIST_BIO}
              {' '}
              <button type="button" className="psd-artist-about-more">...more</button>
            </p>
            <dl className="psd-artist-about-details">
              <div>
                <dt>Born</dt>
                <dd>May 12, 1993<br />Lagos, Nigeria</dd>
              </div>
              <div>
                <dt>Genre</dt>
                <dd>Afrobeats • Afro Pop</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>—</dd>
              </div>
            </dl>
            <div className="psd-artist-social-row" aria-label="Social links">
              <button type="button" className="psd-artist-social-btn" aria-label="Instagram"><PsdSocialIcon network="instagram" /></button>
              <button type="button" className="psd-artist-social-btn" aria-label="Twitter"><PsdSocialIcon network="twitter" /></button>
              <button type="button" className="psd-artist-social-btn" aria-label="YouTube"><PsdSocialIcon network="youtube" /></button>
              <button type="button" className="psd-artist-social-btn" aria-label="Spotify"><PsdSocialIcon network="spotify" /></button>
            </div>
          </section>

          <section className="psd-artist-albums-panel" aria-labelledby="artist-albums-heading">
            <header className="psd-artist-section-header">
              <h2 id="artist-albums-heading">Albums</h2>
              <button type="button" className="psd-artist-view-all">View all</button>
            </header>
            <div className="psd-artist-albums-grid">
              {PSD_ARTIST_ALBUM_CARDS.map((card, index) => {
                const album = artistAlbums[index] ?? null
                const albumSongs = album
                  ? resolveSongsForAlbum(album, indexes.songsByAlbumId, indexes.songsByAlbumName, indexes.artistNames)
                  : []
                return (
                  <article key={card.key} className="psd-artist-album-card">
                    <div className="psd-artist-album-art">
                      {album ? (
                        <ArtworkImage src={resolveAlbumArtwork(album, albumSongs)} alt="" seed={album.id} />
                      ) : (
                        <span
                          className="psd-artist-album-art-fallback"
                          style={{ backgroundImage: `url(${psdArtistsReferenceUrl})` }}
                        />
                      )}
                    </div>
                    <strong>{card.title}</strong>
                    <span>{card.artist}</span>
                    <span className="psd-artist-album-meta">{card.year} • {card.songs}</span>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
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
  const [sort] = usePersistedPreference(
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
          <p className="psd-albums-page-subtitle">{PSD_ALBUMS_SUBTITLE}</p>
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
          <button type="button" className="psd-albums-sort-pill" aria-label="Sort albums">
            Recently Added
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <div className="psd-albums-grid">
          {PSD_ALBUMS_GRID_CARDS.map((card, index) => {
            const album = resolveAlbumAtIndex(index)
            const albumSongs = album
              ? resolveSongsForAlbum(album, indexes.songsByAlbumId, indexes.songsByAlbumName, indexes.artistNames)
              : []
            return (
              <article key={card.key} className="psd-albums-gallery-card">
                <button
                  type="button"
                  className="psd-albums-gallery-card-btn"
                  onClick={() => album && onOpenAlbum(album)}
                >
                  <div className="psd-albums-gallery-art-wrap">
                    <div className="psd-albums-gallery-art">
                      {album ? (
                        <ArtworkImage
                          src={resolveAlbumArtwork(album, albumSongs)}
                          alt=""
                          seed={album.id}
                        />
                      ) : (
                        <span
                          className="psd-albums-gallery-art-fallback"
                          style={{
                            backgroundImage: `url(${psdAlbumsReferenceUrl})`,
                            backgroundPosition: card.artPosition,
                          }}
                        />
                      )}
                    </div>
                    <span className="psd-albums-gallery-art-veil" aria-hidden="true" />
                    <span className="psd-albums-gallery-play-fab" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </div>
                  <div className="psd-albums-gallery-copy">
                    <strong className="psd-albums-gallery-title">{card.title}</strong>
                    <span className="psd-albums-gallery-artist">{card.artist}</span>
                    <span className="psd-albums-gallery-meta">{card.year} • {card.songs}</span>
                    <span className="psd-albums-gallery-more" aria-hidden="true"><PsdIconMore /></span>
                  </div>
                </button>
              </article>
            )
          })}
        </div>

        <p className="psd-albums-footer-count">{PSD_ALBUMS_FOOTER_COUNT}</p>
      </PageFrame>
    </div>
  )
}

function PlaylistsPage({
  onOpenSong,
  query: externalQuery,
  setQuery: externalSetQuery,
}: {
  onOpenSong: QueueSongHandler
  query?: string
  setQuery?: (value: string) => void
}) {
  const { songs, indexes } = useCatalog()
  const [internalQuery, setInternalQuery] = useState('')
  const playlistQuery = externalQuery ?? internalQuery
  const setPlaylistQuery = externalSetQuery ?? setInternalQuery
  const playlistSongs = useMemo(() => sortSongsList([...songs], 'latest'), [songs])
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])

  const resolvePlaylistSong = useCallback(
    (title: string, index: number) => {
      const exact = playlistSongs.find(
        (song) => song.title.toLowerCase() === title.toLowerCase(),
      )
      return exact ?? playlistSongs[index] ?? null
    },
    [playlistSongs],
  )

  const playPlaylistTrack = useCallback(
    (index: number) => {
      const row = PSD_PLAYLIST_TRACK_ROWS[index]
      if (!row) return
      const song = resolvePlaylistSong(row.title, index)
      if (!song) return
      const queue = playlistSongs.length > 0 ? playlistSongs : [song]
      const queueIndex = Math.max(0, queue.findIndex((entry) => entry.id === song.id))
      onOpenSong(song, queue, queueIndex, 'manual', PSD_PLAYLIST_TITLE, {
        seedType: 'manual',
        seedTracks: buildQueueSeedPool('manual', queue, indexes, song),
        candidatePools: queuePools,
      })
    },
    [indexes, onOpenSong, playlistSongs, queuePools, resolvePlaylistSong],
  )

  const playAll = useCallback(() => {
    playPlaylistTrack(0)
  }, [playPlaylistTrack])

  const normalizedQuery = playlistQuery.trim().toLowerCase()
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return PSD_PLAYLIST_TRACK_ROWS
    return PSD_PLAYLIST_TRACK_ROWS.filter((row) => {
      const haystack = [row.title, row.artist, row.duration].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

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
            value={playlistQuery}
            onChange={(event) => setPlaylistQuery(event.target.value)}
            placeholder="Search in playlist"
            aria-label="Search in playlist"
          />
        </form>

        <section className="psd-playlist-hero" aria-labelledby="playlist-detail-heading">
          <div
            className="psd-playlist-hero-art"
            style={{
              backgroundImage: `url(${psdPlaylistReferenceUrl})`,
              backgroundPosition: PSD_PLAYLIST_HERO_ART,
            }}
            aria-hidden="true"
          />
          <div className="psd-playlist-hero-copy">
            <span className="psd-playlist-eyebrow">PLAYLIST</span>
            <h1 id="playlist-detail-heading" className="psd-playlist-title">
              {PSD_PLAYLIST_TITLE}
              <svg className="psd-playlist-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 14.5A8.5 8.5 0 1111.5 4a6.5 6.5 0 109.5 10.5z" />
              </svg>
            </h1>
            <p className="psd-playlist-description">{PSD_PLAYLIST_DESCRIPTION}</p>
            <div className="psd-playlist-owner">
              <span className="psd-playlist-owner-avatar" aria-hidden="true">
                <PsdWaveformStrip className="psd-playlist-owner-wave" />
              </span>
              <span className="psd-playlist-owner-name">{PSD_PLAYLIST_OWNER}</span>
              <PsdIconVerified className="psd-playlist-owner-verified" />
            </div>
            <p className="psd-playlist-meta">{PSD_PLAYLIST_META}</p>
          </div>
        </section>

        <div className="psd-playlist-actions" role="toolbar" aria-label="Playlist actions">
          <button type="button" className="psd-playlist-btn psd-playlist-btn--play" onClick={playAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
          <button type="button" className="psd-playlist-btn psd-playlist-btn--shuffle" onClick={playAll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            Shuffle
          </button>
          <button type="button" className="psd-playlist-icon-btn" aria-label="Add collaborator">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          </button>
          <button type="button" className="psd-playlist-icon-btn" aria-label="Download playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
          </button>
          <button type="button" className="psd-playlist-icon-btn" aria-label="More options">
            <PsdIconMore />
          </button>
        </div>

        <section className="psd-playlist-table-section" aria-label="Playlist tracks">
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
                  <th scope="col" className="psd-playlist-col-menu"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const sourceIndex = PSD_PLAYLIST_TRACK_ROWS.findIndex((entry) => entry.key === row.key)
                  const song = resolvePlaylistSong(row.title, sourceIndex >= 0 ? sourceIndex : index)
                  return (
                    <tr
                      key={row.key}
                      className={`psd-playlist-table-row${'active' in row && row.active ? ' is-active' : ''}`}
                    >
                      <td className="psd-playlist-col-index">
                        {'active' in row && row.active ? (
                          <PsdIconEqualizer className="psd-playlist-row-equalizer" />
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="psd-playlist-col-title">
                        <button
                          type="button"
                          className="psd-playlist-title-btn"
                          onClick={() => playPlaylistTrack(sourceIndex >= 0 ? sourceIndex : index)}
                        >
                          <span
                            className="psd-playlist-row-thumb"
                            style={{
                              backgroundImage: song?.artwork
                                ? `url(${song.artwork})`
                                : `url(${psdPlaylistReferenceUrl})`,
                              backgroundPosition: row.artPosition,
                            }}
                            aria-hidden="true"
                          />
                          <span className="psd-playlist-title-copy">
                            <strong>{row.title}</strong>
                            <svg className="psd-playlist-row-heart" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                            </svg>
                          </span>
                        </button>
                      </td>
                      <td className="psd-playlist-col-artist">{row.artist}</td>
                      <td className="psd-playlist-col-duration">{row.duration}</td>
                      <td className="psd-playlist-col-menu">
                        <button type="button" className="psd-playlist-row-menu" aria-label={`More options for ${row.title}`}>
                          <PsdIconMore />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="psd-playlist-table-footer">{PSD_PLAYLIST_FOOTER_META}</p>
        </section>
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
            <button type="button" className="psd-liked-hero-edit" aria-label="Edit playlist cover">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </div>

          <div className="psd-liked-hero-copy">
            <h1 id="liked-heading" className="psd-liked-page-title">Liked Songs</h1>
            <p className="psd-liked-page-meta">{PSD_LIKED_META}</p>
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
                <button type="button" className="psd-liked-btn psd-liked-btn--more" aria-label="More options">
                  <PsdIconMore />
                </button>
              </div>
              <button type="button" className="psd-liked-add-playlist">
                <PsdIconPlus />
                Add to Playlist
              </button>
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
                {PSD_LIKED_TABLE_ROWS.map((row, index) => {
                  const song = resolveLikedSongAtIndex(index)
                  return (
                    <tr
                      key={row.key}
                      className={`psd-liked-table-row${'active' in row && row.active ? ' is-active' : ''}`}
                    >
                      <td className="psd-liked-col-index">
                        {'active' in row && row.active ? (
                          <PsdIconEqualizer className="psd-liked-row-equalizer" />
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="psd-liked-col-title">
                        <button
                          type="button"
                          className="psd-liked-title-btn"
                          onClick={() => playLikedSong(index)}
                        >
                          <span
                            className="psd-liked-row-thumb"
                            style={{
                              backgroundImage: song?.artwork
                                ? `url(${song.artwork})`
                                : `url(${psdLikedReferenceUrl})`,
                              backgroundPosition: row.artPosition,
                            }}
                            aria-hidden="true"
                          />
                          <span className="psd-liked-title-copy">
                            <strong>{row.title}</strong>
                            <svg className="psd-liked-row-heart" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                            </svg>
                          </span>
                        </button>
                      </td>
                      <td className="psd-liked-col-artist">{row.artist}</td>
                      <td className="psd-liked-col-album">{row.album}</td>
                      <td className="psd-liked-col-date">{row.dateAdded}</td>
                      <td className="psd-liked-col-duration">{row.duration}</td>
                      <td className="psd-liked-col-menu">
                        <button type="button" className="psd-liked-row-menu" aria-label={`More options for ${row.title}`}>
                          <PsdIconMore />
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return PSD_RECENT_TABLE_ROWS
    return PSD_RECENT_TABLE_ROWS.filter((row) => {
      const haystack = [
        row.title,
        row.subtitle,
        row.artist,
        row.itemType,
        row.played,
      ].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

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
                {visibleRows.map((row) => {
                  const index = PSD_RECENT_TABLE_ROWS.findIndex((entry) => entry.key === row.key)
                  const song = resolveRecentSongAtIndex(index)
                  return (
                    <tr key={row.key} className="psd-recent-table-row">
                      <td className="psd-recent-col-index">{index + 1}</td>
                      <td className="psd-recent-col-title">
                        <button
                          type="button"
                          className="psd-recent-title-btn"
                          onClick={() => playRecentSong(index)}
                          disabled={row.itemType !== 'Song'}
                        >
                          <span
                            className="psd-recent-row-thumb"
                            style={{
                              backgroundImage: song?.artwork
                                ? `url(${song.artwork})`
                                : `url(${psdRecentReferenceUrl})`,
                              backgroundPosition: row.artPosition,
                            }}
                            aria-hidden="true"
                          />
                          <span className="psd-recent-title-copy">
                            <strong>{row.title}</strong>
                            <span>{row.subtitle}</span>
                          </span>
                        </button>
                      </td>
                      <td className="psd-recent-col-artist">{row.artist}</td>
                      <td className="psd-recent-col-type">
                        <span className="psd-recent-type-pill">
                          <PsdRecentTypeIcon type={row.itemType} />
                          <span>{row.itemType}</span>
                        </span>
                      </td>
                      <td className="psd-recent-col-played">{row.played}</td>
                      <td className="psd-recent-col-duration">{row.duration}</td>
                      <td className="psd-recent-col-menu">
                        <button type="button" className="psd-recent-row-menu" aria-label={`More options for ${row.title}`}>
                          <PsdIconMore />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="psd-recent-table-footer">
              Showing 10 of your recently played items
            </p>
          </div>
        </section>
      </PageFrame>
    </div>
  )
}

/* Phase 42X-FIX-2: Downloads page desktop shell + PSD content */
function PsdDownloadsRowMenu() {
  return (
    <button type="button" className="psd-downloads-row-menu" aria-label="More options">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
      </svg>
    </button>
  )
}

function DownloadsPage({
  onOpenSong,
  query = '',
}: {
  onOpenSong: QueueSongHandler
  query?: string
}) {
  void query
  const { songs, indexes } = useCatalog()
  const queuePools = useMemo(() => buildQueueCandidatePools(indexes), [indexes])
  const [activeTab, setActiveTab] = useState<(typeof PSD_DOWNLOADS_TABS)[number]>('All')

  const resolveSong = useCallback(
    (title: string) => songs.find((song) => song.title.toLowerCase() === title.toLowerCase()) ?? null,
    [songs],
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

        <section className="psd-downloads-storage" aria-label="Storage usage">
          <div
            className="psd-downloads-ring"
            style={{ ['--downloads-ring-percent' as string]: PSD_DOWNLOADS_STORAGE_PERCENT }}
            aria-hidden="true"
          >
            <span>{PSD_DOWNLOADS_STORAGE_PERCENT}%</span>
          </div>
          <div className="psd-downloads-storage-copy">
            <strong>{PSD_DOWNLOADS_STORAGE_PERCENT}% of storage used</strong>
            <span>57.6 GB / 80 GB</span>
            <div className="psd-downloads-storage-bar">
              <div
                className="psd-downloads-storage-fill"
                style={{ width: `${PSD_DOWNLOADS_STORAGE_PERCENT}%` }}
              />
            </div>
          </div>
          <button type="button" className="psd-downloads-smart-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M12 3l1.8 4.6L18 9.4l-3.7 2.8L15.4 17 12 14.3 8.6 17l1.1-4.8L6 9.4l4.2-1.8L12 3z" />
            </svg>
            Smart Download
          </button>
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
          <button type="button" className="psd-downloads-sort">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Recently Downloaded
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {showPlaylists ? (
          <section className="psd-downloads-section" aria-label="Downloaded playlists">
            <h2 className="psd-downloads-section-title">Playlists (3)</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_PLAYLISTS.map((row) => (
                <li key={row.key} className="psd-downloads-row">
                  <span
                    className="psd-downloads-row-art"
                    style={{
                      backgroundImage: `url(${psdDownloadsReferenceUrl})`,
                      backgroundPosition: row.artPosition,
                    }}
                    aria-hidden="true"
                  />
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
                  <PsdDownloadsRowMenu />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showAlbums ? (
          <section className="psd-downloads-section" aria-label="Downloaded albums">
            <h2 className="psd-downloads-section-title">Albums (2)</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_ALBUMS.map((row) => (
                <li key={row.key} className="psd-downloads-row">
                  <span
                    className="psd-downloads-row-art"
                    style={{
                      backgroundImage: `url(${psdDownloadsReferenceUrl})`,
                      backgroundPosition: row.artPosition,
                    }}
                    aria-hidden="true"
                  />
                  <div className="psd-downloads-row-copy">
                    <p className="psd-downloads-row-title">
                      {row.title}
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
                  <PsdDownloadsRowMenu />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showSongs ? (
          <section className="psd-downloads-section" aria-label="Downloaded songs">
            <h2 className="psd-downloads-section-title">Songs (6)</h2>
            <ul className="psd-downloads-list">
              {PSD_DOWNLOADS_SONGS.map((row) => (
                <li key={row.key} className="psd-downloads-row">
                  <span
                    className="psd-downloads-row-art"
                    style={{
                      backgroundImage: `url(${psdDownloadsReferenceUrl})`,
                      backgroundPosition: row.artPosition,
                    }}
                    aria-hidden="true"
                  />
                  <div className="psd-downloads-row-copy">
                    <p className="psd-downloads-row-title">
                      {row.title}
                      <svg className="psd-downloads-row-badge" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </p>
                    <span className="psd-downloads-row-meta">{row.meta}</span>
                  </div>
                  <span className="psd-downloads-row-check" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12l2.5 2.5L16 9" />
                    </svg>
                  </span>
                  <PsdDownloadsRowMenu />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageFrame>
    </div>
  )
}

/* Phase 42B: no dedicated PSD reference — gold luxury from sidebar premium CTA */
function PremiumPage() {
  return (
    <div className="psd-premium-destination">
      <PageFrame cinematic>
        <section className="psd-premium-hero" aria-labelledby="premium-heading">
          <div className="psd-premium-glow" aria-hidden="true" />
          <p className="psd-page-eyebrow">Hidden Tunes Premium</p>
          <h1 id="premium-heading">Unlock Every World</h1>
          <p className="psd-page-subtitle">Gold luxury shell inferred from sidebar premium CTA — no dedicated full-page PSD.</p>
          <div className="psd-hero-actions">
            <button type="button" className="psd-btn psd-btn--gold">Go Premium</button>
            <button type="button" className="psd-btn psd-btn--ghost">Compare plans</button>
          </div>
        </section>
        <div className="psd-premium-grid">
          {['Lossless audio', 'Every emotional world', 'Cinema listening', 'Offline downloads'].map((perk) => (
            <article key={perk} className="psd-premium-card">
              <span className="psd-premium-card-icon" aria-hidden="true">✦</span>
              <strong>{perk}</strong>
            </article>
          ))}
        </div>
      </PageFrame>
    </div>
  )
}

function TvPage() {
  return (
    <PageFrame>
      <PageHeader
        eyebrow="Visual stories"
        title="Hidden Tunes TV"
        description="Cinematic sessions, residencies, and visual albums — the moving image of emotion."
      />
      <section className="tv-featured" aria-label="Featured broadcast">
        <div className="tv-featured-bg" />
        <div className="tv-featured-inner">
          <p className="hero-eyebrow">Now premiering</p>
          <h2>Mood Room Live — Violet Hour</h2>
          <p className="page-description">An immersive 48-minute session · UI preview only</p>
          <button type="button" className="btn-primary">
            Watch preview
          </button>
        </div>
      </section>
      <div className="card-row">
        {TV_SHOWS.map((show) => (
          <article key={show.title} className="discovery-card tv-card" data-mood={show.mood}>
            <div className="card-art tv-card-art">
              <svg className="play-badge" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            </div>
            <div className="card-info">
              <h3>{show.title}</h3>
              <p>{show.subtitle}</p>
            </div>
          </article>
        ))}
      </div>
    </PageFrame>
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

function SettingsPage() {
  const { audioQualityMode, setAudioQualityMode } = useDesktopPlayback()
  const { resetDesktopPreferencesState } = usePreferencesReset()
  const { clearCatalogCache } = useCatalog()
  const [resetNotice, setResetNotice] = useState('')
  const [cacheNotice, setCacheNotice] = useState('')

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

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}


const PlaybackTransportControls = memo(function PlaybackTransportControls({
  activeTrackId,
  className = 'player-controls',
}: {
  activeTrackId: string | null
  className?: string
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    pause,
    resume,
    next,
    previous,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && currentIndex > 0
  const hasNext =
    isActive && currentIndex >= 0 && currentIndex < currentQueue.length - 1
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

  return (
    <div className={`transport-controls ${className}`} role="group" aria-label="Playback controls">
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
    </div>
  )
})

const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
}: {
  activeTrackId: string | null
}) {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    pause,
    resume,
    next,
    previous,
  } = useDesktopPlayback()

  const isActive = Boolean(activeTrackId && currentTrack?.id === activeTrackId)
  const hasPrevious = isActive && currentIndex > 0
  const hasNext =
    isActive && currentIndex >= 0 && currentIndex < currentQueue.length - 1
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

  return (
    <div className="transport-controls psd-player-transport" role="group" aria-label="Playback controls">
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--shuffle"
        aria-label="Shuffle"
        title="Shuffle"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--skip"
        onClick={previous}
        disabled={!hasPrevious}
        aria-label={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
        title={hasPrevious ? 'Previous track' : 'Previous track unavailable'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>
      <button
        type="button"
        className={
          'psd-player-transport-btn psd-player-transport-btn--play'
          + (showPlaying ? ' is-active' : '')
          + (showLoading ? ' is-loading' : '')
        }
        onClick={handlePlayPause}
        disabled={!isActive || isLoading}
        aria-label={playLabel}
        aria-busy={showLoading}
        title={playLabel}
      >
        <span className="psd-player-transport-play-icon" aria-hidden="true">
          {showLoading ? (
            <span className="player-spinner player-spinner--transport" />
          ) : showPlaying ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--skip"
        onClick={next}
        disabled={!hasNext}
        aria-label={hasNext ? 'Next track' : 'Next track unavailable'}
        title={hasNext ? 'Next track' : 'Next track unavailable'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2V6z" />
        </svg>
      </button>
      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--repeat"
        aria-label="Repeat"
        title="Repeat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>
    </div>
  )
})

const PlayerBar = memo(function PlayerBar({
  track,
  onOpenCinema,
  onOpenPlayer2,
  onOpenPlayer3,
}: {
  track: ApiSong | null
  onOpenCinema?: () => void
  onOpenPlayer2?: () => void
  onOpenPlayer3?: () => void
}) {
  const { songs } = useCatalog()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    queueTitle,
    isPlaying,
    isLoading,
    error,
    positionSeconds,
    durationSeconds,
    volume,
    audioQualityMode,
    setAudioQualityMode,
    seekTo,
    setVolume,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = track ?? currentTrack
  const title = displayTrack?.title ?? 'Nothing playing'
  const artist = displayTrack?.artist ?? 'Select a song to begin'
  const progressMax = durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const showQueuePosition = currentQueue.length > 1 && currentIndex >= 0
  const queueLabel = QUEUE_CONTEXT_LABELS[queueContext]
  const isBarActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)

  const barQueueSnapshot = useMemo(
    () =>
      isBarActive
        ? analyzeQueueSnapshot({
            queue: currentQueue,
            currentIndex,
            currentTrack,
          })
        : null,
    [currentIndex, currentQueue, currentTrack, isBarActive],
  )

  const barQueueInsight = useMemo(
    () => (barQueueSnapshot ? describeQueueInsight(barQueueSnapshot) : null),
    [barQueueSnapshot],
  )

  const playerListeningContext = useMemo(
    () =>
      buildListeningContext({
        track: displayTrack,
        catalog: songs,
        queueContext,
        queueTitle,
        queueInsight: barQueueInsight,
        isPlaying,
        isLoading,
        isActive: isBarActive,
      }),
    [
      barQueueInsight,
      displayTrack,
      isBarActive,
      isLoading,
      isPlaying,
      queueContext,
      queueTitle,
      songs,
    ],
  )

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
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
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
    >
      <div className="player-track">
        <div className="player-artwork" aria-hidden="true">
          {displayTrack ? (
            <ArtworkImage src={displayTrack.artwork} alt="" seed={displayTrack.id} priority />
          ) : null}
        </div>
        <div className="player-meta">
          <h4>{title}</h4>
          <p>{artist}</p>
          <div className="player-track-actions" aria-hidden="true">
            <button type="button" className="player-inline-icon-btn" tabIndex={-1}><PsdIconHeart /></button>
            <button type="button" className="player-inline-icon-btn" tabIndex={-1}><PsdIconMore /></button>
          </div>
          {showQueuePosition ? (
            <p className="player-queue-position">
              {queueLabel} · Track {currentIndex + 1} of {currentQueue.length}
            </p>
          ) : null}
          <ListeningContextStrip
            lines={playerListeningContext}
            className="listening-context-strip listening-context-strip--player"
          />
          {error ? <p className="player-error">{error}</p> : null}
        </div>
      </div>

      <div className="player-center">
        <PlaybackTransportControls activeTrackId={displayTrack?.id ?? null} />
        <div
          className="progress-wrap"
          role="group"
          aria-label="Playback progress"
        >
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
        </div>
      </div>

      <div className="player-right">
        {onOpenPlayer3 ? (
          <button
            type="button"
            className="player-cinema-btn player-cinema-btn--player3"
            onClick={onOpenPlayer3}
            aria-label="Open Player 3 VIP theater"
            title="Player 3 VIP"
          >
            <span aria-hidden="true">♛</span>
          </button>
        ) : null}
        {onOpenPlayer2 ? (
          <button
            type="button"
            className="player-cinema-btn player-cinema-btn--player2"
            onClick={onOpenPlayer2}
            aria-label="Open Player 2 theater"
            title="Player 2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        ) : null}
        {onOpenCinema ? (
          <button
            type="button"
            className="player-cinema-btn"
            onClick={onOpenCinema}
            aria-label="Open fullscreen player"
            title="Fullscreen"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
            </svg>
          </button>
        ) : null}
        <div className="player-quality">
          <AudioQualitySelector
            value={audioQualityMode}
            onChange={setAudioQualityMode}
            compact
          />
        </div>
        <div className={`player-volume player-volume--${volumeLevel}`}>
        <button
          type="button"
          className="control-btn"
          aria-label={
            volume <= 0
              ? 'Volume muted'
              : volume < 0.35
                ? 'Volume low'
                : 'Volume'
          }
          tabIndex={-1}
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
  onOpenPlayer2,
  onOpenPlayer3,
  activeNavKey,
}: {
  onOpenPlayer2?: () => void
  onOpenPlayer3?: () => void
  activeNavKey?: NavKey
}) {
  const isLuxuryRail = activeNavKey === 'albums' || activeNavKey === 'playlists'
  const luxuryRailKind = activeNavKey === 'playlists' ? 'playlists' : 'albums'
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    getUpcomingTracks,
    seekTo,
    volume,
    setVolume,
  } = useDesktopPlayback()

  const listScrollRef = useRef<HTMLOListElement>(null)
  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)
  const activeTrackId = currentTrack?.id ?? null

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)
  const upcomingTracks = getUpcomingTracks()
  const liveProgressMax = hasPlayback && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  useEffect(() => {
    if (!listScrollRef.current) return
    listScrollRef.current.scrollTop = 0
  }, [activeTrackId, currentIndex])

  const displayTitle = activeTrack?.title ?? (
    luxuryRailKind === 'playlists'
      ? PSD_PLAYLIST_TRACK_ROWS[0].title
      : luxuryRailKind === 'albums'
        ? PSD_ALBUMS_RAIL_TITLE
        : PSD_PLAYER_TITLE
  )
  const displayArtist = activeTrack?.artist ?? (
    luxuryRailKind === 'playlists'
      ? PSD_PLAYLIST_TRACK_ROWS[0].artist
      : luxuryRailKind === 'albums'
        ? PSD_ALBUMS_RAIL_ARTIST
        : PSD_PLAYER_ARTIST
  )

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!hasPlayback || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasPlayback || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
  }, [])

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

  const luxuryFallbackQueue = luxuryRailKind === 'playlists'
    ? PSD_PLAYLIST_UP_NEXT_ROWS
    : PSD_ALBUMS_UP_NEXT_ROWS

  const queueRows = upcomingTracks.length > 0
    ? upcomingTracks.slice(0, 4).map((track, index) => ({
        key: `${track.id}-${index}`,
        title: track.title,
        artist: track.artist,
        artPosition: (isLuxuryRail ? luxuryFallbackQueue : PSD_RAIL_QUEUE_ROWS)[index]?.artPosition ?? '50% 58%',
        duration: isLuxuryRail && luxuryFallbackQueue[index] && 'duration' in luxuryFallbackQueue[index]
          ? luxuryFallbackQueue[index].duration
          : undefined,
        track,
      }))
    : (isLuxuryRail ? luxuryFallbackQueue : PSD_RAIL_QUEUE_ROWS).map((row) => ({
        key: row.key,
        title: row.title,
        artist: row.artist,
        artPosition: row.artPosition,
        duration: 'duration' in row ? row.duration : undefined,
        track: null as ApiSong | null,
      }))

  const luxuryArtUrl = luxuryRailKind === 'playlists' ? psdPlaylistReferenceUrl : psdAlbumsReferenceUrl
  const luxuryArtPosition = luxuryRailKind === 'playlists'
    ? PSD_PLAYLIST_RAIL_ART_POSITION
    : PSD_ALBUMS_RAIL_ART_POSITION

  if (isLuxuryRail) {
    return (
      <aside
        className={`queue-rail now-playing-rail now-playing-rail--albums-luxury${luxuryRailKind === 'playlists' ? ' now-playing-rail--playlists-luxury' : ''}`}
        aria-label="Now playing"
        data-playing={isPlaying ? 'true' : 'false'}
        data-loading={isLoading ? 'true' : 'false'}
        data-idle={hasPlayback ? 'false' : 'true'}
      >
        <div className="now-playing-rail-inner">
          <header className="albums-rail-header">
            <h2 className="albums-rail-title">Now Playing</h2>
            <span className="albums-rail-waveform-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4 14V10M8 16V8M12 18V6M16 14V10M20 16V8" />
              </svg>
            </span>
          </header>

          <section className="albums-rail-stage" aria-label="Current track">
            <div className="albums-rail-art-shell">
              <span className="albums-rail-art-glow" aria-hidden="true" />
              <span className="albums-rail-vinyl premium-vinyl-disc" aria-hidden="true" />
              <div className="albums-rail-art-frame">
                {hasPlayback && activeTrack ? (
                  <ArtworkImage
                    src={activeTrack.artwork}
                    alt=""
                    seed={activeTrack.id}
                    priority
                  />
                ) : (
                  <span
                    className="albums-rail-art-fallback"
                    style={{
                      backgroundImage: `url(${luxuryArtUrl})`,
                      backgroundPosition: luxuryArtPosition,
                    }}
                    aria-hidden="true"
                  />
                )}
                {isLoading ? (
                  <span className="albums-rail-art-spinner player-spinner" aria-hidden="true" />
                ) : null}
              </div>
            </div>

            <div className="albums-rail-track-row">
              <div className="albums-rail-track-copy">
                <h3 className="albums-rail-track-title">{displayTitle}</h3>
                <p className="albums-rail-track-artist">
                  <span>{displayArtist}</span>
                  <PsdIconVerified className="albums-rail-verified" />
                </p>
              </div>
              <button type="button" className="albums-rail-heart" aria-label="Favorite">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
            </div>

            <div
              className="albums-rail-waveform-wrap"
              style={{ ['--albums-rail-progress' as string]: `${progressPercent}%` }}
            >
              <PremiumReactiveWaveform
                trackId={activeTrackId}
                progressPercent={progressPercent}
                progressMax={liveProgressMax}
                isLoading={isLoading && hasPlayback}
                onSeek={seekTo}
                className="albums-rail-waveform"
              />
            </div>

            <div className="albums-rail-transport-wrap">
              <FullPlayerTransportControls activeTrackId={activeTrack?.id ?? null} />
            </div>

            <div className="albums-rail-badges">
              {luxuryRailKind === 'albums' ? (
                <span className="albums-rail-quality-pill">High Quality</span>
              ) : null}
              <span className="albums-rail-format-pill">FLAC • 24bit • 48kHz</span>
            </div>
          </section>

          <section className="albums-rail-up-next" aria-label="Up next">
            <div className="albums-rail-up-next-header">
              <h3 className="albums-rail-up-next-title">Up Next</h3>
              <button type="button" className="albums-rail-up-next-clear">Clear</button>
            </div>

            <ol className="albums-rail-up-next-list" ref={listScrollRef}>
              {queueRows.map((row) => (
                <li className="albums-rail-up-next-item" key={row.key}>
                  <div className="albums-rail-up-next-thumb" aria-hidden="true">
                    {row.track ? (
                      <ArtworkImage src={row.track.artwork} alt="" seed={row.track.id} />
                    ) : (
                      <span
                        className="albums-rail-up-next-thumb-fallback"
                      style={{
                        backgroundImage: `url(${luxuryArtUrl})`,
                        backgroundPosition: row.artPosition,
                      }}
                      />
                    )}
                  </div>
                  <div className="albums-rail-up-next-copy">
                    <span className="albums-rail-up-next-track">{row.title}</span>
                    <span className="albums-rail-up-next-artist">{row.artist}</span>
                  </div>
                  {row.duration ? (
                    <span className="albums-rail-up-next-duration">{row.duration}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section
            className={luxuryRailKind === 'playlists' ? 'playlist-stats-rail-panel' : 'album-stats-rail-panel'}
            aria-label={luxuryRailKind === 'playlists' ? 'Playlist stats' : 'Album stats'}
          >
            <h3 className="album-stats-rail-title">
              {luxuryRailKind === 'playlists' ? 'Playlist Stats' : 'Album Stats'}
            </h3>
            <div className="album-stats-rail-grid">
              {(luxuryRailKind === 'playlists' ? PSD_PLAYLIST_STATS_ROWS : PSD_ALBUM_STATS_ROWS).map((stat) => (
                <article key={stat.label} className="album-stats-rail-card">
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </article>
              ))}
            </div>
            <p className="album-stats-rail-updated">
              <span className="album-stats-rail-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              Last Updated {luxuryRailKind === 'playlists' ? PSD_PLAYLIST_STATS_UPDATED : PSD_ALBUM_STATS_UPDATED}
            </p>
          </section>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="queue-rail now-playing-rail now-playing-rail--psd"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >
      <div className="now-playing-rail-inner">
        <header className="rail-psd-header">
          <h2 className="rail-psd-title">Now Playing</h2>
          <button type="button" className="rail-psd-close" aria-label="Close now playing">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <section className="rail-psd-stage" aria-label="Current track">
          <div className="rail-psd-art-shell">
            <span className="rail-psd-art-glow" aria-hidden="true" />
            <span className="rail-psd-vinyl premium-vinyl-disc" aria-hidden="true" />
            <div className="rail-psd-art-frame">
              {hasPlayback && activeTrack ? (
                <ArtworkImage
                  src={activeTrack.artwork}
                  alt=""
                  seed={activeTrack.id}
                  priority
                />
              ) : (
                <span
                  className="rail-psd-art-fallback"
                  style={{
                    backgroundImage: `url(${psdNowPlayingReferenceUrl})`,
                    backgroundPosition: PSD_RAIL_ART_POSITION,
                  }}
                  aria-hidden="true"
                />
              )}
              {isLoading ? (
                <span className="rail-psd-art-spinner player-spinner" aria-hidden="true" />
              ) : null}
            </div>
          </div>

          <div className="rail-psd-track-head">
            <div className="rail-psd-title-row">
              <h3 className="rail-psd-track-title">{displayTitle}</h3>
              <button type="button" className="rail-psd-heart" aria-label="Favorite">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
            </div>
            <p className="rail-psd-track-artist">
              <span>{displayArtist}</span>
              <PsdIconVerified className="rail-psd-verified" />
            </p>
          </div>

          <div className="rail-psd-quality-row">
            <span className="rail-psd-hq-pill">HQ</span>
            <span className="rail-psd-format-copy">24-bit • 48kHz</span>
            <button type="button" className="rail-psd-more-btn" aria-label="More options">
              <PsdIconMore />
            </button>
          </div>

          <div
            className="rail-psd-progress-wrap"
            style={{ ['--rail-psd-progress' as string]: `${progressPercent}%` }}
          >
            <div
              ref={progressTrackRef}
              className={
                'rail-psd-progress-track'
                + (liveProgressMax > 0 && hasPlayback ? ' is-interactive' : '')
              }
              role="slider"
              aria-label="Seek position"
              aria-valuemin={0}
              aria-valuemax={Math.round(progressMax)}
              aria-valuenow={Math.round(progressValue)}
              aria-disabled={!hasPlayback || liveProgressMax <= 0 || isLoading}
              onClick={handleSeekClick}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerUp}
            >
              <div className="rail-psd-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="rail-psd-progress-times" aria-hidden="true">
              <span>{formatPlaybackTime(progressValue)}</span>
              <span>{formatPlaybackTime(progressMax)}</span>
            </div>
          </div>

          <div className="rail-psd-transport-wrap">
            <FullPlayerTransportControls activeTrackId={activeTrack?.id ?? null} />
          </div>

          <div className="rail-psd-actions" role="group" aria-label="Player actions">
            <button type="button" className="rail-psd-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span>Lyrics</span>
            </button>
            <button type="button" className="rail-psd-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                <path d="M6 9l4 3-4 3V9z" fill="currentColor" stroke="none" />
              </svg>
              <span>Queue</span>
            </button>
            <button type="button" className="rail-psd-action">
              <PsdIconEqualizer className="rail-psd-action-icon" />
              <span>Equalizer</span>
            </button>
            <button type="button" className="rail-psd-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="4" width="18" height="12" rx="2" />
                <path d="M7 20h10" />
              </svg>
              <span>Device</span>
            </button>
          </div>
        </section>

        <section className="rail-psd-queue-section" aria-label="Next in queue">
          <div className="rail-psd-queue-header">
            <h3 className="rail-psd-queue-title">Next In Queue</h3>
            <button type="button" className="rail-psd-queue-clear">Clear</button>
          </div>

          <ol className="rail-psd-queue-list" ref={listScrollRef}>
            {queueRows.map((row) => (
              <li className="rail-psd-queue-item" key={row.key}>
                <div className="rail-psd-queue-thumb" aria-hidden="true">
                  {row.track ? (
                    <ArtworkImage src={row.track.artwork} alt="" seed={row.track.id} />
                  ) : (
                    <span
                      className="rail-psd-queue-thumb-fallback"
                      style={{
                        backgroundImage: `url(${psdNowPlayingReferenceUrl})`,
                        backgroundPosition: row.artPosition,
                      }}
                    />
                  )}
                </div>
                <div className="rail-psd-queue-copy">
                  <span className="rail-psd-queue-track">{row.title}</span>
                  <span className="rail-psd-queue-artist">{row.artist}</span>
                </div>
                <span className="rail-psd-queue-drag" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 8h16M4 12h16M4 16h16" />
                  </svg>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="rail-psd-footer">
          <div className="rail-psd-volume" role="group" aria-label="Volume">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
            <div
              ref={volumeTrackRef}
              className="rail-psd-volume-track"
              style={{ ['--rail-psd-volume' as string]: `${volumePercent}%` }}
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
              <div className="rail-psd-volume-fill" style={{ width: `${volumePercent}%` }} />
            </div>
          </div>
          {onOpenPlayer3 ? (
            <button type="button" className="rail-psd-full-player" onClick={onOpenPlayer3}>
              Show Full Player
            </button>
          ) : null}
          <button type="button" className="rail-psd-expand" aria-label="Expand player" onClick={onOpenPlayer2}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </footer>
      </div>
    </aside>
  )
})
type ActiveView = 'page' | 'song' | 'album' | 'artist' | 'mood'

function ListeningContextStrip({
  lines,
  className = 'listening-context-strip',
}: {
  lines: ListeningContextLines
  className?: string
}) {
  if (
    !lines.atmosphereLine
    && lines.contextPills.length === 0
    && !lines.insightLine
  ) {
    return null
  }

  return (
    <div className={className}>
      {lines.atmosphereLine ? (
        <p className="listening-context-atmosphere">{lines.atmosphereLine}</p>
      ) : null}
      {lines.contextPills.length > 0 ? (
        <div className="listening-context-pills">
          {lines.contextPills.map((pill) => (
            <span className="listening-context-pill" key={pill}>
              {pill}
            </span>
          ))}
        </div>
      ) : null}
      {lines.insightLine ? (
        <p className="listening-context-insight">{lines.insightLine}</p>
      ) : null}
    </div>
  )
}

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


const CinemaPlayerShell = memo(function CinemaPlayerShell({
  onClose,
  onOpenLyrics,
  onOpenWaveform,
  preferredTrack = null,
}: {
  onClose: () => void
  onOpenLyrics?: () => void
  onOpenWaveform?: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    volume,
    setVolume,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'queue' | 'details'>('lyrics')

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0
    ? liveProgressValue
    : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? PSD_PLAYER_TITLE
  const displayArtist = displayTrack?.artist ?? PSD_PLAYER_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_PLAYER_SOURCE_ALBUM
  const activeTrackId = displayTrack?.id ?? null

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
  }, [])

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="cinema-player cinema-player--psd cinema-player--psd-master"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen player"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      <div
        className="psd-player-master-bg"
        style={{
          backgroundImage: `url(${psdPlayerMasterReferenceUrl})`,
          backgroundPosition: PSD_PLAYER_MASTER_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="psd-player-master-veil" aria-hidden="true" />

      <header className="psd-player-topbar psd-player-topbar--master">
        <button
          type="button"
          className="psd-player-topbar-btn psd-player-topbar-btn--back"
          onClick={onClose}
          aria-label="Exit fullscreen player"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="psd-player-topbar-copy">
          <span className="psd-player-topbar-eyebrow">PLAYING FROM</span>
          <p className="psd-player-topbar-source">
            <strong>{displayAlbum}</strong>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#a855f7" aria-hidden="true">
              <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
            </svg>
          </p>
        </div>
        <button
          type="button"
          className="psd-player-topbar-btn psd-player-topbar-btn--menu"
          aria-label="More options"
        >
          <PsdIconMore />
        </button>
      </header>

      <div className="psd-player-master-body">
        <div className="psd-player-master-left">
          <div className="psd-player-art-shell psd-player-art-shell--master">
            <div className="psd-player-art-halo" aria-hidden="true" />
            <div className="psd-player-art-frame">
              {displayTrack?.artwork ? (
                <ArtworkImage
                  src={displayTrack.artwork}
                  alt=""
                  seed={displayTrack.id}
                  priority
                />
              ) : (
                <span
                  className="psd-player-art-fallback"
                  style={{
                    backgroundImage: `url(${psdPlayerMasterReferenceUrl})`,
                    backgroundPosition: PSD_PLAYER_MASTER_ART_POSITION,
                  }}
                  aria-hidden="true"
                />
              )}
              {isLoading && isActive ? (
                <span className="psd-player-art-spinner player-spinner" aria-hidden="true" />
              ) : null}
            </div>
          </div>

          <div className="psd-player-master-meta">
            <div className="psd-player-master-badge">
              <PsdWaveformStrip className="psd-player-master-badge-wave" />
              <span>MASTER</span>
            </div>
            <h2 className="psd-player-track-title">{displayTitle}</h2>
            <p className="psd-player-track-artist psd-player-track-artist--master">
              <span>{displayArtist}</span>
              <PsdIconVerified className="psd-player-verified" />
            </p>
            <div className="psd-player-master-actions" role="group" aria-label="Track actions">
              <button type="button" className="psd-player-master-action" aria-label="Favorite">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#a855f7" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
              <button type="button" className="psd-player-master-action" aria-label="Share">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
                </svg>
              </button>
              <button type="button" className="psd-player-master-action" aria-label="More options">
                <PsdIconMore />
              </button>
            </div>
          </div>
        </div>

        <div className="psd-player-master-right">
          <div className="psd-player-master-tabs" role="tablist" aria-label="Player panels">
            {PSD_PLAYER_TABS.map((tab) => {
              const tabKey = tab.toLowerCase() as 'lyrics' | 'queue' | 'details'
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  className={`psd-player-master-tab${playerTab === tabKey ? ' is-active' : ''}`}
                  aria-selected={playerTab === tabKey}
                  onClick={() => setPlayerTab(tabKey)}
                >
                  {tab}
                </button>
              )
            })}
          </div>

          {playerTab === 'lyrics' ? (
            <div className="psd-player-master-lyrics" role="tabpanel" aria-label="Lyrics">
              <span className="psd-player-master-quote" aria-hidden="true">“</span>
              <div className="psd-player-master-lyrics-body">
                {PSD_PLAYER_LYRICS_LINES.map((line) => (
                  <p
                    key={line.text}
                    className={`psd-player-master-lyric-line psd-player-master-lyric-line--${line.tier}`}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
              <p className="psd-player-master-lyrics-credit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Written by {displayArtist}
              </p>
            </div>
          ) : null}

          {playerTab === 'queue' ? (
            <div className="psd-player-master-panel-placeholder" role="tabpanel" aria-label="Queue">
              <p>Queue</p>
            </div>
          ) : null}

          {playerTab === 'details' ? (
            <div className="psd-player-master-panel-placeholder" role="tabpanel" aria-label="Details">
              <p>Details</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="psd-player-master-bottom">
        <div className="psd-player-master-waveform-row">
          <span className="psd-player-master-time">{formatPlaybackTime(progressValue)}</span>
          <div
            className="psd-player-waveform-wrap psd-player-waveform-wrap--master"
            style={{ ['--psd-player-progress' as string]: `${progressPercent}%` }}
          >
            <PremiumReactiveWaveform
              trackId={activeTrackId}
              progressPercent={progressPercent}
              progressMax={liveProgressMax}
              isLoading={isLoading && isActive}
              onSeek={seekTo}
              className="psd-player-waveform psd-player-waveform--master"
              barCount={72}
            />
          </div>
          <span className="psd-player-master-time">{formatPlaybackTime(progressMax)}</span>
          <div className="psd-player-master-badges" aria-label="Audio quality">
            <span className="psd-player-master-badge-pill psd-player-master-badge-pill--flac">FLAC</span>
            <span className="psd-player-master-badge-pill">24-bit</span>
            <span className="psd-player-master-badge-pill">48kHz</span>
            <span className="psd-player-master-badge-pill psd-player-master-badge-pill--icon" aria-label="Spatial audio">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M8 9v6M16 9v6M12 5v14" />
              </svg>
            </span>
          </div>
        </div>

        <FullPlayerTransportControls activeTrackId={activeTrackId} />

        <footer className="psd-player-master-footer">
          <div className="psd-player-master-volume">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
            </svg>
            <div
              ref={volumeTrackRef}
              className="psd-player-master-volume-track"
              style={{ ['--volume-handle' as string]: `${volumePercent}%` }}
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
              <div className="psd-player-master-volume-fill" style={{ width: `${volumePercent}%` }} />
            </div>
          </div>

          <div className="psd-player-master-utilities" role="toolbar" aria-label="Player utilities">
            <button type="button" className="psd-player-master-utility" aria-label="Live waveform" onClick={onOpenWaveform}>
              <PsdIconEqualizer className="psd-player-master-utility-icon" />
            </button>
            <button type="button" className="psd-player-master-utility" aria-label="Brightness">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </button>
            <button
              type="button"
              className="psd-player-master-utility"
              aria-label="Queue"
              onClick={() => setPlayerTab('queue')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                <path d="M6 9l4 3-4 3V9z" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <button type="button" className="psd-player-master-utility" aria-label="Open lyrics" onClick={onOpenLyrics}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
              </svg>
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
})

const Player2Shell = memo(function Player2Shell({
  onClose,
  onNavigateNav,
  onOpenLyrics,
  onOpenWaveform,
  preferredTrack = null,
}: {
  onClose: () => void
  onNavigateNav?: (navKey: NavKey) => void
  onOpenLyrics?: () => void
  onOpenWaveform?: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    volume,
    setVolume,
    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayArtist = displayTrack?.artist ?? PSD_PLAYER2_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_PLAYER2_ALBUM
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTrack = getUpcomingTracks()[0] ?? null
  const nextTitle = upcomingTrack?.title ?? PSD_PLAYER2_NEXT_TITLE
  const nextArtist = upcomingTrack?.artist ?? PSD_PLAYER2_NEXT_ARTIST

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleNav = (navKey: NavKey) => {
    onClose()
    onNavigateNav?.(navKey)
  }

  return (
    <div
      className="player2-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Player 2 theater"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
    >
      <div
        className="player2-bg"
        style={{
          backgroundImage: `url(${psdPlayer2ReferenceUrl})`,
          backgroundPosition: PSD_PLAYER2_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="player2-bg-glow" aria-hidden="true" />
      <div className="player2-veil" aria-hidden="true" />

      <button type="button" className="player2-collapse" onClick={onClose} aria-label="Exit Player 2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div className="player2-layout">
        <aside className="player2-sidebar" aria-label="Navigation">
          <div className="player2-brand">
            <BrandWaveformMark />
            <span className="player2-brand-name">Hidden Tunes</span>
          </div>
          <nav className="player2-nav">
            {PSD_PLAYER2_SIDEBAR_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className="player2-nav-item"
                onClick={() => handleNav(item.key as NavKey)}
              >
                <span className="player2-nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="player2-profile">
            <span className="player2-profile-avatar" aria-hidden="true" />
            <div className="player2-profile-copy">
              <strong>{displayArtist}</strong>
              <span className="player2-profile-badge">PREMIUM</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </aside>

        <main className="player2-main">
          <header className="player2-header">
            <div className="player2-quality-badges">
              <span className="player2-quality-flac">FLAC</span>
              <span className="player2-quality-spec">24-BIT / 48KHZ</span>
            </div>
            <button type="button" className="player2-header-menu" aria-label="More options">
              <PsdIconMore />
            </button>
          </header>

          <div className="player2-hero">
            <div className="player2-art-wrap">
              <div className="player2-art-glow" aria-hidden="true" />
              <div className="player2-art-frame">
                {displayTrack?.artwork ? (
                  <ArtworkImage src={displayTrack.artwork} alt="" seed={displayTrack.id} priority />
                ) : (
                  <span
                    className="player2-art-fallback"
                    style={{
                      backgroundImage: `url(${psdPlayer2ReferenceUrl})`,
                      backgroundPosition: PSD_PLAYER2_ART_POSITION,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
              <button type="button" className="player2-art-play" aria-label="Play from artwork">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>

            <div className="player2-track-copy">
              <p className="player2-eyebrow">
                <PsdWaveformStrip className="player2-eyebrow-wave" />
                NOW PLAYING
              </p>
              <h1 className="player2-title">
                <span>{PSD_PLAYER2_TITLE_TOP}</span>
                <span className="player2-title-mid">{PSD_PLAYER2_TITLE_MID}</span>
                <span>{PSD_PLAYER2_TITLE_BOTTOM}</span>
              </h1>
              <p className="player2-artist">
                <span>{displayArtist}</span>
                <PsdIconVerified className="player2-verified" />
              </p>
              <p className="player2-meta">{displayAlbum} • {PSD_PLAYER2_YEAR}</p>
              <div className="player2-track-actions">
                <button type="button" className="player2-heart" aria-label="Favorite">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#a855f7" aria-hidden="true">
                    <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                  </svg>
                </button>
                <span className="player2-mastered-badge">
                  <PsdWaveformStrip className="player2-mastered-wave" />
                  MASTERED
                </span>
                <button type="button" className="player2-track-menu" aria-label="More options">
                  <PsdIconMore />
                </button>
              </div>
            </div>
          </div>

          <div className="player2-waveform-block">
            <div className="player2-waveform-row">
              <span className="player2-time">{formatPlaybackTime(progressValue)}</span>
              <PremiumReactiveWaveform
                trackId={activeTrackId}
                progressPercent={progressPercent}
                progressMax={liveProgressMax}
                isLoading={isLoading && isActive}
                onSeek={seekTo}
                className="player2-waveform premium-reactive-waveform"
                barCount={80}
              />
              <span className="player2-time">{formatPlaybackTime(progressMax)}</span>
            </div>
            <div
              className="player2-progress-line"
              style={{ ['--player2-progress' as string]: `${progressPercent}%` }}
              aria-hidden="true"
            >
              <span className="player2-progress-fill" />
            </div>
          </div>

          <div className="player2-controls-row">
            <FullPlayerTransportControls activeTrackId={activeTrackId} />
            <div className="player2-tools" role="group" aria-label="Player tools">
              <button type="button" className="player2-tool" aria-label="Equalizer" onClick={onOpenWaveform}>
                <PsdIconEqualizer />
                <span>EQUALIZER</span>
              </button>
              <button type="button" className="player2-tool" aria-label="Soundstage">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                <span>SOUNDSTAGE</span>
              </button>
              <button type="button" className="player2-tool" aria-label="Timer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2 2M9 2h6" />
                </svg>
                <span>TIMER</span>
              </button>
            </div>
          </div>

          <footer className="player2-status-bar">
            <button type="button" className="player2-device">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M3 18v-6a9 9 0 0118 0v6" />
                <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
              </svg>
              <span className="player2-device-label">Headphones</span>
              <strong className="player2-device-model">{PSD_PLAYER2_DEVICE}</strong>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <div className="player2-status-volume">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
              </svg>
              <div
                ref={volumeTrackRef}
                className="player2-volume-track"
                style={{ ['--player2-volume' as string]: `${volumePercent}%` }}
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
                <div className="player2-volume-fill" style={{ width: `${volumePercent}%` }} />
              </div>
              <span className="player2-volume-label">{Math.round(volumePercent)}%</span>
            </div>

            <div className="player2-queue-preview">
              <button type="button" className="player2-queue-btn">
                PLAY QUEUE
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <div className="player2-next-card">
                <span
                  className="player2-next-thumb"
                  style={
                    upcomingTrack?.artwork
                      ? { backgroundImage: `url(${upcomingTrack.artwork})` }
                      : { backgroundImage: `url(${psdPlayer2ReferenceUrl})`, backgroundPosition: '72% 58%' }
                  }
                  aria-hidden="true"
                />
                <div className="player2-next-copy">
                  <strong>{nextTitle}</strong>
                  <span>{nextArtist}</span>
                </div>
                <button type="button" className="player2-next-play" aria-label={`Play ${nextTitle}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </footer>
        </main>

        <aside className="player2-lyrics-panel" aria-label="Lyrics">
          <h2 className="player2-lyrics-heading">LYRICS</h2>
          <div className="player2-lyrics-active">
            <span className="player2-lyrics-quote" aria-hidden="true">“</span>
            {PSD_PLAYER2_LYRICS_ACTIVE.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="player2-lyrics-scroll">
            {PSD_PLAYER2_LYRICS_BODY.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <button type="button" className="player2-lyrics-more" onClick={onOpenLyrics}>
            SHOW FULL LYRICS
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </aside>
      </div>
    </div>
  )
})

const Player3Shell = memo(function Player3Shell({
  onClose,
  onNavigateNav,
  onOpenLyrics,
  onOpenWaveform,
  preferredTrack = null,
}: {
  onClose: () => void
  onNavigateNav?: (navKey: NavKey) => void
  onOpenLyrics?: () => void
  onOpenWaveform?: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    currentQueue,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    volume,
    setVolume,
    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<'lyrics' | 'visualizer' | 'details'>('lyrics')

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayArtist = displayTrack?.artist ?? PSD_PLAYER3_ARTIST
  const activeTrackId = displayTrack?.id ?? null
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return PSD_PLAYER3_UP_NEXT
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      active: index === 0,
      artPosition: PSD_PLAYER3_UP_NEXT[index]?.artPosition ?? '18% 58%',
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleNav = (navKey: NavKey) => {
    onClose()
    onNavigateNav?.(navKey)
  }

  const queueCount = currentQueue.length > 0 ? String(currentQueue.length) : PSD_PLAYER3_STATS.songs

  return (
    <div
      className="player3-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Player 3 VIP theater"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
    >
      <div
        className="player3-bg"
        style={{
          backgroundImage: `url(${psdPlayer3ReferenceUrl})`,
          backgroundPosition: PSD_PLAYER3_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="player3-bg-shimmer" aria-hidden="true" />
      <div className="player3-veil" aria-hidden="true" />
      <div className="player3-particles" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className={`player3-particle player3-particle--${index + 1}`} />
        ))}
      </div>

      <button type="button" className="player3-collapse" onClick={onClose} aria-label="Exit Player 3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div className="player3-layout">
        <aside className="player3-sidebar" aria-label="Navigation">
          <div className="player3-brand">
            <span className="player3-brand-crown" aria-hidden="true">♛</span>
            <BrandWaveformMark />
            <span className="player3-brand-name">Hidden Tunes</span>
            <span className="player3-brand-vip">VIP</span>
          </div>
          <nav className="player3-nav">
            {PSD_PLAYER3_SIDEBAR_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`player3-nav-item${item.key === 'home' ? ' is-active' : ''}`}
                onClick={() => handleNav(item.key as NavKey)}
              >
                <span className="player3-nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="player3-profile">
            <span className="player3-profile-avatar" aria-hidden="true">
              <span className="player3-profile-crown">♛</span>
            </span>
            <strong>{displayArtist}</strong>
            <span className="player3-profile-badge">PREMIUM</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </aside>

        <main className="player3-main">
          <header className="player3-header">
            <div className="player3-header-source">
              <span>PLAYING FROM</span>
              <button type="button" className="player3-source-btn">
                {PSD_PLAYER3_SOURCE}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div className="player3-header-badges">
              <span className="player3-flac">FLAC</span>
              <span className="player3-spec">24-BIT / 48KHZ</span>
              <button type="button" className="player3-header-eq" aria-label="Equalizer" onClick={onOpenWaveform}>
                <PsdIconEqualizer />
              </button>
            </div>
          </header>

          <div className="player3-stage">
            <div className="player3-disc-col">
              <div className="player3-disc-orbit" aria-hidden="true" />
              <div className="player3-disc-ring" aria-hidden="true" />
              <div className="player3-disc">
                {displayTrack?.artwork ? (
                  <ArtworkImage src={displayTrack.artwork} alt="" seed={displayTrack.id} priority />
                ) : (
                  <span
                    className="player3-disc-fallback"
                    style={{
                      backgroundImage: `url(${psdPlayer3ReferenceUrl})`,
                      backgroundPosition: PSD_PLAYER3_ART_POSITION,
                    }}
                    aria-hidden="true"
                  />
                )}
                <span className="player3-disc-vip">VIP</span>
                <span className="player3-disc-time">{PSD_PLAYER3_DISC_TIME}</span>
              </div>
            </div>

            <div className="player3-panel">
              <div className="player3-tabs" role="tablist" aria-label="Player panels">
                {PSD_PLAYER3_TABS.map((tab) => {
                  const tabKey = tab.toLowerCase() as 'lyrics' | 'visualizer' | 'details'
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      className={`player3-tab${playerTab === tabKey ? ' is-active' : ''}`}
                      aria-selected={playerTab === tabKey}
                      onClick={() => setPlayerTab(tabKey)}
                    >
                      {tab}
                    </button>
                  )
                })}
              </div>

              {playerTab === 'lyrics' ? (
                <div className="player3-lyrics" role="tabpanel" aria-label="Lyrics">
                  <span className="player3-lyrics-quote" aria-hidden="true">“</span>
                  <div className="player3-lyrics-body">
                    {PSD_PLAYER3_LYRICS.map((line, index) => (
                      <p key={line} className={index < 3 ? 'is-active' : ''}>{line}</p>
                    ))}
                  </div>
                  <button type="button" className="player3-lyrics-more" onClick={onOpenLyrics}>
                    SHOW FULL LYRICS
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
              ) : null}

              {playerTab === 'visualizer' ? (
                <div className="player3-visualizer-panel" role="tabpanel" aria-label="Visualizer">
                  <PremiumReactiveWaveform
                    trackId={activeTrackId}
                    progressPercent={progressPercent}
                    progressMax={liveProgressMax}
                    isLoading={isLoading && isActive}
                    onSeek={seekTo}
                    className="player3-panel-waveform premium-reactive-waveform"
                    barCount={48}
                  />
                </div>
              ) : null}

              {playerTab === 'details' ? (
                <div className="player3-details-panel" role="tabpanel" aria-label="Details">
                  <p>{displayArtist}</p>
                  <p>{PSD_PLAYER3_SOURCE} • {PSD_PLAYER3_STATS.duration}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="player3-track-meta">
            <div className="player3-title-block">
              <span className="player3-title-script">{PSD_PLAYER3_TITLE_SCRIPT}</span>
              <h1 className="player3-title-main">{PSD_PLAYER3_TITLE_MAIN}</h1>
            </div>
            <p className="player3-artist">
              <span>{displayArtist}</span>
              <PsdIconVerified className="player3-verified" />
            </p>
            <div className="player3-track-actions">
              <button type="button" className="player3-action" aria-label="Favorite">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
                </svg>
              </button>
              <span className="player3-vip-master">VIP MASTER</span>
              <button type="button" className="player3-action" aria-label="More options">
                <PsdIconMore />
              </button>
            </div>
          </div>

          <div className="player3-waveform-block">
            <div className="player3-waveform-row">
              <span className="player3-time">{formatPlaybackTime(progressValue)}</span>
              <PremiumReactiveWaveform
                trackId={activeTrackId}
                progressPercent={progressPercent}
                progressMax={liveProgressMax}
                isLoading={isLoading && isActive}
                onSeek={seekTo}
                className="player3-waveform premium-reactive-waveform"
                barCount={88}
              />
              <span className="player3-time">{formatPlaybackTime(progressMax)}</span>
            </div>
            <div
              className="player3-progress-line"
              style={{ ['--player3-progress' as string]: `${progressPercent}%` }}
              aria-hidden="true"
            >
              <span className="player3-progress-fill" />
            </div>
          </div>

          <div className="player3-transport-wrap">
            <FullPlayerTransportControls activeTrackId={activeTrackId} />
          </div>

          <footer className="player3-footer">
            <div className="player3-footer-volume">
              <span className="player3-footer-label">VOLUME</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
              </svg>
              <div
                ref={volumeTrackRef}
                className="player3-volume-track"
                style={{ ['--player3-volume' as string]: `${volumePercent}%` }}
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
                <div className="player3-volume-fill" style={{ width: `${volumePercent}%` }} />
              </div>
            </div>

            <div className="player3-footer-tools">
              <button type="button" className="player3-footer-tool" onClick={onOpenWaveform}>
                <PsdIconEqualizer />
                <span>EQUALIZER</span>
              </button>
              <button type="button" className="player3-footer-tool">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                <span>ATMOS</span>
              </button>
              <button type="button" className="player3-footer-tool">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M4 14h16M7 10h10M10 6h4" />
                </svg>
                <span>LOUDNESS</span>
              </button>
            </div>

            <div className="player3-footer-utils">
              <button type="button" className="player3-footer-util" aria-label="Queue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
              <button type="button" className="player3-footer-util" aria-label="Brightness">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" />
                </svg>
              </button>
              <button type="button" className="player3-footer-util" aria-label="Fullscreen" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </div>
          </footer>
        </main>

        <aside className="player3-rail" aria-label="Up next">
          <div className="player3-upnext-header">
            <PsdWaveformStrip className="player3-upnext-wave" />
            <h2>UP NEXT</h2>
          </div>
          <ol className="player3-upnext-list">
            {upNextRows.map((row) => (
              <li key={row.key} className={`player3-upnext-item${row.active ? ' is-active' : ''}`}>
                <span
                  className="player3-upnext-thumb"
                  style={
                    'artwork' in row && row.artwork
                      ? { backgroundImage: `url(${row.artwork})` }
                      : {
                          backgroundImage: `url(${psdPlayer3ReferenceUrl})`,
                          backgroundPosition: row.artPosition,
                        }
                  }
                  aria-hidden="true"
                />
                <div className="player3-upnext-copy">
                  <strong>{row.title}</strong>
                  <span>{row.artist}</span>
                </div>
                {row.active ? (
                  <PsdIconEqualizer className="player3-upnext-eq" />
                ) : (
                  <button type="button" className="player3-upnext-menu" aria-label={`More options for ${row.title}`}>
                    <PsdIconMore />
                  </button>
                )}
              </li>
            ))}
          </ol>

          <section className="player3-stats" aria-label="Playlist stats">
            <h3>PLAYLIST STATS</h3>
            <div className="player3-stats-graph" aria-hidden="true">
              <svg viewBox="0 0 120 32" preserveAspectRatio="none">
                <path d="M0 24 L12 18 L24 22 L36 12 L48 16 L60 8 L72 14 L84 10 L96 16 L108 6 L120 12" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="player3-stats-grid">
              <div>
                <strong>{queueCount}</strong>
                <span>SONGS</span>
              </div>
              <div>
                <strong>{PSD_PLAYER3_STATS.duration}</strong>
                <span>DURATION</span>
              </div>
              <div>
                <strong>{PSD_PLAYER3_STATS.plays}</strong>
                <span>PLAYS</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
})

const Player4Shell = memo(function Player4Shell({
  onClose,
  onNavigateNav,
  onOpenLyrics,
  onOpenWaveform,
  preferredTrack = null,
}: {
  onClose: () => void
  onNavigateNav?: (navKey: NavKey) => void
  onOpenLyrics?: () => void
  onOpenWaveform?: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    volume,
    setVolume,
    pause,
    resume,
    getUpcomingTracks,
  } = useDesktopPlayback()

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER4_DURATION_SECONDS
  const progressValue = liveProgressMax > 0 ? liveProgressValue : PSD_PLAYER4_POSITION_SECONDS
  const progressPercent = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))

  const displayTitle = displayTrack?.title ?? PSD_PLAYER4_TITLE
  const displayArtist = displayTrack?.artist ?? PSD_PLAYER4_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_PLAYER4_SOURCE
  const activeTrackId = displayTrack?.id ?? null
  const showPlaying = isActive && isPlaying
  const showLoading = isActive && isLoading
  const upcomingTracks = getUpcomingTracks()

  const upNextRows = useMemo(() => {
    if (upcomingTracks.length === 0) return PSD_PLAYER4_UP_NEXT
    return upcomingTracks.slice(0, 5).map((track, index) => ({
      key: track.id,
      title: track.title,
      artist: track.artist,
      duration: track.durationSeconds != null && track.durationSeconds > 0
        ? formatPlaybackTime(track.durationSeconds)
        : PSD_PLAYER4_UP_NEXT[index]?.duration ?? '3:56',
      active: index === 0,
      artPosition: PSD_PLAYER4_UP_NEXT[index]?.artPosition ?? '18% 58%',
      artwork: track.artwork,
    }))
  }, [upcomingTracks])

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

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

  const handlePlayPause = () => {
    if (!isActive || isLoading) return
    if (isPlaying) {
      pause()
      return
    }
    resume()
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleNav = (navKey: NavKey) => {
    onClose()
    onNavigateNav?.(navKey)
  }

  const playLabel = showLoading
    ? 'Loading track'
    : showPlaying
      ? 'Pause'
      : isActive
        ? 'Play'
        : 'Play (select a track)'

  return (
    <div
      className="player4-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Player 4 VIP theater"
      data-player-mode={DESKTOP_PLAYER_MODE_PLAYER4}
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
    >
      <div
        className="player4-bg"
        style={{
          backgroundImage: `url(${psdPlayer4ReferenceUrl})`,
          backgroundPosition: PSD_PLAYER4_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="player4-bg-breathe" aria-hidden="true" />
      <div className="player4-veil" aria-hidden="true" />

      <button type="button" className="player4-collapse" onClick={onClose} aria-label="Exit Player 4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div className="player4-layout">
        <aside className="player4-sidebar" aria-label="Navigation">
          <div className="player4-brand">
            <span className="player4-brand-crown" aria-hidden="true">♛</span>
            <span className="player4-brand-name">Hidden Tunes</span>
            <span className="player4-brand-vip">VIP Experience</span>
          </div>

          <nav className="player4-nav" aria-label="Main navigation">
            <span className="player4-nav-heading">Main</span>
            {PSD_PLAYER4_MAIN_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`player4-nav-item${'active' in item && item.active ? ' is-active' : ''}`}
                onClick={() => handleNav(item.key as NavKey)}
              >
                <span className="player4-nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
            <span className="player4-nav-heading player4-nav-heading--extras">Extras</span>
            {PSD_PLAYER4_EXTRAS_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className="player4-nav-item"
                onClick={() => handleNav(item.key as NavKey)}
              >
                <span className="player4-nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="player4-profile">
            <span className="player4-profile-avatar" aria-hidden="true" />
            <div className="player4-profile-copy">
              <strong>{displayArtist}</strong>
              <span className="player4-profile-badge">Premium Member VIP</span>
            </div>
            <button type="button" className="player4-go-premium">Go Premium</button>
          </div>
        </aside>

        <div className="player4-center">
          <main className="player4-main">
            <header className="player4-header">
              <div className="player4-header-source">
                <span>PLAYING FROM</span>
                <button type="button" className="player4-source-btn">
                  {PSD_PLAYER4_SOURCE}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <div className="player4-header-badges">
                <span>FLAC</span>
                <span className="player4-header-divider" aria-hidden="true">|</span>
                <span>24-BIT</span>
                <span className="player4-header-divider" aria-hidden="true">|</span>
                <span>96kHz</span>
              </div>
            </header>

            <div className="player4-hero">
              <div className="player4-art-col">
                <div className="player4-art-glow" aria-hidden="true" />
                <div className="player4-art-frame">
                  {displayTrack?.artwork ? (
                    <ArtworkImage src={displayTrack.artwork} alt="" seed={displayTrack.id} priority />
                  ) : (
                    <span
                      className="player4-art-fallback"
                      style={{
                        backgroundImage: `url(${psdPlayer4ReferenceUrl})`,
                        backgroundPosition: PSD_PLAYER4_ART_POSITION,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <button type="button" className="player4-art-heart" aria-label="Favorite">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 1.01 4.5 2.09C13.09 4.01 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>
                  <span className="player4-art-mastered">
                    <PsdWaveformStrip className="player4-mastered-wave" />
                    MASTERED
                  </span>
                </div>
              </div>

              <div className="player4-track-col">
                <p className="player4-eyebrow">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21l2.3-7-6-4.6h7.6L12 2z" />
                  </svg>
                  NOW PLAYING
                </p>
                <h1 className="player4-title">{displayTitle}</h1>
                <p className="player4-artist">
                  <span>{displayArtist}</span>
                  <PsdIconVerified className="player4-verified" />
                </p>
                <p className="player4-meta">{displayAlbum} • {PSD_PLAYER4_YEAR}</p>
                <div className="player4-track-actions">
                  <button
                    type="button"
                    className="player4-play-btn"
                    onClick={handlePlayPause}
                    disabled={!isActive || isLoading}
                    aria-label={playLabel}
                    aria-busy={showLoading}
                  >
                    {showLoading ? (
                      <span className="player-spinner player-spinner--transport" />
                    ) : showPlaying ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    )}
                    <span>{showPlaying ? 'Pause' : 'Play'}</span>
                  </button>
                  <button type="button" className="player4-shuffle-btn" aria-label="Shuffle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                    <span>Shuffle</span>
                  </button>
                  <button type="button" className="player4-more-btn" aria-label="More options">
                    <PsdIconMore />
                  </button>
                </div>
              </div>
            </div>

            <div className="player4-waveform-block">
              <PremiumReactiveWaveform
                trackId={activeTrackId}
                progressPercent={progressPercent}
                progressMax={liveProgressMax}
                isLoading={isLoading && isActive}
                onSeek={seekTo}
                className="player4-waveform premium-reactive-waveform"
                barCount={96}
              />
              <div className="player4-progress-row">
                <span className="player4-time">{formatPlaybackTime(progressValue)}</span>
                <div
                  className="player4-progress-line"
                  style={{ ['--player4-progress' as string]: `${progressPercent}%` }}
                  aria-hidden="true"
                >
                  <span className="player4-progress-fill" />
                </div>
                <span className="player4-time">{formatPlaybackTime(progressMax)}</span>
              </div>
            </div>

            <section className="player4-lyrics-card" aria-label="Lyrics preview">
              <div className="player4-lyrics-leaks" aria-hidden="true" />
              <button type="button" className="player4-lyrics-tab is-active" aria-label="Lyrics">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                <span>LYRICS</span>
              </button>
              <button type="button" className="player4-lyrics-tab" aria-label="Visualizer" onClick={onOpenWaveform}>
                <PsdIconEqualizer />
                <span>VISUALIZER</span>
              </button>
              <div className="player4-lyrics-body">
                {PSD_PLAYER4_LYRICS.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <button type="button" className="player4-lyrics-more" onClick={onOpenLyrics}>
                SHOW FULL LYRICS
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </section>
          </main>

          <footer className="player4-dock">
            <div className="player4-dock-volume">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
              </svg>
              <div
                ref={volumeTrackRef}
                className="player4-volume-track"
                style={{ ['--player4-volume' as string]: `${volumePercent}%` }}
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
                <div className="player4-volume-fill" style={{ width: `${volumePercent}%` }} />
              </div>
            </div>

            <div className="player4-dock-transport">
              <FullPlayerTransportControls activeTrackId={activeTrackId} />
            </div>

            <div className="player4-dock-utils">
              <button type="button" className="player4-dock-util" aria-label="Equalizer" onClick={onOpenWaveform}>
                <PsdIconEqualizer />
              </button>
              <button type="button" className="player4-dock-util" aria-label="Queue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
              <button type="button" className="player4-dock-util" aria-label="Theater mode" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                </svg>
              </button>
              <button type="button" className="player4-dock-util" aria-label="Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
            </div>
          </footer>
        </div>

        <aside className="player4-rail" aria-label="Up next and sound">
          <div className="player4-upnext-header">
            <PsdWaveformStrip className="player4-upnext-wave" />
            <h2>UP NEXT</h2>
          </div>
          <ol className="player4-upnext-list">
            {upNextRows.map((row) => (
              <li key={row.key} className={`player4-upnext-item${row.active ? ' is-active' : ''}`}>
                <span
                  className="player4-upnext-thumb"
                  style={
                    'artwork' in row && row.artwork
                      ? { backgroundImage: `url(${row.artwork})` }
                      : {
                          backgroundImage: `url(${psdPlayer4ReferenceUrl})`,
                          backgroundPosition: row.artPosition,
                        }
                  }
                  aria-hidden="true"
                />
                <div className="player4-upnext-copy">
                  <strong>{row.title}</strong>
                  <span>{row.artist}</span>
                </div>
                {'duration' in row ? (
                  row.active ? (
                    <PsdIconEqualizer className="player4-upnext-eq" />
                  ) : (
                    <span className="player4-upnext-duration">{row.duration}</span>
                  )
                ) : null}
              </li>
            ))}
          </ol>

          <section className="player4-sound" aria-label="Sound experience">
            <div className="player4-sound-header">
              <PsdWaveformStrip className="player4-sound-wave" />
              <h3>SOUND EXPERIENCE</h3>
            </div>
            <div className="player4-sound-toggles">
              {PSD_PLAYER4_SOUND_MODES.map((mode) => (
                <button key={mode.key} type="button" className="player4-sound-toggle is-on">
                  <span className="player4-sound-toggle-icon" aria-hidden="true" />
                  <span>{mode.label}</span>
                  <span className="player4-sound-toggle-state">ON</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
})

const CinematicWaveformShell = memo(function CinematicWaveformShell({
  onClose,
  preferredTrack = null,
}: {
  onClose: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
    audioQualityMode,
    setAudioQualityMode,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const [showQualityPanel, setShowQualityPanel] = useState(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0
    ? liveProgressValue
    : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0

  const displayTitle = displayTrack?.title ?? PSD_PLAYER_TITLE
  const displayArtist = displayTrack?.artist ?? PSD_PLAYER_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_WAVEFORM_ALBUM
  const activeTrackId = displayTrack?.id ?? null

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="cinema-player cinema-player--waveform cinema-player--live-waveform"
      role="dialog"
      aria-modal="true"
      aria-label="Live waveform player"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      <div
        className="psd-waveform-bg"
        style={{
          backgroundImage: `url(${psdWaveformReferenceUrl})`,
          backgroundPosition: PSD_WAVEFORM_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="psd-waveform-veil" aria-hidden="true" />

      <header className="psd-waveform-topbar">
        <button
          type="button"
          className="psd-waveform-topbar-btn"
          onClick={onClose}
          aria-label="Exit cinematic waveform"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="psd-waveform-topbar-copy">
          <span>PLAYING FROM ALBUM</span>
          <strong>{displayAlbum}</strong>
          <span className="psd-waveform-topbar-rule" aria-hidden="true" />
        </div>
        <button type="button" className="psd-waveform-topbar-btn" aria-label="More options">
          <PsdIconMore />
        </button>
      </header>

      <div className="psd-waveform-hero">
        <div className="psd-waveform-track-copy">
          <h1>{displayTitle}</h1>
          <p>
            <span>{displayArtist}</span>
            <PsdIconVerified className="psd-waveform-verified" />
          </p>
        </div>

        <div className="psd-waveform-art-shell" aria-hidden="true">
          <span className="psd-waveform-vinyl premium-vinyl-disc" />
        </div>

        <PremiumCinematicWaveform
          className="psd-waveform-visualizer"
          trackId={activeTrackId}
          progressPercent={progressPercent}
        />

        <div className="psd-waveform-lyrics" aria-live="polite">
          {PSD_WAVEFORM_LYRICS.map((line) => (
            <p key={line}><em>{line}</em></p>
          ))}
        </div>

        <div className="psd-waveform-dots" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className={index === 1 ? 'is-active' : ''} />
          ))}
        </div>
      </div>

      <div className="psd-waveform-controls">
        <div
          className="psd-waveform-progress-wrap"
          style={{ ['--psd-waveform-progress' as string]: `${progressPercent}%` }}
          role="group"
          aria-label="Playback progress"
        >
          <div
            ref={progressTrackRef}
            className={
              'psd-waveform-progress-track'
              + (liveProgressMax > 0 && isActive ? ' is-interactive' : '')
            }
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progressMax)}
            aria-valuenow={Math.round(progressValue)}
            aria-disabled={!isActive || liveProgressMax <= 0 || isLoading}
            onClick={handleSeekClick}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div className="psd-waveform-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="psd-waveform-progress-times">
            <span className="psd-waveform-time">{formatPlaybackTime(progressValue)}</span>
            <span className="psd-waveform-time">{formatPlaybackTime(progressMax)}</span>
          </div>
        </div>

        <FullPlayerTransportControls activeTrackId={activeTrackId} />

        {showQualityPanel ? (
          <div className="psd-waveform-quality-options">
            <AudioQualitySelector
              value={audioQualityMode}
              onChange={setAudioQualityMode}
            />
          </div>
        ) : null}

        <footer className="psd-waveform-footer">
          <button type="button" className="psd-waveform-footer-btn" aria-label="Cast">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path d="M12 18h.01" />
            </svg>
          </button>
          <button type="button" className="psd-waveform-footer-quality" onClick={() => setShowQualityPanel((open) => !open)}>
            <PsdWaveformStrip className="psd-waveform-footer-wave" />
            <strong>HIGH QUALITY</strong>
          </button>
          <button
            type="button"
            className="psd-waveform-footer-btn"
            aria-label="Equalizer"
            aria-pressed={showQualityPanel}
            onClick={() => setShowQualityPanel((open) => !open)}
          >
            <PsdIconEqualizer className="psd-waveform-footer-equalizer" />
          </button>
        </footer>
      </div>
    </div>
  )
})

const FullscreenLyricsShell = memo(function FullscreenLyricsShell({
  onClose,
  preferredTrack = null,
}: {
  onClose: () => void
  preferredTrack?: ApiSong | null
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    seekTo,
  } = useDesktopPlayback()

  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)

  const displayTrack = currentTrack ?? preferredTrack
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax > 0 ? liveProgressMax : PSD_PLAYER_DURATION_SECONDS
  const progressValue = liveProgressMax > 0
    ? liveProgressValue
    : PSD_PLAYER_POSITION_SECONDS
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0

  const displayTitle = displayTrack?.title ?? PSD_PLAYER_TITLE
  const displayArtist = displayTrack?.artist ?? PSD_PLAYER_ARTIST
  const displayAlbum = displayTrack?.album ?? PSD_LYRICS_ALBUM
  const activeTrackId = displayTrack?.id ?? null

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isActive || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="cinema-player cinema-player--lyrics psd-lyrics-page"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen lyrics"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      <div
        className="psd-lyrics-bg"
        style={{
          backgroundImage: `url(${psdLyricsReferenceUrl})`,
          backgroundPosition: PSD_LYRICS_BG_POSITION,
        }}
        aria-hidden="true"
      />
      <div className="psd-lyrics-veil" aria-hidden="true" />

      <header className="psd-lyrics-topbar">
        <button
          type="button"
          className="psd-lyrics-topbar-btn psd-lyrics-topbar-btn--close"
          onClick={onClose}
          aria-label="Exit fullscreen lyrics"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="psd-lyrics-topbar-copy">
          <span>PLAYING FROM ALBUM</span>
          <strong>{displayAlbum}</strong>
        </div>
        <button type="button" className="psd-lyrics-topbar-btn psd-lyrics-topbar-btn--flag" aria-label="Bookmark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <path d="M4 22V15" />
          </svg>
        </button>
      </header>

      <div className="psd-lyrics-main">
        <div className="psd-lyrics-track-block">
          <div className="psd-lyrics-art">
            {displayTrack?.artwork ? (
              <ArtworkImage
                src={displayTrack.artwork}
                alt=""
                seed={displayTrack.id}
                priority
              />
            ) : (
              <span
                className="psd-lyrics-art-fallback"
                style={{
                  backgroundImage: `url(${psdLikedReferenceUrl})`,
                  backgroundPosition: PSD_LYRICS_ART_POSITION,
                }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="psd-lyrics-track-copy">
            <h1>{displayTitle}</h1>
            <p>
              <span>{displayArtist}</span>
              <PsdIconVerified className="psd-lyrics-verified" />
            </p>
          </div>
        </div>

        <div className="psd-lyrics-stack" aria-live="polite">
          {PSD_LYRICS_LINES.map((line, index) => (
            <p
              key={`${line.tier}-${index}`}
              className={`psd-lyrics-line psd-lyrics-line--${line.tier}`}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>

      <div className="psd-lyrics-bottom">
        <div className="psd-lyrics-mid-controls">
          <button type="button" className="psd-lyrics-share-btn" aria-label="Share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <path d="M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </button>
          <button type="button" className="psd-lyrics-more-btn" aria-label="More options">
            <PsdIconMore />
          </button>
        </div>

        <div
          className="psd-lyrics-progress-wrap"
          style={{ ['--psd-lyrics-progress' as string]: `${progressPercent}%` }}
          role="group"
          aria-label="Playback progress"
        >
          <div
            ref={progressTrackRef}
            className={
              'psd-lyrics-progress-track'
              + (liveProgressMax > 0 && isActive ? ' is-interactive' : '')
            }
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progressMax)}
            aria-valuenow={Math.round(progressValue)}
            aria-disabled={!isActive || liveProgressMax <= 0 || isLoading}
            onClick={handleSeekClick}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div className="psd-lyrics-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="psd-lyrics-progress-times">
            <span className="psd-lyrics-time">{formatPlaybackTime(progressValue)}</span>
            <span className="psd-lyrics-time">{formatPlaybackTime(progressMax)}</span>
          </div>
        </div>

        <FullPlayerTransportControls activeTrackId={activeTrackId} />

        <div className="psd-lyrics-quality-label">
          <PsdWaveformStrip className="psd-lyrics-quality-wave" />
          <strong>HIGH QUALITY</strong>
        </div>
      </div>
    </div>
  )
})

function SongDetailView({
  song,
  onBack,
  onOpenCinema,
}: {
  song: ApiSong
  onBack: () => void
  onOpenCinema?: () => void
}) {
  const { songs } = useCatalog()
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueContext,
    queueTitle,
    isPlaying,
    isLoading,
  } = useDesktopPlayback()

  const created = formatDateLabel(song.createdAt)
  const isActive = currentTrack?.id === song.id
  const artBackdropStyle = song.artwork
    ? { backgroundImage: `url(${song.artwork})` }
    : undefined

  const stageAtmosphere = useMemo(
    () => deriveListeningAtmosphere(song, songs),
    [song, songs],
  )

  const stageQueueSnapshot = useMemo(
    () =>
      isActive
        ? analyzeQueueSnapshot({
            queue: currentQueue,
            currentIndex,
            currentTrack,
          })
        : null,
    [currentIndex, currentQueue, currentTrack, isActive],
  )

  const stageQueueInsight = useMemo(
    () => (stageQueueSnapshot ? describeQueueInsight(stageQueueSnapshot) : null),
    [stageQueueSnapshot],
  )

  const stageListeningContext = useMemo(
    () =>
      buildListeningContext({
        track: song,
        catalog: songs,
        queueContext,
        queueTitle,
        queueInsight: stageQueueInsight,
        isPlaying,
        isLoading,
        isActive,
      }),
    [
      isActive,
      isLoading,
      isPlaying,
      queueContext,
      queueTitle,
      song,
      songs,
      stageQueueInsight,
    ],
  )

  return (
    <PageFrame>
      <DetailTopBar title="Song" onBack={onBack} />
      <div
        className="listening-stage"
        data-playing={isActive && isPlaying ? 'true' : 'false'}
        data-loading={isActive && isLoading ? 'true' : 'false'}
        data-scene={stageAtmosphere.sceneId}
        data-mood={stageAtmosphere.mood}
      >
        <VisualSceneBackdrop
          sceneId={stageAtmosphere.sceneId}
          seed={song.id}
          variant="ambient"
        />
        <div
          className="listening-stage-art-backdrop"
          style={artBackdropStyle}
          aria-hidden="true"
        />
        <div className="listening-stage-veil" aria-hidden="true" />
        {onOpenCinema ? (
          <button
            type="button"
            className="cinema-entry-btn"
            onClick={onOpenCinema}
            aria-label="Open fullscreen player"
            title="Fullscreen"
          >
            <span className="cinema-entry-btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
              </svg>
            </span>
            <span className="cinema-entry-btn-label">Fullscreen</span>
          </button>
        ) : null}
        <section
          className="detail-hero detail-hero--song"
          data-playing={isActive && isPlaying ? 'true' : 'false'}
          data-loading={isActive && isLoading ? 'true' : 'false'}
        >
          <div className="detail-artwork-stage">
            <span className="detail-artwork-aura" aria-hidden="true" />
            <div className="detail-artwork">
              <ArtworkImage src={song.artwork} alt="" seed={song.id} priority />
            </div>
          </div>
          <div className="detail-hero-copy">
            <p className="detail-eyebrow">{stageListeningContext.eyebrow}</p>
            <h1 className="detail-h1">{song.title}</h1>
            <p className="detail-byline">
              <span className="detail-pill">{song.artist}</span>
              <span className="detail-pill detail-pill--muted">{song.album}</span>
            </p>
            <ListeningContextStrip lines={stageListeningContext} />
            {created ? (
              <p className="detail-stats">Added {created}</p>
            ) : null}
            <PlaybackTransportControls
              activeTrackId={song.id}
              className="detail-controls"
            />
          </div>
        </section>
      </div>
    </PageFrame>
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

  const artwork = useMemo(
    () => resolveAlbumArtwork(album, albumSongs),
    [album, albumSongs],
  )
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
  const { songs, indexes } = useCatalog()

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
        <VisualSceneBackdrop sceneId={sceneId} seed={mood.title} variant="hero" />
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
  recentQuery = '',
  downloadsQuery = '',
  playlistsQuery = '',
  setPlaylistsQuery,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenCinema?: () => void
  discoverQuery: string
  setDiscoverQuery: (value: string) => void
  albumsQuery: string
  setAlbumsQuery: (value: string) => void
  onPlaylistBack: () => void
  onNavigateNav: (navKey: NavKey) => void
  recentQuery?: string
  downloadsQuery?: string
  playlistsQuery?: string
  setPlaylistsQuery?: (value: string) => void
}) {
  if (activeView === 'song' && selectedSong) {
    return (
      <SongDetailView
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
      recentQuery={recentQuery}
      downloadsQuery={downloadsQuery}
      playlistsQuery={playlistsQuery}
      setPlaylistsQuery={setPlaylistsQuery}
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
  onNavigateNav: _onNavigateNav,
  recentQuery = '',
  downloadsQuery = '',
  playlistsQuery = '',
  setPlaylistsQuery,
}: {
  page: PageId
  activeNavKey: NavKey
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  discoverQuery: string
  setDiscoverQuery: (value: string) => void
  albumsQuery: string
  setAlbumsQuery: (value: string) => void
  onPlaylistBack: () => void
  onNavigateNav: (navKey: NavKey) => void
  recentQuery?: string
  downloadsQuery?: string
  playlistsQuery?: string
  setPlaylistsQuery?: (value: string) => void
}) {
  void _onOpenMood
  void _onNavigateNav
  void onPlaylistBack
  if (activeNavKey === 'liked') return <LikedPage onOpenSong={onOpenSong} />
  if (activeNavKey === 'recent') return <RecentPage onOpenSong={onOpenSong} query={recentQuery} />
  if (activeNavKey === 'downloads') {
    return <DownloadsPage onOpenSong={onOpenSong} query={downloadsQuery} />
  }
  if (activeNavKey === 'premium') return <PremiumPage />

  switch (page) {
    case 'home':
      return <HomePage onOpenSong={onOpenSong} />
    case 'discover':
      return (
        <DiscoverPage
          onOpenSong={onOpenSong}
          query={discoverQuery}
          setQuery={setDiscoverQuery}
        />
      )
    case 'mood':
      return <EmotionalWorldsPage onOpenSong={onOpenSong} />
    case 'library':
      return <LibraryPage onOpenSong={onOpenSong} />
    case 'artists':
      return <ArtistsPage onOpenArtist={onOpenArtist} />
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
      return <TvPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <HomePage onOpenSong={onOpenSong} />
  }
}

function App() {
  return (
    <PreferencesResetProvider>
      <DesktopPlaybackProvider>
        <PremiumAudioVisualizerProvider>
          <CatalogProvider>
            <AppShell />
          </CatalogProvider>
        </PremiumAudioVisualizerProvider>
      </DesktopPlaybackProvider>
    </PreferencesResetProvider>
  )
}

function AppShell() {
  const { currentTrack, playQueue } = useDesktopPlayback()
  const { songs } = useCatalog()
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
  const [desktopSelectedTrack, setDesktopSelectedTrack] = useState<ApiSong | null>(null)
  const [cinemaOpen, setCinemaOpen] = useState(false)
  const [player2Open, setPlayer2Open] = useState(false)
  const [player3Open, setPlayer3Open] = useState(false)
  const [player4Open, setPlayer4Open] = useState(false)
  const [waveformOpen, setWaveformOpen] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [likedQuery, setLikedQuery] = useState('')
  const [recentQuery, setRecentQuery] = useState('')
  const [downloadsQuery, setDownloadsQuery] = useState('')
  const [playlistsQuery, setPlaylistsQuery] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [discoverQuery, setDiscoverQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.discoverSearch,
    PSD_SEARCH_QUERY,
    parseStoredSearchTerm,
  )
  const [albumsQuery, setAlbumsQuery] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.albumsSearch,
    '',
    parseStoredSearchTerm,
  )

  const openSong = useCallback((song: ApiSong) => {
    setDesktopSelectedTrack(song)
    setSelectedSong(song)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
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
      const resolved = songs.find((entry) => entry.id === song.id) ?? song
      const playableQueue = queue.length > 0
        ? queue.map((entry) => songs.find((songEntry) => songEntry.id === entry.id) ?? entry)
        : [resolved]
      const selectedIndex = playableQueue.findIndex((entry) => entry.id === resolved.id)
      const safeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, Math.min(startIndex, playableQueue.length - 1))

      openSong(resolved)
      playQueue(playableQueue, safeIndex, context, queueTitle, seedMetadata)
    },
    [openSong, playQueue, songs],
  )

  const openAlbum = useCallback((album: ApiAlbum) => {
    setSelectedAlbum(album)
    setSelectedSong(null)
    setSelectedArtist(null)
    setSelectedMood(null)
    setActiveView('album')
  }, [])

  const openArtist = useCallback((artist: ApiArtist) => {
    setSelectedArtist(artist)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedMood(null)
    setActiveView('artist')
  }, [])

  const openMood = useCallback((mood: MoodRoom) => {
    setSelectedMood(mood)
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setActiveView('mood')
  }, [])

  const backToPage = useCallback(() => {
    setActiveView('page')
    setSelectedSong(null)
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setSelectedMood(null)
  }, [])

  const navigateNav = useCallback((navKey: NavKey) => {
    const page = resolvePageFromNavKey(navKey)
    setActivePage(page)
    setActiveNavKey(navKey)
    backToPage()
  }, [backToPage, setActivePage])

  const navigatePage = useCallback((page: PageId, navKey?: NavKey) => {
    setActivePage(page)
    setActiveNavKey(navKey ?? resolveDefaultNavKey(page))
    backToPage()
  }, [backToPage, setActivePage])

  return (
    <>
      <div className="app-shell">
        <Sidebar activeNavKey={activeNavKey} onNavigateNav={navigateNav} />
        <div className="main-area">
          <div className="main-composition">
            <main
              className={`main-scroll${
                activeNavKey === 'home' && activeView === 'page' ? ' main-scroll--home' : ''
              }${
                activeNavKey === 'worlds' && activeView === 'page' ? ' main-scroll--mood' : ''
              }${
                isPsdDestinationNav(activeNavKey) && activeView === 'page' ? ' main-scroll--psd' : ''
              }`}
            >
              {isPsdDestinationNav(activeNavKey) && activeView === 'page' ? (
                <HomeTopBar
                  placeholder={TOP_BAR_PLACEHOLDERS[activeNavKey]}
                  onOpenDiscover={() => navigatePage('discover', 'search')}
                  variant={
                    activeNavKey === 'search'
                      || activeNavKey === 'albums'
                      || activeNavKey === 'liked'
                      || activeNavKey === 'library'
                      || activeNavKey === 'recent'
                      || activeNavKey === 'downloads'
                      || activeNavKey === 'playlists'
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
                  desktopSelectedTrack={desktopSelectedTrack}
                  onBack={backToPage}
                  activePage={activePage}
                  activeNavKey={activeNavKey}
                  onOpenSong={selectAndPlay}
                  onOpenAlbum={openAlbum}
                  onOpenArtist={openArtist}
                  onOpenMood={openMood}
                  onOpenCinema={() => setCinemaOpen(true)}
                  discoverQuery={discoverQuery}
                  setDiscoverQuery={setDiscoverQuery}
                  albumsQuery={albumsQuery}
                  setAlbumsQuery={setAlbumsQuery}
                  onPlaylistBack={() => navigateNav('library')}
                  onNavigateNav={navigateNav}
                  recentQuery={recentQuery}
                  downloadsQuery={downloadsQuery}
                  playlistsQuery={playlistsQuery}
                  setPlaylistsQuery={setPlaylistsQuery}
                />
              </div>
            </main>
            <QueueUpNextPanel
              onOpenPlayer2={() => setPlayer2Open(true)}
              onOpenPlayer3={() => setPlayer3Open(true)}
              activeNavKey={activeNavKey}
            />
          </div>
        </div>
      </div>
      {!waveformOpen && !lyricsOpen && !player2Open && !player3Open && !player4Open && activeNavKey !== 'recent' ? (
        <PlayerBar
          track={desktopSelectedTrack}
          onOpenCinema={() => setCinemaOpen(true)}
          onOpenPlayer2={() => setPlayer2Open(true)}
          onOpenPlayer3={() => setPlayer3Open(true)}
        />
      ) : null}
      {player4Open ? (
        <Player4Shell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setPlayer4Open(false)}
          onNavigateNav={navigateNav}
          onOpenLyrics={() => {
            setPlayer4Open(false)
            setLyricsOpen(true)
          }}
          onOpenWaveform={() => {
            setPlayer4Open(false)
            setWaveformOpen(true)
          }}
        />
      ) : null}
      {player3Open ? (
        <Player3Shell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setPlayer3Open(false)}
          onNavigateNav={navigateNav}
          onOpenLyrics={() => {
            setPlayer3Open(false)
            setLyricsOpen(true)
          }}
          onOpenWaveform={() => {
            setPlayer3Open(false)
            setWaveformOpen(true)
          }}
        />
      ) : null}
      {player2Open ? (
        <Player2Shell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setPlayer2Open(false)}
          onNavigateNav={navigateNav}
          onOpenLyrics={() => {
            setPlayer2Open(false)
            setLyricsOpen(true)
          }}
          onOpenWaveform={() => {
            setPlayer2Open(false)
            setWaveformOpen(true)
          }}
        />
      ) : null}
      {cinemaOpen ? (
        <CinemaPlayerShell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setCinemaOpen(false)}
          onOpenLyrics={() => {
            setCinemaOpen(false)
            setLyricsOpen(true)
          }}
          onOpenWaveform={() => {
            setCinemaOpen(false)
            setWaveformOpen(true)
          }}
        />
      ) : null}
      {waveformOpen ? (
        <CinematicWaveformShell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setWaveformOpen(false)}
        />
      ) : null}
      {lyricsOpen ? (
        <FullscreenLyricsShell
          preferredTrack={desktopSelectedTrack}
          onClose={() => setLyricsOpen(false)}
        />
      ) : null}
    </>
  )
}

export default App
