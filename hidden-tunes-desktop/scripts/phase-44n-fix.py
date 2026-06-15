#!/usr/bin/env python3
"""Phase 44N fix — unused rail constants + quality label."""
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

app = app.replace(
    """function resolveRailQualityLabel(
  song: ApiSong | null | undefined,
  qualityMode: AudioQualityMode,
) {
  if (!song) return null
  if (song.audioVersions?.lossless?.url || song.losslessUrl) return 'FLAC'
  if (song.audioVersions?.highQuality?.url || song.highQualityUrl) return 'HQ'
  return AUDIO_QUALITY_MODE_LABELS[qualityMode]
}

""",
    '',
)

app = app.replace(
    """const PSD_PLAYLIST_UP_NEXT_ROWS = PSD_PLAYLIST_TRACK_ROWS.slice(1, 5)

const PSD_PLAYLIST_STATS_ROWS = [
  { value: '50', label: 'Songs' },
  { value: '3h 12m', label: 'Duration' },
  { value: '12', label: 'Albums' },
] as const
const PSD_PLAYLIST_STATS_UPDATED = 'May 12, 2024'

""",
    '',
)

app = app.replace(
    """const PSD_PLAYLIST_TRACK_ROWS = [
  { key: 'pt1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', duration: '3:56', active: true },
  { key: 'pt2', title: 'Afro Sunset', artist: 'Wills Afrobeats', duration: '3:21' },
  { key: 'pt3', title: 'Love Vibes', artist: 'Wills Afrobeats', duration: '3:44' },
  { key: 'pt4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', duration: '4:12' },
  { key: 'pt5', title: 'Night Drive', artist: 'Wills Afrobeats', duration: '4:01' },
  { key: 'pt6', title: 'Healing Slowly', artist: 'Wills Afrobeats', duration: '3:48' },
  { key: 'pt7', title: 'Jazz Café', artist: 'Wills Afrobeats', duration: '3:36' },
  { key: 'pt8', title: 'Deep Focus', artist: 'Wills Afrobeats', duration: '4:20' },
] as const

""",
    '',
)

app = app.replace(
    """const PSD_ALBUMS_RAIL_TITLE = 'Falling Slowly'
const PSD_ALBUMS_RAIL_ARTIST = 'Wills Afrobeats'

const PSD_ALBUMS_UP_NEXT_ROWS = [
  { key: 'au1', title: 'Midnight Reflection', artist: 'Wills Afrobeats', duration: '3:56' },
  { key: 'au2', title: 'Afro Sunset', artist: 'Wills Afrobeats', duration: '3:21' },
  { key: 'au3', title: 'Love Vibes', artist: 'Wills Afrobeats', duration: '3:44' },
  { key: 'au4', title: 'Rain & Reflection', artist: 'Wills Afrobeats', duration: '4:12' },
] as const

const PSD_ALBUM_STATS_ROWS = [
  { value: '24', label: 'Albums' },
  { value: '196', label: 'Songs' },
  { value: '18h 42m', label: 'Total Time' },
] as const
const PSD_ALBUM_STATS_UPDATED = 'May 12, 2024'

""",
    '',
)

app = app.replace(
    """const PSD_RAIL_QUEUE_ROWS = [
  { key: 'rq1', title: 'Afro Sunset', artist: 'Wills Afrobeats' },
  { key: 'rq2', title: 'Love Vibes', artist: 'Wills Afrobeats' },
  { key: 'rq3', title: 'Rain & Reflection', artist: 'Wills Afrobeats' },
  { key: 'rq4', title: 'Jazz Café', artist: 'Wills Afrobeats' },
] as const

""",
    '',
)

if 'resolveRailQualityLabel' in app:
    app = app.replace(
        '  const railQualityLabel = resolveRailQualityLabel(activeTrack, audioQualityMode)',
        """  const railQualityLabel = hasPlayback
    ? (
      resolveSearchRowQualityBadge(activeTrack) !== 'SONG'
        ? resolveSearchRowQualityBadge(activeTrack)
        : AUDIO_QUALITY_MODE_LABELS[audioQualityMode]
    )
    : null""",
    )

write(APP, app)
print('Phase 44N fix applied')
