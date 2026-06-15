#!/usr/bin/env python3
"""Phase 44K fix — build errors after artist patch."""
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
    """function countSongsForAlbum(album: ApiAlbum, indexes: CatalogIndexes) {
  return resolveSongsForAlbum(album, indexes.songsByAlbumId).length
}""",
    """function countSongsForAlbum(album: ApiAlbum, indexes: CatalogIndexes) {
  return resolveSongsForAlbum(
    album,
    indexes.songsByAlbumId,
    indexes.songsByAlbumName,
    indexes.artistNames,
  ).length
}""",
)

app = app.replace(
    '  const { artists, albums, indexes } = useCatalog()',
    '  const { artists, indexes } = useCatalog()',
    1,
)

social_fn = """function PsdSocialIcon({ network }: { network: 'instagram' | 'twitter' | 'youtube' | 'spotify' }) {
  const paths: Record<typeof network, ReactNode> = {
    instagram: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    twitter: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.9 4.5h3.4l-7.5 8.6 8.8 11.4h-6.9l-5.4-7-6.2 7H2.7l8-9.2L2 4.5h7.1l4.8 6.4 5-6.4z" />
      </svg>
    ),
    youtube: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.6 7.2a2.5 2.5 0 00-1.8-1.8C17.9 5 12 5 12 5s-5.9 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8C6.1 19 12 19 12 19s5.9 0 7.8-.4a2.5 2.5 0 001.8-1.8 26 26 0 00.4-4.8 26 26 0 00-.4-4.8zM10 15.5V8.5l5.5 3.5L10 15.5z" />
      </svg>
    ),
    spotify: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 14.3c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.8-9.3-1-.4.1-.7-.2-.8-.5s.2-.7.5-.8c4.1-.9 7.6-.6 10.5 1.1.3.2.4.6.2.9zm1.6-3.2c-.2.4-.7.5-1 .3-2.9-1.7-7.2-2.2-10.6-1.2-.4.1-.9-.2-1-.6-.1-.4.2-.9.6-1 3.9-1.1 8.6-.6 11.9 1.3.4.2.5.7.3 1.1zm.1-3.4c-.3.5-1 .6-1.4.3-3.3-2-8.8-2.2-12-1.2-.5.2-1.1-.1-1.3-.6-.2-.5.1-1.1.6-1.3 3.7-1.1 9.8-.9 13.7 1.5.5.3.6 1 .3 1.4z" />
      </svg>
    ),
  }
  return <span className="psd-artist-social-icon">{paths[network]}</span>
}

"""

if social_fn in app:
    app = app.replace(social_fn, '')

write(APP, app)
print('Phase 44K fix applied')
