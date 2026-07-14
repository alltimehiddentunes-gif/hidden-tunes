import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { ApiSong } from '../../lib/api'
import { ArtworkImage } from '../ArtworkImage'
import { PlayerLyricsPanel } from '../PlayerLyricsPanel'
import { PlayerModeLauncher } from '../PlayerModeLauncher'
import { PlayerModeSwitcher } from '../PlayerModeSwitcher'
import {
  AUDIO_QUALITY_MODE_LABELS,
  AUDIO_QUALITY_MODES,
  type AudioQualityMode,
} from '../../lib/localPreferences'
import type { NowPlayingStyle } from '../../lib/nowPlayingStyle'
import { overlayPhaseDataAttr } from '../../lib/playerOverlayTransition'
import type { PlayerOverlayPhase } from '../../lib/playerOverlayTransition'
import { formatPlaybackTime } from '../../lib/player/formatPlaybackTime'
import {
  resolvePlayerMediaAdapter,
  type PlayerShellTab,
} from '../../lib/player/mediaAdapter'
import { FullPlayerTransportControls } from './FullPlayerTransportControls'
import { PlayerDetailsPanel, PlayerQueuePanel } from './PlayerShellPanels'
import { usePlayerShellChrome, usePlayerShellState } from './usePlayerShellHooks'

const SHELL_TABS: Record<PlayerShellTab, string> = {
  queue: 'Queue',
  lyrics: 'Lyrics',
  details: 'Details',
}

function AudioQualityCompact({
  value,
  onChange,
}: {
  value: AudioQualityMode
  onChange: (mode: AudioQualityMode) => void
}) {
  return (
    <select
      className="audio-quality-select premium-shell-quality-select"
      value={value}
      onChange={(event) => onChange(event.target.value as AudioQualityMode)}
      aria-label="Playback quality"
    >
      {AUDIO_QUALITY_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {AUDIO_QUALITY_MODE_LABELS[mode]}
        </option>
      ))}
    </select>
  )
}

