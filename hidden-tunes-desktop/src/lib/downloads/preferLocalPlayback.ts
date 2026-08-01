import type { ApiSong } from '../api'
import { parseAudiobookSongId } from '../audiobooks/audiobookPlaybackAdapter'
import { extractPodcastEpisodeId } from '../podcasts/podcastPlaybackAdapter'
import {
  getDesktopDownloadPlayableUrl,
  hasDesktopDownloadsBridge,
  listDesktopDownloads,
} from './bridge'
import type { DesktopDownloadItem, DesktopDownloadType } from './types'
import { downloadIdentity } from './types'

export type LocalPreferSong = ApiSong & {
  offlineDownloadId?: string
}

function downloadKeyForSong(song: ApiSong): { type: DesktopDownloadType; id: string } | null {
  const episodeId = extractPodcastEpisodeId(song.id)
  if (episodeId) return { type: 'podcast_episode', id: episodeId }

  const audiobook = parseAudiobookSongId(song.id)
  if (audiobook) return { type: 'audiobook_chapter', id: audiobook.chapterId }

  if (song.id.startsWith('motivation-')) {
    const payload = song.id.slice('motivation-'.length)
    const sep = payload.indexOf('--')
    if (sep > 0) {
      const sessionId = payload.slice(sep + 2).trim()
      if (sessionId) return { type: 'motivational', id: sessionId }
    }
  }

  if (song.id.startsWith('lecture-')) {
    const payload = song.id.slice('lecture-'.length)
    const sep = payload.indexOf('--')
    if (sep > 0) {
      const sessionId = payload.slice(sep + 2).trim()
      if (sessionId) return { type: 'lecture', id: sessionId }
    }
  }

  if (
    song.id.startsWith('radio-')
    || song.id.startsWith('tv-')
    || song.id.startsWith('sports-')
    || song.id.startsWith('podcast-')
    || song.id.startsWith('audiobook-')
  ) {
    return null
  }

  return { type: 'song', id: song.id }
}

/**
 * Prefer verified local ht-download:// URLs for completed downloads so family Play
 * works offline through the existing playback owner (no second player).
 */
export async function applyLocalDownloadUrls(
  songs: ApiSong[],
): Promise<LocalPreferSong[]> {
  if (!songs.length || !hasDesktopDownloadsBridge()) return songs

  let items: DesktopDownloadItem[]
  try {
    items = await listDesktopDownloads()
  } catch {
    return songs
  }

  const completed = new Map<string, DesktopDownloadItem>()
  for (const item of items) {
    if (item.status !== 'completed') continue
    completed.set(downloadIdentity(item.type, item.id), item)
  }
  if (completed.size === 0) return songs

  const urlCache = new Map<string, string>()

  const next: LocalPreferSong[] = []
  for (const song of songs) {
    const key = downloadKeyForSong(song)
    if (!key) {
      next.push(song)
      continue
    }
    const item = completed.get(downloadIdentity(key.type, key.id))
    if (!item) {
      next.push(song)
      continue
    }

    let localUrl = urlCache.get(item.downloadId)
    if (!localUrl) {
      try {
        const result = await getDesktopDownloadPlayableUrl(item.downloadId)
        if (result.ok && result.url) {
          localUrl = result.url
          urlCache.set(item.downloadId, localUrl)
        }
      } catch {
        localUrl = undefined
      }
    }

    if (!localUrl) {
      next.push(song)
      continue
    }

    next.push({
      ...song,
      previewUrl: localUrl,
      audioUrl: localUrl,
      highQualityUrl: null,
      offlineDownloadId: item.downloadId,
      tags: Array.from(new Set([...(song.tags ?? []), 'offline', 'local-download'])),
    })
  }

  return next
}
