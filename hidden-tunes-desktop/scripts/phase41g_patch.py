#!/usr/bin/env python3
"""Phase 41G — Theater + Atmosphere parity."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

THEATER_LYRIC_MEMO = """
  const theaterLyric = useMemo(() => {
    if (cinemaListeningContext.atmosphereLine) return cinemaListeningContext.atmosphereLine
    const description = displayTrack?.description?.trim()
    if (description) return description
    return 'Feel every sound — let the room disappear around you.'
  }, [cinemaListeningContext.atmosphereLine, displayTrack?.description])
"""

OLD_CINEMA_RETURN_START = """  const artBackdropStyle = displayTrack.artwork
    ? { backgroundImage: `url(${displayTrack.artwork})` }
    : undefined

  return (
    <div
      className="cinema-player"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen player"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-scene={cinemaAtmosphere.sceneId}
      data-mood={cinemaAtmosphere.mood}
    >"""

NEW_CINEMA_RETURN_START = """  const artBackdropStyle = displayTrack.artwork
    ? { backgroundImage: `url(${displayTrack.artwork})` }
    : undefined
""" + THEATER_LYRIC_MEMO + """
  return (
    <div
      className="cinema-player cinema-player--theater"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen player"
      data-playing={isPlaying && isActive ? 'true' : 'false'}
      data-loading={isLoading && isActive ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-scene={cinemaAtmosphere.sceneId}
      data-mood={cinemaAtmosphere.mood}
    >"""

OLD_CINEMA_BODY = """      <div
        className="cinema-player-art-backdrop"
        style={artBackdropStyle}
        aria-hidden="true"
      />
      <div className="cinema-player-backdrop" aria-hidden="true" />
      <button
        type="button"
        className="cinema-player-close"
        onClick={onClose}
        aria-label="Exit fullscreen player"
      >
        <span className="cinema-player-close-icon" aria-hidden="true">
          ←
        </span>
        Back
        <span className="cinema-player-kbd-hint cinema-player-kbd-hint--inline">
          Esc
        </span>
      </button>
      <div className="cinema-player-stage">
        <div className="cinema-player-artwork-wrap">
          <span className="cinema-player-aura" aria-hidden="true" />
          <div className="cinema-player-artwork">
            <ArtworkImage
              src={displayTrack.artwork}
              alt=""
              seed={displayTrack.id}
              priority
            />
          </div>
        </div>
        <div className="cinema-player-meta">
          <p className="cinema-player-eyebrow">{cinemaListeningContext.eyebrow}</p>
          <h1 className="cinema-player-title">{displayTrack.title}</h1>
          <p className="cinema-player-byline">
            <span>{displayTrack.artist}</span>
            {displayTrack.album ? (
              <>
                <span className="cinema-player-sep" aria-hidden="true">
                  ·
                </span>
                <span>{displayTrack.album}</span>
              </>
            ) : null}
          </p>
          {showQueuePosition
            || cinemaListeningContext.atmosphereLine
            || cinemaListeningContext.contextPills.length > 0
            || cinemaListeningContext.insightLine ? (
            <div className="cinema-player-context">
              {showQueuePosition ? (
                <span className="cinema-player-queue-pill">
                  {queueLabel} · Track {currentIndex + 1} of {currentQueue.length}
                </span>
              ) : null}
              <ListeningContextStrip
                lines={cinemaListeningContext}
                className="listening-context-strip listening-context-strip--cinema"
              />
            </div>
          ) : null}
          <PlaybackTransportControls
            activeTrackId={displayTrack.id}
            className="cinema-player-controls"
          />
          <div
            className="cinema-player-progress progress-wrap"
            role="group"
            aria-label="Playback progress"
          >
            <span className="progress-time">
              {formatPlaybackTime(progressValue)}
            </span>
            <div
              ref={progressTrackRef}
              className={
                'progress-track cinema-player-progress-track'
                + (progressMax > 0 && isActive ? ' progress-track--interactive' : '')
              }
              role="slider"
              aria-label="Seek position"
              aria-valuemin={0}
              aria-valuemax={Math.round(progressMax)}
              aria-valuenow={Math.round(progressValue)}
              aria-disabled={!isActive || progressMax <= 0 || isLoading}
              onClick={handleSeekClick}
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerUp}
            >
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="progress-time">
              {progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}
            </span>
          </div>
        </div>
      </div>"""

NEW_CINEMA_BODY = """      <div
        className="cinema-player-art-backdrop cinema-theater-photo"
        style={artBackdropStyle}
        aria-hidden="true"
      />
      <div className="cinema-player-backdrop cinema-theater-backdrop" aria-hidden="true" />
      <div className="cinema-theater-veil" aria-hidden="true" />
      <button
        type="button"
        className="cinema-player-close cinema-theater-close"
        onClick={onClose}
        aria-label="Exit fullscreen player"
      >
        <span className="cinema-player-close-icon" aria-hidden="true">
          ←
        </span>
        Back
        <span className="cinema-player-kbd-hint cinema-player-kbd-hint--inline">
          Esc
        </span>
      </button>
      <div className="cinema-theater-stage">
        <div className="cinema-theater-lyrics-module" aria-live="polite">
          <p className="cinema-theater-eyebrow">Now listening</p>
          <p className="cinema-theater-lyric">{theaterLyric}</p>
        </div>

        <div className="cinema-theater-credit">
          <h1 className="cinema-theater-title">{displayTrack.title}</h1>
          <p className="cinema-theater-artist">
            {displayTrack.artist}
            {displayTrack.album ? (
              <span className="cinema-theater-album"> · {displayTrack.album}</span>
            ) : null}
          </p>
        </div>

        <span className="cinema-theater-quality-badge" aria-hidden="true">
          Hi-Res
        </span>

        <PlaybackTransportControls
          activeTrackId={displayTrack.id}
          className="cinema-theater-controls"
        />

        <div
          className="cinema-theater-progress progress-wrap"
          role="group"
          aria-label="Playback progress"
        >
          <span className="progress-time">
            {formatPlaybackTime(progressValue)}
          </span>
          <div
            ref={progressTrackRef}
            className={
              'progress-track cinema-theater-progress-track'
              + (progressMax > 0 && isActive ? ' progress-track--interactive' : '')
            }
            role="slider"
            aria-label="Seek position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progressMax)}
            aria-valuenow={Math.round(progressValue)}
            aria-disabled={!isActive || progressMax <= 0 || isLoading}
            onClick={handleSeekClick}
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerUp}
          >
            <div
              className="progress-fill cinema-theater-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="progress-time">
            {progressMax > 0 ? formatPlaybackTime(progressMax) : '—'}
          </span>
        </div>
      </div>"""


def patch_app_tsx() -> None:
    app_path = ROOT / "src" / "App.tsx"
    app = app_path.read_text(encoding="utf-8")

    if "cinema-player--theater" not in app:
        if OLD_CINEMA_RETURN_START not in app:
            raise SystemExit("Cinema return start not found")
        app = app.replace(OLD_CINEMA_RETURN_START, NEW_CINEMA_RETURN_START)

        if OLD_CINEMA_BODY not in app:
            raise SystemExit("Cinema body not found")
        app = app.replace(OLD_CINEMA_BODY, NEW_CINEMA_BODY)

        app = app.replace(
            'className="cinema-player cinema-player--empty"',
            'className="cinema-player cinema-player--theater cinema-player--empty"',
        )

    app_path.write_text(app, encoding="utf-8")
    print("App.tsx patched")


def cyan_audit_css(css: str) -> str:
    replacements = [
        ("rgba(56, 189, 248", "rgba(255, 186, 61"),
        ("rgba(14, 116, 144", "rgba(166, 58, 136"),
        ("rgba(14, 165, 233", "rgba(109, 74, 255"),
        ("#38bdf8", "#ffba3d"),
    ]
    for old, new in replacements:
        css = css.replace(old, new)
    return css


def patch_app_css() -> None:
    css_path = ROOT / "src" / "App.css"
    css = css_path.read_text(encoding="utf-8")
    css = cyan_audit_css(css)

    block = """
/* —— Phase 41G: PSD theater + global atmosphere —— */
.cinema-player--theater {
  align-items: stretch;
  justify-content: center;
  padding: 0;
  background: #050509;
}

.cinema-theater-photo {
  opacity: 0.52;
  filter: blur(0px) saturate(1.08);
  transform: scale(1.06);
}

.cinema-player[data-playing='true'] .cinema-theater-photo {
  opacity: 0.58;
}

.cinema-theater-backdrop {
  background:
    radial-gradient(ellipse 90% 70% at 50% 42%, rgba(109, 74, 255, 0.2), transparent 62%),
    radial-gradient(ellipse 70% 55% at 18% 78%, rgba(166, 58, 136, 0.16), transparent 58%),
    radial-gradient(ellipse 120% 100% at 50% 100%, rgba(0, 0, 0, 0.62), transparent 54%),
    linear-gradient(180deg, rgba(5, 5, 9, 0.72), rgba(5, 5, 9, 0.94)) !important;
  backdrop-filter: blur(10px);
}

.cinema-theater-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(ellipse 80% 58% at 50% 46%, rgba(109, 74, 255, 0.12), transparent 68%),
    radial-gradient(ellipse 55% 42% at 72% 62%, rgba(255, 186, 61, 0.08), transparent 62%),
    linear-gradient(180deg, rgba(5, 5, 9, 0.35) 0%, rgba(5, 5, 9, 0.82) 72%, rgba(5, 5, 9, 0.94) 100%);
}