export const PremiumFullscreenShell = memo(function PremiumFullscreenShell({
  onClose,
  preferredTrack = null,
  activePlayerMode,
  onSwitchPlayerMode,
  overlayPhase = 'idle',
  initialTab = 'queue',
}: {
  onClose: () => void
  preferredTrack?: ApiSong | null
  activePlayerMode: NowPlayingStyle
  onSwitchPlayerMode: (style: NowPlayingStyle) => void
  overlayPhase?: PlayerOverlayPhase
  initialTab?: PlayerShellTab
}) {
  const shell = usePlayerShellState(preferredTrack)
  const {
    displayTrack,
    isActive,
    isPlaying,
    isLoading,
    progressMax,
    progressValue,
    displayTitle,
    displayArtist,
    displayAlbum,
    displayArtwork,
    qualityLabel,
    activeTrackId,
    seekTo,
    volume,
    setVolume,
    positionSeconds,
    queueContext,
    queueTitle,
    audioQualityMode,
    setAudioQualityMode,
  } = shell

  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const progressTrackRef = useRef<HTMLDivElement>(null)
  const isAdjustingVolumeRef = useRef(false)
  const isSeekingRef = useRef(false)
  const [playerTab, setPlayerTab] = useState<PlayerShellTab>(initialTab)
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)

  const adapter = useMemo(
    () => resolvePlayerMediaAdapter({
      track: displayTrack,
      queueContext,
      queueTitle: queueTitle ?? null,
      albumLabel: displayAlbum,
      audioQualityMode,
      isActive,
    }),
    [
      audioQualityMode,
      displayAlbum,
      displayTrack,
      isActive,
      queueContext,
      queueTitle,
    ],
  )

  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const dockProgressValue = scrubSeconds ?? progressValue
  const dockProgressPercent = progressMax > 0
    ? Math.min(100, (dockProgressValue / progressMax) * 100)
    : 0

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!adapter.seekable || !isActive || progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!adapter.seekable || !isActive || progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubSeconds(seconds)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) setScrubSeconds(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (scrubSeconds != null) seekTo(scrubSeconds)
    setScrubSeconds(null)
  }

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const handleVolumeClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume == null) return
    isAdjustingVolumeRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    setVolume(nextVolume)
  }

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    const nextVolume = resolveVolume(event.clientX)
    if (nextVolume != null) setVolume(nextVolume)
  }

  const handleVolumePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustingVolumeRef.current) return
    isAdjustingVolumeRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  usePlayerShellChrome(onClose)

  return (
    <div
      className="premium-fullscreen-shell cinema-player cinema-player--psd-master premium-player-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen player"
      data-overlay-phase={overlayPhaseDataAttr(overlayPhase)}
      data-player-variant={activePlayerMode}
      data-media-kind={adapter.kind}
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
    >
      <div className="premium-shell-bg entity-atmosphere entity-atmosphere--placeholder" aria-hidden="true" />
      <div className="premium-shell-veil" aria-hidden="true" />

      <header className="premium-shell-topbar">
        <button
          type="button"
          className="premium-shell-topbar-btn"
          onClick={onClose}
          aria-label="Exit fullscreen player"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="premium-shell-topbar-copy">
          <span className="premium-shell-topbar-eyebrow">PLAYING FROM</span>
          {adapter.sourceLabel ? (
            <p className="premium-shell-topbar-source">
              <strong>{adapter.sourceLabel}</strong>
            </p>
          ) : null}
        </div>
        <PlayerModeSwitcher
          activeMode={activePlayerMode}
          onSwitchMode={onSwitchPlayerMode}
          hasPlayback={isActive}
          align="right"
        />
      </header>

      <div className="premium-shell-body">
        <section className="premium-shell-left" aria-label="Artwork and track">
          <div className="premium-shell-art-frame">
            <ArtworkImage
              src={displayArtwork}
              alt=""
              seed={displayTrack?.id ?? 'premium-shell'}
              label={displayTitle}
              priority
            />
            {isLoading && isActive ? (
              <span className="premium-shell-art-spinner player-spinner" aria-hidden="true" />
            ) : null}
          </div>

          <div className="premium-shell-left-meta">
            {qualityLabel ? (
              <span className="premium-shell-quality-pill">{qualityLabel}</span>
            ) : null}
            <h2 className="premium-shell-title">{displayTitle}</h2>
            <p className="premium-shell-artist">{displayArtist}</p>
            {displayAlbum ? (
              <p className="premium-shell-album">{displayAlbum}</p>
            ) : null}
            {adapter.genre ? (
              <p className="premium-shell-genre">{adapter.genre}</p>
            ) : null}
          </div>
        </section>

        <section className="premium-shell-center" aria-label="Now playing">
          <p className="premium-shell-center-eyebrow">{adapter.centerEyebrow}</p>
          <h2 className="premium-shell-center-title">{displayTitle}</h2>
          <p className="premium-shell-center-artist">{displayArtist}</p>
          {displayAlbum ? (
            <p className="premium-shell-center-album">{displayAlbum}</p>
          ) : null}
          {adapter.sourceLabel ? (
            <p className="premium-shell-center-source">{adapter.sourceLabel}</p>
          ) : null}
          {adapter.genre ? (
            <p className="premium-shell-center-genre">{adapter.genre}</p>
          ) : null}
          {qualityLabel ? (
            <span className="premium-shell-center-quality">{qualityLabel}</span>
          ) : null}
        </section>

        <aside className="premium-shell-right" aria-label="Player panels">
          <div className="premium-shell-tabs" role="tablist" aria-label="Player panels">
            {adapter.tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={`premium-shell-tab${playerTab === tab ? ' is-active' : ''}`}
                aria-selected={playerTab === tab}
                onClick={() => setPlayerTab(tab)}
              >
                {SHELL_TABS[tab]}
              </button>
            ))}
          </div>

          <div className="premium-shell-panel">
            {playerTab === 'queue' ? <PlayerQueuePanel showHeader /> : null}
            {playerTab === 'lyrics' && adapter.showLyrics ? (
              <div className="premium-shell-lyrics" role="tabpanel" aria-label="Lyrics">
                <PlayerLyricsPanel
                  track={displayTrack}
                  positionSeconds={isActive ? positionSeconds : 0}
                  isLoading={isLoading && isActive}
                  variant="embed"
                />
              </div>
            ) : null}
            {playerTab === 'details' ? (
              <PlayerDetailsPanel fields={adapter.detailFields} />
            ) : null}
          </div>
        </aside>
      </div>

      <footer className="premium-shell-dock">
        <div className="premium-shell-timeline-row">
          {adapter.liveIndicator ? (
            <span className="premium-shell-live-badge" aria-live="polite">LIVE</span>
          ) : (
            <span className="premium-shell-time">{formatPlaybackTime(dockProgressValue)}</span>
          )}
          {adapter.seekable ? (
            <div
              ref={progressTrackRef}
              className={`premium-shell-progress-track${progressMax > 0 && isActive ? ' is-interactive' : ''}`}
              style={{ ['--premium-shell-progress' as string]: `${dockProgressPercent}%` }}
              role="slider"
              aria-label="Playback position"
              aria-valuemin={0}
              aria-valuemax={Math.round(progressMax)}
              aria-valuenow={Math.round(dockProgressValue)}
              aria-disabled={!isActive || progressMax <= 0 || isLoading}
              onClick={handleSeekClick}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerUp}
            >
              <div
                className="premium-shell-progress-fill"
                style={{ width: `${dockProgressPercent}%` }}
              />
            </div>
          ) : (
            <div className="premium-shell-progress-track premium-shell-progress-track--live" aria-hidden="true">
              <div className="premium-shell-progress-fill premium-shell-progress-fill--live" />
            </div>
          )}
          {adapter.showDuration ? (
            <span className="premium-shell-time">{formatPlaybackTime(progressMax)}</span>
          ) : adapter.liveIndicator ? (
            <span className="premium-shell-time premium-shell-time--live">On air</span>
          ) : (
            <span className="premium-shell-time">—</span>
          )}
        </div>

        <div className="premium-shell-controls-row">
          <div className="premium-shell-volume" role="group" aria-label="Volume">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M11 5L6 9H3v6h3l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
            </svg>
            <div
              ref={volumeTrackRef}
              className="premium-shell-volume-track"
              style={{ ['--premium-shell-volume' as string]: `${volumePercent}%` }}
              role="slider"
              aria-label="Volume"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(volumePercent)}
              onClick={handleVolumeClick}
              onPointerDown={handleVolumePointerDown}
              onPointerMove={handleVolumePointerMove}
              onPointerUp={handleVolumePointerUp}
              onPointerCancel={handleVolumePointerUp}
            >
              <div className="premium-shell-volume-fill" style={{ width: `${volumePercent}%` }} />
            </div>
          </div>

          <FullPlayerTransportControls
            activeTrackId={activeTrackId}
            showShuffleRepeat={adapter.showShuffleRepeat}
          />

          <div className="premium-shell-utilities" role="toolbar" aria-label="Player utilities">
            <PlayerModeLauncher
              hasPlayback={isActive}
              onOpenPlayerByStyle={onSwitchPlayerMode}
              variant="footer"
            />
            {adapter.showQualitySelector ? (
              <AudioQualityCompact
                value={audioQualityMode}
                onChange={setAudioQualityMode}
              />
            ) : null}
            <button
              type="button"
              className="premium-shell-utility"
              aria-label="Show queue"
              onClick={() => setPlayerTab('queue')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
            {adapter.showLyrics ? (
              <button
                type="button"
                className="premium-shell-utility"
                aria-label="Show lyrics"
                onClick={() => setPlayerTab('lyrics')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M4 6h16M4 12h10M4 18h14" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="premium-shell-utility"
              aria-label="Exit fullscreen player"
              onClick={onClose}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
})
