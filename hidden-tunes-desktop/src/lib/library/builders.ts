import type { ApiSong } from '../api'
import type { AudiobookBookMeta } from '../audiobooks/types'
import type { LectureSavedEntry } from '../lectures/lectureProgressStorage'
import type { MotivationalProgramMeta } from '../motivationals/types'
import type { PodcastEpisodeMeta, PodcastShowMeta } from '../podcasts/types'
import type { RadioStationMeta } from '../radio/types'
import type { TvChannelMeta } from '../tv/types'
import type {
  DesktopAudiobookLibraryItem,
  DesktopLectureLibraryItem,
  DesktopLibraryItem,
  DesktopMotivationalLibraryItem,
  DesktopPodcastEpisodeLibraryItem,
  DesktopPodcastShowLibraryItem,
  DesktopRadioLibraryItem,
  DesktopSongLibraryItem,
  DesktopTvLibraryItem,
} from './types'

function nowIso() {
  return new Date().toISOString()
}

export function buildSongLibraryItem(
  song: Pick<ApiSong, 'id' | 'title' | 'artist' | 'album' | 'artwork' | 'durationSeconds' | 'genre'>,
  addedAt = nowIso(),
): DesktopSongLibraryItem {
  return {
    type: 'song',
    id: song.id.trim(),
    title: song.title || 'Untitled song',
    artist: song.artist ?? null,
    album: song.album ?? null,
    artwork: song.artwork ?? null,
    subtitle: song.artist ?? null,
    duration: song.durationSeconds ?? null,
    category: song.genre ?? null,
    source: 'music',
    addedAt,
  }
}

export function buildSongLibraryItemFromId(
  songId: string,
  likedAt?: string,
): DesktopSongLibraryItem {
  return {
    type: 'song',
    id: songId.trim(),
    title: 'Liked song',
    artist: null,
    album: null,
    artwork: null,
    subtitle: null,
    source: 'music',
    addedAt: likedAt && Number.isFinite(Date.parse(likedAt)) ? likedAt : nowIso(),
  }
}

export function buildRadioLibraryItem(
  station: Pick<
    RadioStationMeta,
    | 'id'
    | 'name'
    | 'artworkUrl'
    | 'country'
    | 'countryCode'
    | 'categories'
    | 'isMature'
    | 'contentRating'
  >,
  addedAt = nowIso(),
): DesktopRadioLibraryItem {
  const country = station.country || station.countryCode || null
  return {
    type: 'radio',
    id: station.id.trim(),
    title: station.name || 'Radio station',
    artwork: station.artworkUrl ?? null,
    subtitle: country,
    country,
    category: station.categories[0] ?? null,
    playId: station.id.trim(),
    isMature: Boolean(station.isMature),
    contentRating: station.contentRating ?? null,
    source: 'radio',
    addedAt,
  }
}

export function buildPodcastShowLibraryItem(
  show: Pick<PodcastShowMeta, 'id' | 'title' | 'artworkUrl' | 'hostName' | 'primaryCategory'>,
  addedAt = nowIso(),
): DesktopPodcastShowLibraryItem {
  return {
    type: 'podcast_show',
    id: show.id.trim(),
    title: show.title || 'Podcast',
    showTitle: show.title || null,
    hostName: show.hostName ?? null,
    artwork: show.artworkUrl ?? null,
    subtitle: show.hostName ?? null,
    category: show.primaryCategory ?? null,
    source: 'podcast',
    addedAt,
  }
}

export function buildPodcastEpisodeLibraryItem(
  episode: Pick<
    PodcastEpisodeMeta,
    'id' | 'title' | 'showId' | 'showTitle' | 'artworkUrl' | 'durationSeconds'
  >,
  addedAt = nowIso(),
): DesktopPodcastEpisodeLibraryItem {
  return {
    type: 'podcast_episode',
    id: episode.id.trim(),
    title: episode.title || 'Episode',
    showId: episode.showId || null,
    showTitle: episode.showTitle ?? null,
    artwork: episode.artworkUrl ?? null,
    subtitle: episode.showTitle ?? null,
    duration: episode.durationSeconds ?? null,
    playId: episode.id.trim(),
    source: 'podcast',
    addedAt,
  }
}