.cinema-theater-close {
  z-index: 4;
  border-color: rgba(245, 197, 66, 0.16);
  color: rgba(245, 243, 250, 0.72);
}

.cinema-theater-close:hover {
  border-color: rgba(255, 186, 61, 0.28);
  color: rgba(255, 186, 61, 0.92);
}

.cinema-theater-stage {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(980px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(72px, 10vh, 110px) clamp(28px, 5vw, 64px) clamp(48px, 8vh, 84px);
  text-align: center;
  gap: clamp(22px, 3.6vw, 36px);
}

.cinema-theater-lyrics-module {
  max-width: min(720px, 92vw);
  padding: clamp(24px, 4vw, 40px) clamp(20px, 3vw, 32px);
  border-radius: calc(var(--radius-xl) + 6px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    linear-gradient(180deg, rgba(23, 23, 36, 0.42), rgba(13, 13, 20, 0.58));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 24px 60px rgba(0, 0, 0, 0.34),
    0 0 48px rgba(109, 74, 255, 0.08);
  backdrop-filter: blur(14px);
}

.cinema-theater-eyebrow {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent-gold);
}

.cinema-theater-lyric {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.65rem, 4.2vw, 2.75rem);
  font-weight: 500;
  line-height: 1.28;
  letter-spacing: -0.02em;
  color: rgba(250, 248, 255, 0.94);
  text-wrap: balance;
  text-shadow: 0 8px 32px rgba(0, 0, 0, 0.42);
}

