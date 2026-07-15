import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ApiSong } from '../../lib/api'
import { useDesktopPlayback } from '../../context/DesktopPlaybackProvider'
import {
  AUDIO_QUALITY_MODE_LABELS,
  AUDIO_QUALITY_MODES,
  type AudioQualityMode,
} from '../../lib/localPreferences'
import { resolvePlaybackSourceDisplay } from '../../lib/playbackSourceContext'
import { resolvePlayerMediaAdapter } from '../../lib/player/mediaAdapter'
import {
  resolvePlayerArtist,
  resolvePlayerTitle,
  resolvePlayerTrackArtwork,
} from '../../lib/playerDisplayMetadata'
import { ArtworkImage } from '../ArtworkImage'
import { FullPlayerTransportControls } from './FullPlayerTransportControls'
import { MusicNowPlayingProgress } from './MusicNowPlayingProgress'
import { UpNextPanel } from './UpNextPanel'

type MusicNowPlayingPageProps = {
  song: ApiSong | null
  searchQuery?: string | null
  onBack: () => void
  onBrowseMusic?: () => void
  onOpenAlbum?: (albumId: string) => void
  onOpenArtist?: (artistId: string) => void
}

function useNativeFullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen may be unavailable in some environments.
    }
  }, [])

  return { isFullscreen, toggleFullscreen }
}

