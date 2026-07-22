import type { ApiSong } from '../api'
import { isAudiobookQueueSong } from '../audiobooks/audiobookPlaybackAdapter'
import { isLectureQueueSong } from '../lectures/lecturePlaybackAdapter'
import { isMotivationalQueueSong } from '../motivationals/motivationalPlaybackAdapter'
import { isPodcastQueueSong } from '../podcasts/podcastPlaybackAdapter'
import { isRadioQueueSong } from '../radio/radioPlaybackAdapter'
import { isTvQueueSong } from '../tv/tvPlaybackAdapter'

export function isMusicCatalogSong(song: ApiSong | null | undefined): boolean {
  if (!song?.id) return false
  if (isPodcastQueueSong(song)) return false
  if (isRadioQueueSong(song)) return false
  if (isTvQueueSong(song)) return false
  if (isAudiobookQueueSong(song)) return false
  if (isMotivationalQueueSong(song)) return false
  if (isLectureQueueSong(song)) return false
  if (song.id.startsWith('motivational:') || song.id.startsWith('motivation-')) return false
  if (song.id.startsWith('lecture-')) return false
  return true
}
