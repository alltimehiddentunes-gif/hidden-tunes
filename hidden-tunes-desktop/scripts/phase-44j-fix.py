#!/usr/bin/env python3
"""Phase 44J fix — remove unused PSD playlist header constants."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/App.tsx'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


app = read(APP)

old = """const PSD_PLAYLIST_TITLE = 'Night Drive'
const PSD_PLAYLIST_DESCRIPTION = 'Late nights, open roads and the perfect soundtrack.'
const PSD_PLAYLIST_OWNER = 'Hidden Tunes'
const PSD_PLAYLIST_META = '50 songs • 3h 12m'
const PSD_PLAYLIST_FOOTER_META = '50 songs, 3h 12m'
const PSD_PLAYLIST_TRACK_ROWS = ["""

new = """const PSD_PLAYLIST_TRACK_ROWS = ["""

if old not in app:
    raise SystemExit('PSD playlist header constants block not found')
app = app.replace(old, new)

write(APP, app)
print('Phase 44J fix applied')
