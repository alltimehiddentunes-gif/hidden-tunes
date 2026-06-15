#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
old = """                    <span className="world-card-veil" aria-hidden="true" />
                  </div>
                  <div className="world-card-copy">
                    <h3>{presentation.title}</h3>
                    <p>{presentation.subtitle}</p>
                  </div>
                </button>
                <button
                  type="button"
                  className="world-play-btn"
                  aria-label={`Play ${presentation.title}`}
                  onClick={() => onPlayWorld(world)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>"""
new = """                    <span className="world-card-veil" aria-hidden="true" />
                    <button
                      type="button"
                      className="world-play-btn"
                      aria-label={`Play ${presentation.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPlayWorld(world)
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="world-card-copy">
                    <h3>{presentation.title}</h3>
                    <p>{presentation.subtitle}</p>
                  </div>
                </button>"""
if old not in app:
    raise SystemExit("world play block not found")
(ROOT / "src" / "App.tsx").write_text(app.replace(old, new), encoding="utf-8")

css = (ROOT / "src" / "App.css").read_text(encoding="utf-8")
css = css.replace(
    """.world-play-btn {
  position: absolute;
  right: 10px;
  bottom: calc(12px + 44px);
  z-index: 2;""",
    """.world-play-btn {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 3;""",
)
(ROOT / "src" / "App.css").write_text(css, encoding="utf-8")
print("play btn fixed")