export function buildAudiobookLibraryItem(
  book: Pick<AudiobookBookMeta, 'id' | 'title' | 'coverUrl' | 'authorName' | 'narratorName' | 'categorySlug'>,
  addedAt = nowIso(),
): DesktopAudiobookLibraryItem {
  return {
    type: 'audiobook',
    id: book.id.trim(),
    title: book.title || 'Audiobook',
    author: book.authorName ?? null,
    narrator: book.narratorName ?? null,
    artwork: book.coverUrl ?? null,
    subtitle: book.authorName ?? null,
    category: book.categorySlug ?? null,
    source: 'audiobook',
    addedAt,
  }
}

export function buildTvLibraryItem(
  channel: Pick<TvChannelMeta, 'id' | 'title' | 'channelName' | 'artworkUrl' | 'categories'>,
  addedAt = nowIso(),
): DesktopTvLibraryItem {
  return {
    type: 'tv',
    id: channel.id.trim(),
    title: channel.title || channel.channelName || 'TV channel',
    channelName: channel.channelName ?? null,
    artwork: channel.artworkUrl ?? null,
    subtitle: channel.channelName ?? channel.categories[0] ?? null,
    category: channel.categories[0] ?? null,
    source: 'tv',
    addedAt,
  }
}

export function buildTvLibraryItemFromFavorite(
  channelId: string,
  savedAt?: string,
): DesktopTvLibraryItem {
  return {
    type: 'tv',
    id: channelId.trim(),
    title: 'TV channel',
    channelName: null,
    artwork: null,
    subtitle: null,
    source: 'tv',
    addedAt: savedAt && Number.isFinite(Date.parse(savedAt)) ? savedAt : nowIso(),
  }
}

export function buildMotivationalLibraryItem(
  program: Pick<MotivationalProgramMeta, 'id' | 'title' | 'artworkUrl' | 'subtitle' | 'categorySlug'>,
  speakerName: string | null = null,
  addedAt = nowIso(),
): DesktopMotivationalLibraryItem {
  const speaker = speakerName ?? program.subtitle ?? null
  return {
    type: 'motivational',
    id: program.id.trim(),
    title: program.title || 'Motivational',
    speaker,
    artwork: program.artworkUrl ?? null,
    subtitle: speaker,
    category: program.categorySlug ?? null,
    source: 'motivational',
    addedAt,
  }
}

export function buildLectureLibraryItem(
  entry: LectureSavedEntry,
): DesktopLectureLibraryItem {
  return {
    type: 'lecture',
    id: entry.seriesId.trim(),
    title: entry.seriesTitle || 'Lecture series',
    speaker: entry.speakerName ?? null,
    artwork: entry.artworkUrl ?? null,
    subtitle: entry.speakerName ?? null,
    category: entry.categorySlug ?? null,
    source: 'lecture',
    addedAt: entry.savedAt,
  }
}

export function enrichSongLibraryItem(
  item: DesktopSongLibraryItem,
  song: ApiSong | null | undefined,
): DesktopSongLibraryItem {
  if (!song) return item
  return {
    ...item,
    title: song.title || item.title,
    artist: song.artist ?? item.artist ?? null,
    album: song.album ?? item.album ?? null,
    artwork: song.artwork ?? item.artwork ?? null,
    subtitle: song.artist ?? item.subtitle ?? null,
    duration: song.durationSeconds ?? item.duration ?? null,
    category: song.genre ?? item.category ?? null,
  }
}

export function isLibraryItemEqualIdentity(a: DesktopLibraryItem, b: DesktopLibraryItem) {
  return a.type === b.type && a.id === b.id
}
