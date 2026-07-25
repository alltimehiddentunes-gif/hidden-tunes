import type { ApiSong } from '../api'
import { isAudiobookQueueSong } from '../audiobooks/audiobookPlaybackAdapter'
import { isLectureQueueSong, isLectureVideoSong } from '../lectures/lecturePlaybackAdapter'
import {
  isMotivationalQueueSong,
  isMotivationalVideoSong,
} from '../motivationals/motivationalPlaybackAdapter'
import { isPodcastQueueSong } from '../podcasts/podcastPlaybackAdapter'
import { isRadioQueueSong } from '../radio/radioPlaybackAdapter'
import { isSportsQueueSong } from '../sports/sportsPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'
import { songHasLocalDownloadMarker } from './family'

/** Authoritative playback control capabilities for the shared player bar / queue. */
export type PlaybackCapabilities = {
  family:
    | 'song'
    | 'radio'
    | 'podcast_episode'
    | 'audiobook_chapter'
    | 'motivational'
    | 'lecture'
    | 'tv'
    | 'sports'
  seek: boolean
  previous: boolean
  next: boolean
  /** Finite natural-ended auto-advance only. Live families are always false. */
  autoAdvance: boolean
  /** Show finite mm:ss progress (never 0:00 / 0:00 for live). */
  showFiniteProgress: boolean
  isLive: boolean
  /** Downloaded / offline marker — does not change family. */
  isLocalDownload: boolean
}

function hasFiniteDuration(song: ApiSong): boolean {
  return typeof song.durationSeconds === 'number' && song.durationSeconds > 0
}

/**
 * Single capability resolver for transport UI and policy.
 * Family is never inferred from raw URL/extension/title alone — adapters own classification.
 */
export function resolvePlaybackCapabilities(song: ApiSong | null | undefined): PlaybackCapabilities {
  if (!song) {
    return {
      family: 'song',
      seek: false,
      previous: false,
      next: false,
      autoAdvance: false,
      showFiniteProgress: false,
      isLive: false,
      isLocalDownload: false,
    }
  }

  const isLocalDownload = songHasLocalDownloadMarker(song)

  if (isTvQueueSong(song)) {
    return {
      family: 'tv',
      seek: false,
      previous: true,
      next: true,
      autoAdvance: false,
      showFiniteProgress: false,
      isLive: true,
      isLocalDownload,
    }
  }

  if (isSportsQueueSong(song)) {
    return {
      family: 'sports',
      seek: false,
      previous: false,
      next: false,
      autoAdvance: false,
      showFiniteProgress: false,
      isLive: true,
      isLocalDownload,
    }
  }

  if (isRadioQueueSong(song)) {
    return {
      family: 'radio',
      seek: false,
      previous: true,
      next: true,
      autoAdvance: false,
      showFiniteProgress: false,
      isLive: true,
      isLocalDownload,
    }
  }

  if (isPodcastQueueSong(song)) {
    return {
      family: 'podcast_episode',
      seek: true,
      previous: true,
      next: true,
      autoAdvance: true,
      showFiniteProgress: true,
      isLive: false,
      isLocalDownload,
    }
  }

  if (isAudiobookQueueSong(song)) {
    return {
      family: 'audiobook_chapter',
      seek: true,
      previous: true,
      next: true,
      autoAdvance: true,
      showFiniteProgress: true,
      isLive: false,
      isLocalDownload,
    }
  }

  if (isMotivationalQueueSong(song)) {
    const finite = hasFiniteDuration(song) || isMotivationalVideoSong(song)
    return {
      family: 'motivational',
      seek: finite,
      previous: true,
      next: true,
      autoAdvance: true,
      showFiniteProgress: finite,
      isLive: !finite,
      isLocalDownload,
    }
  }

  if (isLectureQueueSong(song)) {
    const finite = hasFiniteDuration(song) || isLectureVideoSong(song)
    return {
      family: 'lecture',
      seek: finite,
      previous: true,
      next: true,
      autoAdvance: true,
      showFiniteProgress: finite,
      isLive: !finite,
      isLocalDownload,
    }
  }

  return {
    family: 'song',
    seek: true,
    previous: true,
    next: true,
    autoAdvance: true,
    showFiniteProgress: true,
    isLive: false,
    isLocalDownload,
  }
}
