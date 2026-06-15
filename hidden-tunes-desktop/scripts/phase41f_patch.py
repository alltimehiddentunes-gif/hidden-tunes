#!/usr/bin/env python3
"""Phase 41F — Right Rail Luxury Player reconstruction."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


RAIL_WAVEFORM_COMPONENT = '''
function buildRailWaveformHeights(seed: string, count = 36) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((hash + index * 17) * 0.73) * 0.5 + 0.5
    const shaped = 0.28 + value * 0.72
    return Math.round(shaped * 100)
  })
}

const RailWaveformSeek = memo(function RailWaveformSeek({
  trackId,
  progressPercent,
  progressMax,
  isLoading,
  onSeek,
}: {
  trackId: string | null
  progressPercent: number
  progressMax: number
  isLoading: boolean
  onSeek: (seconds: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const isSeekingRef = useRef(false)
  const heights = useMemo(
    () => buildRailWaveformHeights(trackId ?? 'idle-rail'),
    [trackId],
  )

  const resolveSeekSeconds = useCallback(
    (clientX: number) => {
      const trackEl = trackRef.current
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  const handleSeekClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading || isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (progressMax <= 0 || isLoading) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds == null) return
    isSeekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(seconds)
  }

  const handleSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    const seconds = resolveSeekSeconds(event.clientX)
    if (seconds != null) onSeek(seconds)
  }

  const handleSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return
    isSeekingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={trackRef}
      className="rail-waveform"
      role="slider"
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={progressMax > 0 ? progressMax : 0}
      aria-valuenow={progressMax > 0 ? (progressPercent / 100) * progressMax : 0}
      aria-disabled={progressMax <= 0 || isLoading}
      onClick={handleSeekClick}
      onPointerDown={handleSeekPointerDown}
      onPointerMove={handleSeekPointerMove}
      onPointerUp={handleSeekPointerUp}
      onPointerCancel={handleSeekPointerUp}
    >
      {heights.map((height, index) => {
        const barProgress = ((index + 0.5) / heights.length) * 100
        const isPlayed = barProgress <= progressPercent
        return (
          <span
            key={index}
            className={`rail-waveform-bar${isPlayed ? ' is-played' : ''}`}
            style={{ height: `${height}%` }}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
})
'''

NEW_QUEUE_PANEL = '''const QueueUpNextPanel = memo(function QueueUpNextPanel() {
  const {
    currentTrack,
    currentQueue,
    currentIndex,
    isPlaying,
    isLoading,
    positionSeconds,
    durationSeconds,
    getUpcomingTracks,
    seekTo,
  } = useDesktopPlayback()

  const listScrollRef = useRef<HTMLOListElement>(null)
  const activeTrackId = currentTrack?.id ?? null

  const activeTrack =
    currentIndex >= 0 ? (currentTrack ?? currentQueue[currentIndex] ?? null) : null
  const hasPlayback = Boolean(activeTrack && currentQueue.length > 0 && currentIndex >= 0)
  const upcomingTracks = getUpcomingTracks()
  const progressMax = hasPlayback && durationSeconds > 0 ? durationSeconds : 0
  const progressValue = progressMax > 0 ? Math.min(positionSeconds, progressMax) : 0
  const progressPercent =
    progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0

  useEffect(() => {
    if (!listScrollRef.current) return
    listScrollRef.current.scrollTop = 0
  }, [activeTrackId, currentIndex])

  const displayTitle = activeTrack?.title ?? 'Nothing playing'
  const displayArtist = activeTrack?.artist ?? 'Select a world to begin'

  return (
    <aside
      className="queue-rail now-playing-rail"
      aria-label="Now playing"
      data-playing={isPlaying ? 'true' : 'false'}
      data-loading={isLoading ? 'true' : 'false'}
      data-idle={hasPlayback ? 'false' : 'true'}
    >
      <div className="now-playing-rail-inner">
        <header className="now-playing-rail-header">
          <p className="now-playing-rail-eyebrow">Now Playing</p>
        </header>

        <section className="now-playing-stage" aria-label="Current track">
          <div className="now-playing-art-shell">
            <div className="now-playing-art-glow" aria-hidden="true" />
            <div className="now-playing-art-frame">
              {hasPlayback && activeTrack ? (
                <ArtworkImage
                  src={activeTrack.artwork}
                  alt=""
                  seed={activeTrack.id}
                  priority
                />
              ) : (
                <div className="now-playing-art-placeholder" aria-hidden="true">
                  <MusicNoteIcon className="now-playing-art-placeholder-icon" />
                </div>
              )}
              {isLoading ? (
                <span className="now-playing-art-spinner player-spinner" aria-hidden="true" />
              ) : null}
            </div>
            <button
              type="button"
              className="now-playing-heart"
              aria-label="Favorite"
              title="Favorite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 20.8l-1.1-1C6.4 15.36 3 12.28 3 8.5 3 6 5 4 7.5 4c1.74 0 3.41 1.01 4.5 2.36C13.09 5.01 14.76 4 16.5 4 19 4 21 6 21 8.5c0 3.78-3.4 6.86-7.9 11.3L12 20.8z" />
              </svg>
            </button>
          </div>

          <div className="now-playing-meta">
            <h3 className="now-playing-title">{displayTitle}</h3>
            <p className="now-playing-artist">{displayArtist}</p>
          </div>

          <RailWaveformSeek
            trackId={activeTrack?.id ?? null}
            progressPercent={progressPercent}
            progressMax={progressMax}
            isLoading={isLoading}
            onSeek={seekTo}
          />

          <div className="now-playing-times" aria-hidden="true">
            <span>{formatPlaybackTime(progressValue)}</span>
            <span>{formatPlaybackTime(progressMax)}</span>
          </div>

          <PlaybackTransportControls
            activeTrackId={activeTrack?.id ?? null}
            className="rail-transport-controls"
          />
        </section>

        <section className="up-next-section" aria-label="Up next">
          <h3 className="up-next-label">Up Next</h3>

          {upcomingTracks.length === 0 ? (
            <div className="up-next-empty" role="status">
              <p>Your queue will appear here.</p>
            </div>
          ) : (
            <ol className="up-next-list" ref={listScrollRef}>
              {upcomingTracks.map((track, index) => (
                <li className="up-next-item" key={`${track.id}-${index}`}>
                  <div className="up-next-thumb" aria-hidden="true">
                    <ArtworkImage src={track.artwork} alt="" seed={track.id} />
                  </div>
                  <div className="up-next-copy">
                    <span className="up-next-title">{track.title}</span>
                    <span className="up-next-artist">{track.artist}</span>
                  </div>
                  {track.durationSeconds != null && track.durationSeconds > 0 ? (
                    <span className="up-next-duration">
                      {formatPlaybackTime(track.durationSeconds)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  )
})'''


def patch_app_tsx() -> None:
    app_path = ROOT / "src" / "App.tsx"
    app = app_path.read_text(encoding="utf-8")

    start = app.find("const QueueUpNextPanel = memo(function QueueUpNextPanel() {")
    end = app.find("type ActiveView = ", start)
    if start == -1 or end == -1:
        raise SystemExit("QueueUpNextPanel block bounds not found")

    prefix = ""
    if "function buildRailWaveformHeights" not in app:
        prefix = RAIL_WAVEFORM_COMPONENT + "\n"

    app = app[:start] + prefix + NEW_QUEUE_PANEL + "\n" + app[end:]
    app_path.write_text(app, encoding="utf-8")
    print("App.tsx patched")


def patch_index_css() -> None:
    index_path = ROOT / "src" / "index.css"
    index = index_path.read_text(encoding="utf-8")
    addition = """  --now-playing-art-size: 188px;
  --rail-waveform-height: 44px;