export const MusicNowPlayingPage = memo(function MusicNowPlayingPage({
  song,
  searchQuery,
  onBack,
  onBrowseMusic,
  onOpenAlbum,
  onOpenArtist,
}: MusicNowPlayingPageProps) {
  const {
    currentTrack,
    queueContext,
    queueTitle,
    queueSeedType,
    isPlaying,
    isLoading,
    audioQualityMode,
    setAudioQualityMode,
    seekTo,
  } = useDesktopPlayback()

  const { isFullscreen, toggleFullscreen } = useNativeFullscreenToggle()
  const [queueOpen, setQueueOpen] = useState(true)
  const displayTrack = currentTrack ?? song
  const isActive = Boolean(displayTrack && currentTrack?.id === displayTrack.id)
  const title = displayTrack ? resolvePlayerTitle(displayTrack) : 'Nothing is playing'
  const artist = displayTrack ? resolvePlayerArtist(displayTrack) : 'Unknown Artist'
  const artwork = displayTrack ? resolvePlayerTrackArtwork(displayTrack) : null
  const albumLabel = displayTrack?.album?.trim() || null
  const genreLabel = displayTrack?.genre?.trim() || null

  const adapter = useMemo(
    () => resolvePlayerMediaAdapter({
      track: displayTrack,
      queueContext,
      queueTitle: queueTitle ?? null,
      albumLabel,
      audioQualityMode,
      isActive,
    }),
    [albumLabel, audioQualityMode, displayTrack, isActive, queueContext, queueTitle],
  )

  const sourceDisplay = useMemo(
    () => resolvePlaybackSourceDisplay({
      queueContext,
      queueTitle: queueTitle ?? null,
      queueSeedType,
      trackAlbum: displayTrack?.album,
      trackAlbumId: displayTrack?.albumId,
      trackArtist: displayTrack?.artist,
      trackArtistId: displayTrack?.artistId,
      searchQuery,
    }),
    [displayTrack, queueContext, queueSeedType, queueTitle, searchQuery],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      onBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const handleSourceClick = useCallback(() => {
    const route = sourceDisplay.route
    if (!route) return
    if (route.type === 'album') onOpenAlbum?.(route.albumId)
    if (route.type === 'artist') onOpenArtist?.(route.artistId)
  }, [onOpenAlbum, onOpenArtist, sourceDisplay.route])

  const canOpenAlbum = Boolean(displayTrack?.albumId && onOpenAlbum)
  const canOpenArtist = Boolean(displayTrack?.artistId && onOpenArtist)

  return (
    <div
      className="music-now-playing-page"
      data-playing={isActive && isPlaying ? 'true' : 'false'}
      data-loading={isActive && isLoading ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-queue-open={queueOpen ? 'true' : 'false'}
    >
      <header className="music-now-playing-toolbar">
        <button type="button" className="music-now-playing-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back
        </button>
        <p className="music-now-playing-toolbar-title">Now Playing</p>
        <div className="music-now-playing-toolbar-actions">
          <button
            type="button"
            className="music-now-playing-queue-toggle"
            onClick={() => setQueueOpen((open) => !open)}
            aria-expanded={queueOpen}
            aria-controls="music-now-playing-up-next"
            aria-label={queueOpen ? 'Hide queue' : 'Show queue'}
          >
            Queue
          </button>
          <button
            type="button"
            className="music-now-playing-fullscreen"
            onClick={() => { void toggleFullscreen() }}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
            </svg>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </header>

      <div className="music-now-playing-layout">
        <section className="music-now-playing-art" aria-label="Artwork">
          <div className="music-now-playing-art-frame">
            <ArtworkImage
              src={artwork}
              alt=""
              seed={displayTrack?.id ?? 'music-now-playing'}
              label={title}
              priority
            />
            {isActive && isLoading ? (
              <span className="music-now-playing-art-spinner player-spinner" aria-hidden="true" />
            ) : null}
          </div>
        </section>

        <section className="music-now-playing-center" aria-label="Track information and controls">
          {!displayTrack ? (
            <div className="music-now-playing-empty">
              <p className="music-now-playing-empty-title">Nothing is playing</p>
              <p className="music-now-playing-empty-detail">Choose a song from Music to begin.</p>
              {onBrowseMusic ? (
                <button type="button" className="music-up-next-browse-btn" onClick={onBrowseMusic}>
                  Browse Music
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="music-now-playing-eyebrow">{adapter.centerEyebrow}</p>
              <h1 className="music-now-playing-title">{title}</h1>
              {canOpenArtist ? (
                <button type="button" className="music-now-playing-link music-now-playing-artist" onClick={() => onOpenArtist?.(displayTrack.artistId!)}>
                  {artist}
                </button>
              ) : (
                <p className="music-now-playing-artist">{artist}</p>
              )}
              {albumLabel ? (
                canOpenAlbum ? (
                  <button type="button" className="music-now-playing-link music-now-playing-album" onClick={() => onOpenAlbum?.(displayTrack.albumId!)}>
                    {albumLabel}
                  </button>
                ) : (
                  <p className="music-now-playing-album">{albumLabel}</p>
                )
              ) : null}
              {sourceDisplay.title ? (
                sourceDisplay.route ? (
                  <button type="button" className="music-now-playing-source music-now-playing-link" onClick={handleSourceClick}>
                    <span>{sourceDisplay.prefix}</span>
                    <strong>{sourceDisplay.title}</strong>
                  </button>
                ) : (
                  <p className="music-now-playing-source">
                    <span>{sourceDisplay.prefix}</span>
                    <strong>{sourceDisplay.title}</strong>
                  </p>
                )
              ) : null}
              {genreLabel ? <p className="music-now-playing-genre">{genreLabel}</p> : null}

              <FullPlayerTransportControls
                activeTrackId={displayTrack.id}
                showShuffleRepeat={adapter.showShuffleRepeat}
              />

              {adapter.seekable ? (
                <MusicNowPlayingProgress
                  isActive={isActive}
                  isLoading={isLoading}
                  seekTo={seekTo}
                />
              ) : null}

              <div className="music-now-playing-secondary">
                {adapter.showQualitySelector ? (
                  <label className="music-now-playing-quality">
                    <span>Quality</span>
                    <select
                      value={audioQualityMode}
                      onChange={(event) => setAudioQualityMode(event.target.value as AudioQualityMode)}
                      aria-label="Playback quality"
                    >
                      {AUDIO_QUALITY_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {AUDIO_QUALITY_MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </>
          )}
        </section>

        <div id="music-now-playing-up-next" className="music-now-playing-queue-slot">
          <UpNextPanel
            currentTrack={displayTrack}
            isPlaying={isPlaying}
            isLoading={isLoading}
            isActive={isActive}
            onBrowseMusic={onBrowseMusic}
          />
        </div>
      </div>
    </div>
  )
})
