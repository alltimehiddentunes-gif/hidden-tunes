import { recordDesktopHistory } from './historyService'

/** Dual-write helpers — family stores remain source of progress; unified history is the Recent UI owner. */

export function mirrorMusicHistoryEntry(entry: {
  songId: string
  title: string
  artist: string
  album?: string | null
  artworkUrl?: string | null
  durationSeconds?: number | null
  playedAt: string
  completed: boolean
}) {
  recordDesktopHistory({
    type: 'song',
    id: entry.songId,
    title: entry.title,
    subtitle: entry.artist,
    artwork: entry.artworkUrl ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    completed: entry.completed,
    playedAt: entry.playedAt,
    metadata: { album: entry.album ?? null },
  })
}

export function mirrorPodcastHistoryEntry(entry: {
  episodeId: string
  showId?: string | null
  showTitle?: string | null
  episodeTitle?: string | null
  title?: string | null
  artworkUrl?: string | null
  durationSeconds?: number | null
  positionSeconds?: number | null
  completed?: boolean
  playedAt?: string
}) {
  recordDesktopHistory({
    type: 'podcast_episode',
    id: entry.episodeId,
    title: entry.episodeTitle || entry.title || 'Episode',
    subtitle: entry.showTitle ?? null,
    artwork: entry.artworkUrl ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    positionSeconds: entry.positionSeconds ?? null,
    completed: entry.completed === true,
    parentId: entry.showId ?? null,
    playedAt: entry.playedAt,
  })
}

export function mirrorAudiobookHistoryEntry(entry: {
  chapterId: string
  bookId?: string | null
  title?: string | null
  chapterTitle?: string | null
  bookTitle?: string | null
  artworkUrl?: string | null
  durationSeconds?: number | null
  positionSeconds?: number | null
  completed?: boolean
  playedAt?: string
}) {
  recordDesktopHistory({
    type: 'audiobook_chapter',
    id: entry.chapterId,
    title: entry.chapterTitle || entry.title || 'Chapter',
    subtitle: entry.bookTitle ?? null,
    artwork: entry.artworkUrl ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    positionSeconds: entry.positionSeconds ?? null,
    completed: entry.completed === true,
    parentId: entry.bookId ?? null,
    playedAt: entry.playedAt,
    metadata: { bookId: entry.bookId ?? null, chapterId: entry.chapterId },
  })
}

export function mirrorMotivationalHistoryEntry(entry: {
  sessionId: string
  programId?: string | null
  title?: string | null
  sessionTitle?: string | null
  programTitle?: string | null
  artworkUrl?: string | null
  durationSeconds?: number | null
  positionSeconds?: number | null
  completed?: boolean
  playedAt?: string
}) {
  recordDesktopHistory({
    type: 'motivational',
    id: entry.sessionId,
    title: entry.sessionTitle || entry.title || 'Session',
    subtitle: entry.programTitle ?? null,
    artwork: entry.artworkUrl ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    positionSeconds: entry.positionSeconds ?? null,
    completed: entry.completed === true,
    parentId: entry.programId ?? null,
    playedAt: entry.playedAt,
    metadata: { programId: entry.programId ?? null, sessionId: entry.sessionId },
  })
}

export function mirrorLectureHistoryEntry(entry: {
  sessionId: string
  seriesId?: string | null
  title?: string | null
  sessionTitle?: string | null
  seriesTitle?: string | null
  artworkUrl?: string | null
  durationSeconds?: number | null
  positionSeconds?: number | null
  completed?: boolean
  playedAt?: string
}) {
  recordDesktopHistory({
    type: 'lecture',
    id: entry.sessionId,
    title: entry.sessionTitle || entry.title || 'Session',
    subtitle: entry.seriesTitle ?? null,
    artwork: entry.artworkUrl ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    positionSeconds: entry.positionSeconds ?? null,
    completed: entry.completed === true,
    parentId: entry.seriesId ?? null,
    playedAt: entry.playedAt,
    metadata: { seriesId: entry.seriesId ?? null, sessionId: entry.sessionId },
  })
}

export function mirrorTvHistoryEntry(entry: {
  channelId: string
  title: string
  channelName?: string | null
  artworkUrl?: string | null
  watchedAt?: string
}) {
  recordDesktopHistory({
    type: 'tv',
    id: entry.channelId,
    title: entry.title,
    subtitle: entry.channelName ?? null,
    artwork: entry.artworkUrl ?? null,
    positionSeconds: null,
    playedAt: entry.watchedAt,
  })
}

export function mirrorRadioHistoryEntry(entry: {
  stationId: string
  title: string
  artworkUrl?: string | null
  country?: string | null
  isMature?: boolean
  contentRating?: string | null
}) {
  recordDesktopHistory({
    type: 'radio',
    id: entry.stationId,
    title: entry.title,
    subtitle: entry.country ?? 'Radio',
    artwork: entry.artworkUrl ?? null,
    positionSeconds: null,
    isMature: entry.isMature === true,
    contentRating: entry.contentRating ?? null,
  })
}