"""
    if "--now-playing-art-size" not in index:
        index = index.replace(
            "  --queue-rail-width: 320px;\n",
            "  --queue-rail-width: 320px;\n" + addition,
        )
        index_path.write_text(index, encoding="utf-8")
        print("index.css patched")


def patch_app_css() -> None:
    css_path = ROOT / "src" / "App.css"
    css = css_path.read_text(encoding="utf-8")

    css = css.replace(
        """.queue-rail {
  flex: 0 0 var(--queue-rail-width);
  width: var(--queue-rail-width);
  margin: clamp(20px, 3vw, 32px) clamp(18px, 2.4vw, 26px) clamp(18px, 2.4vw, 26px) 0;
  padding: 16px;
  align-self: stretch;
  overflow: hidden;
  border-left: 1px solid rgba(255, 255, 255, 0.075);
  background:
    linear-gradient(180deg, rgba(17, 17, 25, 0.78), rgba(8, 8, 13, 0.86)),
    rgba(11, 11, 17, 0.82);
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.025);
}""",
        """.queue-rail {
  flex: 0 0 var(--queue-rail-width);
  width: var(--queue-rail-width);
  margin: clamp(16px, 2.4vw, 24px) clamp(14px, 2vw, 20px) clamp(16px, 2.4vw, 24px) 0;
  padding: clamp(14px, 1.8vw, 18px);
  align-self: stretch;
  overflow: hidden;
  border-left: 1px solid rgba(245, 197, 66, 0.1);
  background: var(--psd-bg-base);
  box-shadow:
    inset 1px 0 0 rgba(255, 186, 61, 0.05),
    -10px 0 32px rgba(0, 0, 0, 0.18);
}""",
    )

    block = """