.cinema-theater-credit {
  max-width: min(640px, 90vw);
}

.cinema-theater-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: clamp(1.1rem, 2vw, 1.35rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: rgba(245, 243, 250, 0.82);
}

.cinema-theater-artist {
  margin: 8px 0 0;
  font-size: 14px;
  color: rgba(245, 243, 250, 0.48);
}

.cinema-theater-album {
  color: rgba(245, 243, 250, 0.36);
}

.cinema-theater-quality-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(245, 197, 66, 0.3);
  background: rgba(245, 197, 66, 0.1);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-gold-bright);
  box-shadow: 0 0 20px rgba(255, 186, 61, 0.12);
}

.cinema-theater-controls.transport-controls {
  gap: 20px;
}

.cinema-theater-controls .control-btn--skip {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(245, 243, 250, 0.72);
}

.cinema-theater-controls .control-btn.play {
  width: 58px;
  height: 58px;
  border-radius: 999px;
  background: linear-gradient(145deg, var(--accent-gold-bright), var(--accent-gold-deep));
  color: #1a1208;
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.38),
    0 0 28px rgba(255, 186, 61, 0.22);
}

.cinema-theater-progress {
  width: min(520px, 88vw);
  gap: 12px;
}

.cinema-theater-progress-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.cinema-theater-progress-fill,
.cinema-theater-progress .progress-fill {
  background: linear-gradient(90deg, var(--accent-gold-deep), var(--accent-gold-bright));
  box-shadow: 0 0 14px rgba(255, 186, 61, 0.28);
}

