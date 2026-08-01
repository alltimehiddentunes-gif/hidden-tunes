import type { ApiSong } from '../api'
import { isMotivationalVideoSong } from '../motivationals/motivationalPlaybackAdapter'
import { isSportsQueueSong } from '../sports/sportsPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'

/**
 * Which right-rail player surface to mount for the active media session.
 *
 * Intentionally route-agnostic: browsing Music/Home/Podcasts must not flip
 * this while a video session (TV / Sports / Motivational video) remains active.
 *
 * Note: lecture video mounts in-page on LectureSeriesPage and is intentionally
 * excluded from this rail so the shared video element is not remounted twice.
 */
export type ActivePlayerSurface = 'tv' | 'audio'

/**
 * True when the active session owns a real shared-video playback source that
 * must present the visible video rail (TvNowPlayingPanel + TvVideoSurface).
 *
 * Uses adapter classification — never the current route.
 */
export function requiresVideoSurface(
  currentTrack: ApiSong | null | undefined,
): boolean {
  if (!currentTrack) return false
  if (isTvQueueSong(currentTrack)) return true
  if (isSportsQueueSong(currentTrack)) return true
  if (isMotivationalVideoSong(currentTrack)) return true
  return false
}

/**
 * Resolve the persistent right-rail surface from the active playback track only.
 * Do not pass activeNavKey / activePage / pathname into this helper.
 *
 * Surface key `'tv'` is the shared video rail (historical name retained for CSS).
 */
export function resolveActivePlayerSurface(
  currentTrack: ApiSong | null | undefined,
): ActivePlayerSurface {
  if (requiresVideoSurface(currentTrack)) return 'tv'
  return 'audio'
}