/* —— Phase 41F: PSD luxury Now Playing rail —— */
.now-playing-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018) 0%, transparent 10%),
    var(--psd-bg-base);
}

.now-playing-rail-inner {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  flex: 1;
}

.now-playing-rail-header {
  padding-bottom: 2px;
}

.now-playing-rail-eyebrow {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent-gold);
}

.now-playing-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.now-playing-art-shell {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.now-playing-art-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(var(--now-playing-art-size) + 36px);
  height: calc(var(--now-playing-art-size) + 36px);
  transform: translate(-50%, -50%);
  border-radius: 28px;
  background: radial-gradient(circle, rgba(255, 186, 61, 0.22), transparent 68%);
  filter: blur(16px);
  pointer-events: none;
}

.now-playing-art-frame {
  position: relative;
  width: var(--now-playing-art-size);
  height: var(--now-playing-art-size);
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(245, 197, 66, 0.28);
  background: #0d0d14;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 22px 48px rgba(0, 0, 0, 0.42),
    0 0 32px rgba(255, 186, 61, 0.12);
}

.now-playing-art-frame .art-frame,
.now-playing-art-frame .card-art-img {
  width: 100%;
  height: 100%;
}

.now-playing-art-frame .card-art-img {
  object-fit: cover;
}

.now-playing-art-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, rgba(23, 23, 36, 0.95), rgba(13, 13, 20, 0.98));
  color: rgba(245, 197, 66, 0.42);
}

.now-playing-art-placeholder-icon {
  width: 42px;
  height: 42px;
}

