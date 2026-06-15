#!/usr/bin/env python3
"""Phase 44N — Now Playing sidebar PSD reconstruction + wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'
CSS = ROOT / 'src/App.css'
FRAGMENT = ROOT / 'scripts/phase-44n-queue-panel.fragment.tsx'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)
fragment = read(FRAGMENT)

start = app.index('const QueueUpNextPanel = memo(function QueueUpNextPanel(')
end = app.index('\ntype ActiveView = ', start)

app = app[:start] + fragment + app[end:]

transport_old = """const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
}: {
  activeTrackId: string | null
}) {"""

transport_new = """const FullPlayerTransportControls = memo(function FullPlayerTransportControls({
  activeTrackId,
  hideDecorativeControls = false,
}: {
  activeTrackId: string | null
  hideDecorativeControls?: boolean
}) {"""

if transport_old not in app:
    raise SystemExit('FullPlayerTransportControls signature not found')
app = app.replace(transport_old, transport_new)

shuffle_old = """      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--shuffle"
        aria-label="Shuffle"
        title="Shuffle"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button"""

shuffle_new = """      {!hideDecorativeControls ? (
        <button
          type="button"
          className="psd-player-transport-btn psd-player-transport-btn--shuffle"
          aria-label="Shuffle"
          title="Shuffle"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
      ) : null}
      <button"""

if shuffle_old not in app:
    raise SystemExit('Shuffle transport button block not found')
app = app.replace(shuffle_old, shuffle_new, 1)

repeat_old = """      <button
        type="button"
        className="psd-player-transport-btn psd-player-transport-btn--repeat"
        aria-label="Repeat"
        title="Repeat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>
    </div>
  )
})

const PlayerBar = memo(function PlayerBar({"""

repeat_new = """      {!hideDecorativeControls ? (
        <button
          type="button"
          className="psd-player-transport-btn psd-player-transport-btn--repeat"
          aria-label="Repeat"
          title="Repeat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 014-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 01-4 4H3" />
          </svg>
        </button>
      ) : null}
    </div>
  )
})

const PlayerBar = memo(function PlayerBar({"""

if repeat_old not in app:
    raise SystemExit('Repeat transport button block not found')
app = app.replace(repeat_old, repeat_new, 1)

write(APP, app)

css = read(CSS)
css_block = """
/* —— Phase 44N: Now Playing sidebar PSD parity + wiring —— */
.rail-queue-empty {
  margin-top: 4px;
}

.now-playing-rail[data-idle='true'] .rail-psd-track-title,
.now-playing-rail[data-idle='true'] .albums-rail-track-title {
  color: rgba(245, 243, 250, 0.72);
}

.rail-psd-track-album,
.albums-rail-track-album {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--psd-metadata);
}

.rail-psd-queue-button,
.albums-rail-up-next-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.rail-psd-queue-button:hover,
.albums-rail-up-next-button:hover {
  background: rgba(255, 255, 255, 0.04);
}

.rail-psd-queue-duration,
.albums-rail-up-next-duration {
  font-size: 12px;
  color: var(--psd-metadata);
}

.rail-psd-queue-clear,
.albums-rail-up-next-clear {
  cursor: pointer;
}

.rail-psd-queue-clear:disabled,
.albums-rail-up-next-clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

"""
if 'Phase 44N: Now Playing sidebar' not in css:
    marker_css = '/* —— Phase 44M:'
    if marker_css in css:
        css = css.replace(marker_css, css_block + marker_css)
    else:
        css = css.replace('.now-playing-rail {', css_block + '.now-playing-rail {', 1)
    write(CSS, css)

print('Phase 44N sidebar patch applied')
