import type { ApiSong } from '../api'
import { isMotivationalVideoSong } from '../motivationals/motivationalPlaybackAdapter'
import { isSportsQueueSong } from '../sports/sportsPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'
import { requiresVideoSurface } from './resolveActivePlayerSurface'

/**
 * Visual shell for the shared HtmlVideoPlaybackService element.
 * Does not change playback ownership — only presentation dimensions.
 */
export type VideoSurfaceLayout =
  | 'tv-cinema'
  | 'sports-wide'
  | 'motivational-contained'
  | 'none'

/**
 * Resolve the presentation layout from the active track family only.
 * Motivational video uses a bounded main-stage card; TV/Sports keep the rail.
 */
export function resolveVideoSurfaceLayout(
  currentTrack: ApiSong | null | undefined,
): VideoSurfaceLayout {
  if (!currentTrack || !requiresVideoSurface(currentTrack)) return 'none'
  if (isMotivationalVideoSong(currentTrack)) return 'motivational-contained'
  if (isSportsQueueSong(currentTrack)) return 'sports-wide'
  if (isTvQueueSong(currentTrack)) return 'tv-cinema'
  return 'none'
}

export function isMotivationalContainedLayout(
  layout: VideoSurfaceLayout,
): boolean {
  return layout === 'motivational-contained'
}