.now-playing-art-spinner {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 28px;
  height: 28px;
  background: rgba(5, 5, 9, 0.55);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.now-playing-heart {
  position: absolute;
  top: 8px;
  right: calc(50% - var(--now-playing-art-size) / 2 + 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(5, 5, 9, 0.55);
  color: rgba(245, 197, 66, 0.82);
  backdrop-filter: blur(8px);
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}

.now-playing-heart:hover {
  color: var(--accent-gold-bright);
  border-color: rgba(245, 197, 66, 0.28);
  transform: scale(1.04);
}

.now-playing-meta {
  width: 100%;
  min-width: 0;
}

.now-playing-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: rgba(245, 243, 250, 0.94);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing-artist {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(245, 243, 250, 0.52);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-waveform {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: var(--rail-waveform-height);
  padding: 0 2px;
  cursor: pointer;
  touch-action: none;
}

.rail-waveform-bar {
  flex: 1;
  max-width: 5px;
  min-height: 18%;
  border-radius: 999px;
  background: rgba(245, 197, 66, 0.18);
  transition: background var(--transition-fast);
}

.rail-waveform-bar.is-played {
  background: linear-gradient(180deg, var(--accent-gold-bright), var(--accent-gold-deep));
  box-shadow: 0 0 10px rgba(255, 186, 61, 0.22);
}

.now-playing-times {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(245, 243, 250, 0.42);
}

.rail-transport-controls.transport-controls {
  justify-content: center;
  gap: 18px;
  width: 100%;
}

.rail-transport-controls .control-btn--skip {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(245, 243, 250, 0.72);
}

.rail-transport-controls .control-btn--skip:hover:not(:disabled) {
  color: var(--accent-gold-bright);
  border-color: rgba(245, 197, 66, 0.22);
  background: rgba(245, 197, 66, 0.08);
}

.rail-transport-controls .control-btn.play {
  width: 54px;
  height: 54px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(145deg, var(--accent-gold-bright), var(--accent-gold-deep));
  color: #1a1208;
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.34),
    0 0 24px rgba(255, 186, 61, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.rail-transport-controls .control-btn.play:hover:not(:disabled) {
  transform: scale(1.04);
  box-shadow:
    0 16px 32px rgba(0, 0, 0, 0.38),
    0 0 28px rgba(255, 186, 61, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.rail-transport-controls .control-btn.play.is-active {
  background: linear-gradient(145deg, #ffd978, var(--accent-gold));
}

.up-next-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.up-next-label {
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(245, 197, 66, 0.72);
}

.up-next-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  flex: 1;
  min-height: 0;
  max-height: min(42vh, 360px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 186, 61, 0.18) transparent;
}

.up-next-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);
}

.up-next-item:hover {
  background: rgba(245, 197, 66, 0.05);
  border-color: rgba(245, 197, 66, 0.1);
}

.up-next-thumb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24);
}

.up-next-thumb .art-frame,
.up-next-thumb .card-art-img {
  width: 100%;
  height: 100%;
}

.up-next-thumb .card-art-img {
  object-fit: cover;
}

.up-next-copy {
  min-width: 0;
  text-align: left;
}

.up-next-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(245, 243, 250, 0.86);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.up-next-artist {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: rgba(245, 243, 250, 0.44);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.up-next-duration {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: rgba(245, 243, 250, 0.38);
  white-space: nowrap;
}

.up-next-empty {
  padding: 14px 10px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.02);
  text-align: center;
}

.up-next-empty p {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(245, 243, 250, 0.42);
}

.now-playing-rail[data-idle='true'] .rail-waveform-bar.is-played {
  background: rgba(245, 197, 66, 0.12);
  box-shadow: none;
}

.now-playing-rail .queue-rail-header,
.now-playing-rail .queue-rail-context,
.now-playing-rail .queue-rail-position,
.now-playing-rail .queue-rail-insight,
.now-playing-rail .queue-now-card,
.now-playing-rail .queue-upnext-section {
  display: none;
}

.now-playing-rail[data-playing='true'] .now-playing-art-frame {
  border-color: rgba(255, 186, 61, 0.38);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 24px 52px rgba(0, 0, 0, 0.44),
    0 0 40px rgba(255, 186, 61, 0.16);
}

@media (max-width: 1180px) {
  .now-playing-rail {
    display: none;
  }
}

"""

    marker = "/* —— Phase 41D: PSD sidebar + brand —— */"
    if marker not in css:
        marker = "/* —— Phase 41E: PSD Home Hero + Popular Worlds —— */"
    if marker in css:
        css = css.replace(marker, block + marker)
    else:
        css = block + css

    # Neutralize violet queue-rail polish from Phase 34B header area for now-playing
    css = css.replace(
        """.queue-rail[data-playing='true'] .queue-now-card {
  border-color: rgba(168, 85, 247, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 28px rgba(168, 85, 247, 0.1),
    0 12px 28px rgba(0, 0, 0, 0.16);
}""",
        "",
    )

    css_path.write_text(css, encoding="utf-8")
    print("App.css patched")


def main() -> None:
    patch_app_tsx()
    patch_app_css()
    patch_index_css()


if __name__ == "__main__":
    main()