.cinema-theater-progress .progress-time {
  color: rgba(245, 243, 250, 0.42);
  font-size: 11px;
}

.cinema-player--theater .cinema-player-artwork-wrap,
.cinema-player--theater .cinema-player-meta,
.cinema-player--theater .cinema-player-context {
  display: none;
}

.cinema-player--empty .cinema-theater-veil {
  background:
    radial-gradient(ellipse 70% 50% at 50% 40%, rgba(109, 74, 255, 0.14), transparent 62%),
    linear-gradient(180deg, rgba(5, 5, 9, 0.88), rgba(5, 5, 9, 0.98));
}

.cinema-player-empty-glow {
  background:
    radial-gradient(circle, rgba(255, 186, 61, 0.18), transparent 68%),
    radial-gradient(circle, rgba(109, 74, 255, 0.14), transparent 72%) !important;
}

/* Global PSD surfaces */
.discovery-card,
.discovery-card--api,
.page-view[data-page="home"] .discovery-section,
.detail-panel,
.catalog-toolbar,
.mood-rooms-stage,
.listening-stage {
  border-color: rgba(245, 197, 66, 0.08);
}

.discovery-card,
.discovery-card--api {
  background: linear-gradient(168deg, rgba(23, 23, 36, 0.96), rgba(13, 13, 20, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(255, 186, 61, 0.04),
    0 8px 24px rgba(0, 0, 0, 0.24);
}

.audio-quality-option.active {
  color: var(--accent-gold-bright);
  background: linear-gradient(135deg, rgba(255, 186, 61, 0.16), rgba(109, 74, 255, 0.1));
  box-shadow: inset 0 0 0 1px rgba(245, 197, 66, 0.24);
}

.audio-quality-select:focus-visible {
  outline: 1px solid rgba(245, 197, 66, 0.42);
}

.player-quality .audio-quality-select {
  border-color: rgba(245, 197, 66, 0.18);
  color: rgba(245, 197, 66, 0.78);
}

.app-shell {
  background:
    radial-gradient(ellipse 72% 48% at 54% -10%, rgba(109, 74, 255, 0.085), transparent 64%),
    radial-gradient(ellipse 52% 42% at 100% 32%, rgba(166, 58, 136, 0.06), transparent 62%),
    radial-gradient(ellipse 48% 38% at 8% 88%, rgba(255, 186, 61, 0.04), transparent 58%),
    linear-gradient(180deg, var(--psd-bg-base) 0%, var(--psd-bg-deep) 100%) !important;
}

.main-scroll::after {
  background: linear-gradient(90deg, transparent, rgba(255, 186, 61, 0.06), transparent);
}

@media (max-width: 900px) {
  .cinema-theater-stage {
    padding-top: 88px;
    padding-bottom: 40px;
  }

  .cinema-theater-lyric {
    font-size: clamp(1.35rem, 6vw, 2rem);
  }
}

"""

    marker = "/* —— Phase 41F: PSD luxury Now Playing rail —— */"
    if marker not in css:
        marker = "/* —— Phase 41D: PSD sidebar + brand —— */"
    if marker in css:
        css = css.replace(marker, block + marker)
    else:
        css = block + css

    css_path.write_text(css, encoding="utf-8")
    print("App.css patched")


def patch_index_css() -> None:
    index_path = ROOT / "src" / "index.css"
    index = index_path.read_text(encoding="utf-8")

    additions = """  --surface-elevated: #171724;
  --surface-edge-gold: rgba(245, 197, 66, 0.1);
  --atmosphere-purple: rgba(109, 74, 255, 0.12);
  --atmosphere-magenta: rgba(166, 58, 136, 0.1);
  --atmosphere-gold: rgba(255, 186, 61, 0.08);
"""
    if "--surface-elevated:" not in index:
        index = index.replace(
            "  --psd-warm: #bf7f72;\n\n",
            "  --psd-warm: #bf7f72;\n\n" + additions,
        )

    index = cyan_audit_css(index)
    index_path.write_text(index, encoding="utf-8")
    print("index.css patched")


def main() -> None:
    patch_app_tsx()
    patch_app_css()
    patch_index_css()


if __name__ == "__main__":
    main()
