const QueueUpNextPanel = memo(function QueueUpNextPanel({
  onOpenPlayer2,
  onOpenPlayer3,
  activeNavKey,
}: {
  onOpenPlayer2?: () => void
  onOpenPlayer3?: () => void
  activeNavKey?: NavKey
}) {
  const isLuxuryRail = activeNavKey === 'albums' || activeNavKey === 'playlists'
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    queueTitle,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    audioQualityMode,
    getUpcomingTracks,
    playQueueAtIndex,
    clearUpcomingQueue,
    seekTo,
    volume,
    setVolume,
  } = useDesktopPlayback()

  const listScrollRef = useRef<HTMLOListElement>(null)
  const progressTrackRef = useRef<HTMLDivElement>(null)
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const isAdjustingVolumeRef = useRef(false)

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)
  const upcomingTracks = getUpcomingTracks()
  const liveProgressMax = hasPlayback && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const activeTrackId = activeTrack?.id ?? null

  const displayTitle = hasPlayback ? (activeTrack?.title ?? 'Unknown track') : 'Nothing playing'
  const displayArtist = hasPlayback
    ? (activeTrack?.artist ?? 'Unknown artist')
    : 'Select a song to start'
  const displayAlbum = hasPlayback
    ? (activeTrack?.album ?? queueTitle ?? null)
    : null
  const railQualityLabel = hasPlayback
    ? (
      resolveSearchRowQualityBadge(activeTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(activeTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null
  const canClearQueue = upcomingTracks.length > 0

  const queueRows = useMemo(
    () => upcomingTracks.map((track, index) => ({
      key: `${track.id}-${index}`,
      track,
      title: track.title,
      artist: track.artist,
      duration: formatSongDurationLabel(track),
      queueIndex: currentIndex + 1 + index,
    })),
    [currentIndex, upcomingTracks],
  )

  useEffect(() => {
    if (!listScrollRef.current) return
    listScrollRef.current.scrollTop = 0
  }, [activeTrackId, currentIndex])

  const handleClearQueue = useCallback(() => {
    clearUpcomingQueue()
  }, [clearUpcomingQueue])

  const handleQueueRowClick = useCallback(
    (queueIndex: number) => {
      playQueueAtIndex(queueIndex)
    },
    [playQueueAtIndex],
  )

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = progressTrackRef.current
      if (!trackEl || liveProgressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * liveProgressMax
    },
    [liveProgressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!hasPlayback || liveProgressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasPlayback || liveProgressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekTo(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) seekTo(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resolveVolume = useCallback((clientX: number) => {
    const trackEl = volumeTrackRef.current
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
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

  const queueEmptyState = (
    <div className="queue-empty rail-queue-empty">
      <p className="queue-empty-title">Nothing queued next</p>
      <p className="queue-empty-detail">
        {hasPlayback
          ? 'Upcoming tracks from your current queue will appear here.'
          : 'Play a song to build your queue.'}
      </p>
    </div>
  )

  if (isLuxuryRail) {
    return (
      <aside
        className={`queue-rail now-playing-rail now-playing-rail--albums-luxury${activeNavKey === 'playlists' ? ' now-playing-rail--playlists-luxury' : ''}`}
        aria-label="Now playing"
        data-playing={isPlaying ? 'true' : 'false'}
        data-loading={isLoading ? 'true' : 'false'}
        data-idle={hasPlayback ? 'false' : 'true'}
      >
        <div className="now-playing-rail-inner">
          <header className="albums-rail-header">
            <h2 className="albums-rail-title">Now Playing</h2>
            <span className="albums-rail-waveform-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4 14V10M8 16V8M12 18V6M16 14V10M20 16V8" />
              </svg>
            </span>
          </header>

          <section className="albums-rail-stage" aria-label="Current track">
            <div className="albums-rail-art-shell">
              <span className="albums-rail-art-glow" aria-hidden="true" />
              <span className="albums-rail-vinyl premium-vinyl-disc" aria-hidden="true" />
              <div className="albums-rail-art-frame">
                <ArtworkImage
                  src={activeTrack?.artwork ?? null}
                  alt=""
                  seed={activeTrack?.id ?? 'now-playing'}
                  label={displayTitle}
                  priority
                />
                {isLoading ? (
                  <span className="albums-rail-art-spinner player-spinner" aria-hidden="true" />
                ) : null}
              </div>
            </div>

            <div className="albums-rail-track-row">
              <div className="albums-rail-track-copy">
                <h3 className="albums-rail-track-title">{displayTitle}</h3>
                <p className="albums-rail-track-artist">
                  <span>{displayArtist}</span>
                </p>
                {displayAlbum ? (
                  <p className="albums-rail-track-album">{displayAlbum}</p>
                ) : null}
              </div>
            </div>

            <div
              className="albums-rail-waveform-wrap"
              style={{ ['--albums-rail-progress' as string]: `${progressPercent}%` }}
            >
              <PremiumReactiveWaveform
                trackId={activeTrackId}
                progressPercent={progressPercent}
                progressMax={liveProgressMax}
                isLoading={isLoading && hasPlayback}
                onSeek={seekTo}
                className="albums-rail-waveform"
              />
            </div>

            <div className="albums-rail-transport-wrap">
              <FullPlayerTransportControls
                activeTrackId={activeTrack?.id ?? null}
                hideDecorativeControls
              />
            </div>

            {hasPlayback && railQualityLabel ? (
              <div className="albums-rail-badges">
                <span className="albums-rail-quality-pill">{railQualityLabel}</span>
              </div>
            ) : null}
          </section>

          <section className="albums-rail-up-next" aria-label="Up next">
            <div className="albums-rail-up-next-header">
              <h3 className="albums-rail-up-next-title">Up Next</h3>
              {canClearQueue ? (
                <button
                  type="button"
                  className="albums-rail-up-next-clear"
                  onClick={handleClearQueue}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {queueRows.length === 0 ? (
              queueEmptyState
            ) : (
              <ol className="albums-rail-up-next-list" ref={listScrollRef}>
                {queueRows.map((row) => (
                  <li className="albums-rail-up-next-item" key={row.key}>
                    <button
                      type="button"
                      className="albums-rail-up-next-button"
                      onClick={() => handleQueueRowClick(row.queueIndex)}
                    >
                      <div className="albums-rail-up-next-thumb" aria-hidden="true">
                        <ArtworkImage
                          src={row.track.artwork ?? null}
                          alt=""
                          seed={row.track.id}
                          label={row.title}
                        />
                      </div>
                      <div className="albums-rail-up-next-copy">
                        <span className="albums-rail-up-next-track">{row.title}</span>
                        <span className="albums-rail-up-next-artist">{row.artist}</span>
                      </div>
                      <span className="albums-rail-up-next-duration">{row.duration}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="queue-rail now-playing-rail now-playing-rail--psd"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >
      <div className="now-playing-rail-inner">
        <header className="rail-psd-header">
          <h2 className="rail-psd-title">Now Playing</h2>
        </header>

        <section className="rail-psd-stage" aria-label="Current track">
          <div className="rail-psd-art-shell">
            <span className="rail-psd-art-glow" aria-hidden="true" />
            <span className="rail-psd-vinyl premium-vinyl-disc" aria-hidden="true" />
            <div className="rail-psd-art-frame">
              <ArtworkImage
                src={activeTrack?.artwork ?? null}
                alt=""
                seed={activeTrack?.id ?? 'rail-now-playing'}
                label={displayTitle}
                priority
              />
              {isLoading ? (
                <span className="rail-psd-art-spinner player-spinner" aria-hidden="true" />
              ) : null}
            </div>
          </div>

          <div className="rail-psd-track-head">
            <div className="rail-psd-title-row">
              <h3 className="rail-psd-track-title">{displayTitle}</h3>
            </div>
            <p className="rail-psd-track-artist">
              <span>{displayArtist}</span>
            </p>
            {displayAlbum ? (
              <p className="rail-psd-track-album">{displayAlbum}</p>
            ) : null}
          </div>

          {hasPlayback && railQualityLabel ? (
            <div className="rail-psd-quality-row">
              <span className="rail-psd-hq-pill">{railQualityLabel}</span>
            </div>
          ) : null}

          <div
            className="rail-psd-progress-wrap"
            style={{ ['--rail-psd-progress' as string]: `${progressPercent}%` }}
          >
            <div
              ref={progressTrackRef}
              className={
                'rail-psd-progress-track'
                + (liveProgressMax > 0 && hasPlayback ? ' is-interactive' : '')
              }
              role="slider"
              aria-label="Seek position"
              aria-valuemin={0}
              aria-valuemax={Math.round(progressMax)}
              aria-valuenow={Math.round(progressValue)}
              aria-disabled={!hasPlayback || liveProgressMax <= 0 || isLoading}
              onClick={handleSeekClick}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerUp}
            >
              <div className="rail-psd-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="rail-psd-progress-times" aria-hidden="true">
              <span>{formatPlaybackTime(progressValue)}</span>
              <span>{formatPlaybackTime(progressMax)}</span>
            </div>
          </div>

          <div className="rail-psd-transport-wrap">
            <FullPlayerTransportControls
              activeTrackId={activeTrack?.id ?? null}
              hideDecorativeControls
            />
          </div>
        </section>

        <section className="rail-psd-queue-section" aria-label="Next in queue">
          <div className="rail-psd-queue-header">
            <h3 className="rail-psd-queue-title">Next In Queue</h3>
            {canClearQueue ? (
              <button
                type="button"
                className="rail-psd-queue-clear"
                onClick={handleClearQueue}
              >
                Clear
              </button>
            ) : null}
          </div>

          {queueRows.length === 0 ? (
            queueEmptyState
          ) : (
            <ol className="rail-psd-queue-list" ref={listScrollRef}>
              {queueRows.map((row) => (
                <li className="rail-psd-queue-item" key={row.key}>
                  <button
                    type="button"
                    className="rail-psd-queue-button"
                    onClick={() => handleQueueRowClick(row.queueIndex)}
                  >
                    <div className="rail-psd-queue-thumb" aria-hidden="true">
                      <ArtworkImage
                        src={row.track.artwork ?? null}
                        alt=""
                        seed={row.track.id}
                        label={row.title}
                      />
                    </div>
                    <div className="rail-psd-queue-copy">
                      <span className="rail-psd-queue-track">{row.title}</span>
                      <span className="rail-psd-queue-artist">{row.artist}</span>
                    </div>
                    <span className="rail-psd-queue-duration">{row.duration}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="rail-psd-footer">
          <div className="rail-psd-volume" role="group" aria-label="Volume">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
            <div
              ref={volumeTrackRef}
              className="rail-psd-volume-track"
              style={{ ['--rail-psd-volume' as string]: `${volumePercent}%` }}
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
              <div className="rail-psd-volume-fill" style={{ width: `${volumePercent}%` }} />
            </div>
          </div>
          {onOpenPlayer3 ? (
            <button type="button" className="rail-psd-full-player" onClick={onOpenPlayer3}>
              Show Full Player
            </button>
          ) : null}
          {onOpenPlayer2 ? (
            <button type="button" className="rail-psd-expand" aria-label="Expand player" onClick={onOpenPlayer2}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          ) : null}
        </footer>
      </div>
    </aside>
  )
})
