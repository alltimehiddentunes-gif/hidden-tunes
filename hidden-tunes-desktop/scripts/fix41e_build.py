#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")

app = app.replace(
    """const BRAND_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`
""",
    "",
)

old_logo = """function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string
  decorative?: boolean
}) {
  return (
    <img
      className={className}
      src={BRAND_LOGO_URL}
      alt={decorative ? '' : 'Hidden Tunes'}
      aria-hidden={decorative ? true : undefined}
      decoding="async"
      draggable={false}
    />
  )
}


"""

if old_logo in app:
    app = app.replace(old_logo, "")

app = app.replace(
    """  onOpenMood,
  onNavigate,
  onOpenSongDetail,
  onOpenCinema,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onNavigate: (page: PageId) => void
  onOpenSongDetail: (song: ApiSong) => void
  onOpenCinema?: () => void
}) {""",
    """  onOpenMood,
  onOpenCinema,
}: {
  activeView: ActiveView
  selectedSong: ApiSong | null
  selectedAlbum: ApiAlbum | null
  selectedArtist: ApiArtist | null
  selectedMood: MoodRoom | null
  desktopSelectedTrack: ApiSong | null
  onBack: () => void
  activePage: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onOpenCinema?: () => void
}) {""",
)

app = app.replace(
    """      onOpenMood={onOpenMood}
      onNavigate={onNavigate}
      onOpenSongDetail={onOpenSongDetail}
    />""",
    """      onOpenMood={onOpenMood}
    />""",
)

app = app.replace(
    """  onOpenMood,
  onNavigate,
  onOpenSongDetail,
}: {
  page: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
  onNavigate: (page: PageId) => void
  onOpenSongDetail: (song: ApiSong) => void
}) {""",
    """  onOpenMood,
}: {
  page: PageId
  onOpenSong: QueueSongHandler
  onOpenAlbum: (album: ApiAlbum) => void
  onOpenArtist: (artist: ApiArtist) => void
  onOpenMood: (mood: MoodRoom) => void
}) {""",
)

app = app.replace(
    """                  onOpenMood={openMood}
                  onNavigate={navigatePage}
                  onOpenSongDetail={openSong}
                  onOpenCinema={() => setCinemaOpen(true)}""",
    """                  onOpenMood={openMood}
                  onOpenCinema={() => setCinemaOpen(true)}""",
)

(ROOT / "src" / "App.tsx").write_text(app, encoding="utf-8")
print("fixed App.tsx")
