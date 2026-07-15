import type { ApiSong } from '../api'
import type { QueueContext } from '../desktopPlayback/types'
import { isPodcastQueueSong } from '../podcasts/podcastPlaybackAdapter'
import { isAudiobookQueueSong } from '../audiobooks/audiobookPlaybackAdapter'
import { isRadioQueueSong } from '../radio/radioPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'
import {
  resolvePlayerArtist,
  resolvePlayerQualityLabel,
  resolvePlayerTitle,
} from '../playerDisplayMetadata'
import type { AudioQualityMode } from '../localPreferences'
import { formatPlaybackTime } from './formatPlaybackTime'

export type PlayerMediaKind =
  | 'music'
  | 'radio'
  | 'podcast'
  | 'audiobook'
  | 'tv'
  | 'motivational'
  | 'lecture'

export type PlayerShellTab = 'queue' | 'lyrics' | 'details'

export type PlayerDetailField = {
  label: string
  value: string
}

export type PlayerMediaAdapter = {
  kind: PlayerMediaKind
  centerEyebrow: string
  sourceLabel: string | null
  genre: string | null
  liveIndicator: boolean
  seekable: boolean
  showShuffleRepeat: boolean
  showDuration: boolean
  showLyrics: boolean
  showQualitySelector: boolean
  defaultTab: PlayerShellTab
  tabs: PlayerShellTab[]
  queueTabLabel: string
  detailFields: PlayerDetailField[]
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function inferKindFromContext(
  track: ApiSong | null,
  queueContext: QueueContext,
  queueTitle: string | null,
): PlayerMediaKind {
  if (track && isRadioQueueSong(track)) return 'radio'
  if (track && isTvQueueSong(track)) return 'tv'
  if (track && isPodcastQueueSong(track)) return 'podcast'
  if (track && isAudiobookQueueSong(track)) return 'audiobook'
  if (queueContext === 'radio') return 'radio'
  if (queueContext === 'podcast') return 'podcast'
  if (queueContext === 'audiobook') return 'audiobook'

  const titleHint = (queueTitle ?? '').toLowerCase()
  if (titleHint.includes('audiobook')) return 'audiobook'
  if (titleHint.includes('motivational') || titleHint.includes('motivation')) return 'motivational'
  if (titleHint.includes('lecture') || titleHint.includes('educational')) return 'lecture'
  if (titleHint.includes('tv') || titleHint.includes('channel')) return 'tv'

  const id = track?.id ?? ''
  if (id.startsWith('audiobook-')) return 'audiobook'
  if (id.startsWith('tv-')) return 'tv'
  if (id.startsWith('motivation-')) return 'motivational'
  if (id.startsWith('lecture-')) return 'lecture'

  return 'music'
}

function buildDetailFields(
  track: ApiSong,
  albumLabel: string | null,
  qualityLabel: string | null,
  sourceLabel: string | null,
  kind: PlayerMediaKind,
): PlayerDetailField[] {
  const fields: PlayerDetailField[] = []

  const push = (label: string, value: string | null | undefined) => {
    const normalized = normalizeText(value)
    if (normalized) fields.push({ label, value: normalized })
  }

  if (kind === 'radio') {
    push('Station', resolvePlayerTitle(track))
    push('Genre', track.genre)
    push('Source', sourceLabel ?? track.album)
    push('Quality', qualityLabel ?? 'Live')
    return fields
  }

  if (kind === 'podcast') {
    push('Episode', resolvePlayerTitle(track))
    push('Show', resolvePlayerArtist(track))
    push('Genre', track.genre)
    push('Source', sourceLabel)
    if (track.durationSeconds != null && track.durationSeconds > 0) {
      push('Duration', formatPlaybackTime(track.durationSeconds))
    }
    push('Quality', qualityLabel)
    return fields
  }

  if (kind === 'audiobook') {
    push('Chapter', resolvePlayerTitle(track))
    push('Author', resolvePlayerArtist(track))
    push('Book', albumLabel)
    push('Source', sourceLabel)
    push('Quality', qualityLabel)
    return fields
  }

  if (kind === 'tv') {
    push('Program', resolvePlayerTitle(track))
    push('Channel', resolvePlayerArtist(track))
    push('Source', sourceLabel)
    push('Quality', qualityLabel)
    return fields
  }

  if (kind === 'motivational') {
    push('Session', resolvePlayerTitle(track))
    push('Speaker', resolvePlayerArtist(track))
    push('Series', albumLabel)
    push('Source', sourceLabel)
    push('Quality', qualityLabel)
    return fields
  }

  if (kind === 'lecture') {
    push('Lecture', resolvePlayerTitle(track))
    push('Speaker', resolvePlayerArtist(track))
    push('Course', albumLabel)
    push('Institution', sourceLabel)
    push('Quality', qualityLabel)
    return fields
  }

  push('Title', resolvePlayerTitle(track))
  push('Artist', resolvePlayerArtist(track))
  push('Album', albumLabel)
  push('Genre', track.genre)
  push('Source', sourceLabel)
  push('Quality', qualityLabel)
  if (track.durationSeconds != null && track.durationSeconds > 0) {
    push('Duration', formatPlaybackTime(track.durationSeconds))
  }

  return fields
}

export function resolvePlayerMediaAdapter(input: {
  track: ApiSong | null
  queueContext: QueueContext
  queueTitle: string | null
  albumLabel: string | null
  audioQualityMode: AudioQualityMode
  isActive: boolean
}): PlayerMediaAdapter {
  const {
    track,
    queueContext,
    queueTitle,
    albumLabel,
    audioQualityMode,
    isActive,
  } = input

  const kind = inferKindFromContext(track, queueContext, queueTitle)
  const qualityLabel = resolvePlayerQualityLabel(track, audioQualityMode, isActive)
  const sourceLabel = normalizeText(queueTitle) ?? normalizeText(track?.album)

  const liveIndicator = kind === 'radio' || kind === 'tv'
  const seekable = kind !== 'radio' && kind !== 'tv'
  const showDuration = seekable && Boolean(track?.durationSeconds && track.durationSeconds > 0)
  const showShuffleRepeat = kind === 'music' || kind === 'motivational' || kind === 'lecture'
  const showLyrics = kind === 'music' || kind === 'motivational'
  const showQualitySelector = kind === 'music'

  const centerEyebrow = kind === 'radio'
    ? 'Live Radio'
    : kind === 'podcast'
      ? 'Podcast'
      : kind === 'audiobook'
        ? 'Audiobook'
        : kind === 'tv'
          ? 'Live TV'
          : kind === 'motivational'
            ? 'Motivational'
            : kind === 'lecture'
              ? 'Lecture'
              : 'Now Playing'

  const tabs: PlayerShellTab[] = ['queue', 'details']
  if (showLyrics) tabs.splice(1, 0, 'lyrics')

  return {
    kind,
    centerEyebrow,
    sourceLabel,
    genre: normalizeText(track?.genre),
    liveIndicator,
    seekable,
    showShuffleRepeat,
    showDuration,
    showLyrics,
    showQualitySelector,
    defaultTab: 'queue',
    tabs,
    queueTabLabel: kind === 'audiobook' ? 'Chapters' : 'Queue',
    detailFields: track
      ? buildDetailFields(track, albumLabel, qualityLabel, sourceLabel, kind)
      : [],
  }
}
