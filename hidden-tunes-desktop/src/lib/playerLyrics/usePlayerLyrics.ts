import { useMemo } from 'react'
import type { ApiSong } from '../api'
import {
  findActiveSyncedLineIndex,
  fromApiSong,
  resolvePlayerLyrics,
} from './resolvePlayerLyrics'
import type { PlayerLyricsResolveOptions, PlayerLyricsViewState } from './types'

export type UsePlayerLyricsResult = PlayerLyricsViewState & {
  activeSyncedLineIndex: number
}

export function usePlayerLyrics(
  track: ApiSong | null,
  positionSeconds = 0,
  options: PlayerLyricsResolveOptions = {},
): UsePlayerLyricsResult {
  const trackInput = useMemo(
    () => (track ? fromApiSong(track) : null),
    [track],
  )

  const viewState = useMemo(
    () => resolvePlayerLyrics(trackInput, options),
    [
      trackInput,
      options.isLoading,
      track?.id,
      track?.lyrics,
      track?.lyricLines,
      track?.syncedLyrics,
      track?.lyricsSource,
    ],
  )

  const activeSyncedLineIndex = useMemo(() => {
    if (viewState.availability !== 'synced') return -1
    return findActiveSyncedLineIndex(
      viewState.syncedLines,
      Math.max(0, positionSeconds) * 1000,
    )
  }, [positionSeconds, viewState.availability, viewState.syncedLines])

  return {
    ...viewState,
    activeSyncedLineIndex,
  }
}
