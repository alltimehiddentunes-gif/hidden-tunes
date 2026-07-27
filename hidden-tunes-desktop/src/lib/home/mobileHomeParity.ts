/**
 * Mobile Home (`app/music-feed.tsx`) parity builders for desktop.
 * Labels and matching logic mirror HiddenTunes-CLEAN-1.0.142.
 */
import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import { sortSongsList } from '../api'
import type { CatalogIndexes } from '../catalogIndexes'
import { formatGenreLabel } from './musicHomeSections'
import type { MusicHistoryEntry } from './musicProgressStorage'

export const HOME_SECTION_PREVIEW_LIMIT = 8
export const HOME_CATALOG_PAGE_SIZE = 31

export const HOME_UI = {
  searchLauncher: 'Search Hidden Tunes...',
  loadMore: 'Load More',
  emptyTitle: 'Nothing here yet',
  emptyCatalogMessage:
    "Your listening room is getting ready. Pull down to refresh when you're online.",
  refreshCatalog: 'Refresh catalog',
  listening: {
    nowPlaying: 'Now Playing',
    nothingPlaying: 'Nothing playing yet',
    tapToStart: 'Tap a song to start listening',
  },
  hero: {
    nowPlaying: 'NOW PLAYING',
    featured: 'FEATURED',
    pick: 'PICK',
    recentlyPlayed: 'RECENTLY PLAYED',
    nowPlayingFallback: 'Now playing',
    editorPick: 'Editor pick',
    genreSpotlight: 'Genre spotlight',
    inRotation: 'In rotation',
    play: 'PLAY',
    openPlayer: 'OPEN PLAYER',
  },
  signals: {
    curatedRooms: 'Curated rooms',
  },
  sections: {
    forYourMood: 'FOR YOUR MOOD',
    moodRooms: 'Mood Rooms',
    new: 'NEW',
    recentlyAdded: 'Recently Added',
    play: 'Play',
    listener: 'LISTENER',
    becauseYouListened: 'Because You Listened',
    next: 'NEXT',
    smartMusicQueue: 'Smart Music Queue',
    creators: 'CREATORS',
    creatorsInOrbit: 'Creators In Your Orbit',
    collections: 'COLLECTIONS',
    albumsWorthStaying: 'Albums Worth Staying With',
    rooms: 'ROOMS',
    openRooms: 'Open Rooms',
    genres: 'GENRES',
    moodGenreSpotlights: 'Genre Spotlights',
    madeForYou: 'Made for you',
    fullCatalog: 'FULL CATALOG',
    allSongs: 'All Songs',
    seeAll: 'See all',
  },
  recentlyAddedEmpty: 'Your newest picks will appear here after the catalog loads.',
  shortcuts: {
    radio: 'Radio',
    podcasts: 'Podcasts',
    audiobooks: 'Audiobooks',
    more: 'More',
  },
  emotionalWorlds: {
    title: 'Emotional Worlds',
    subtitle: 'Hidden Tunes rooms shaped by mood and feeling',
  },
  rooms: {
    healing: 'Healing',
    lateNight: 'Late Night',
    calm: 'Calm',
    energy: 'Energy',
    calmInstrumentals: 'Calm Instrumentals',
    nightDrive: 'Night Drive',
    worshipFocus: 'Worship Focus',
    healingRoom: 'Healing Room',
  },
} as const

export const EMOTIONAL_WORLD_CHIPS = [
  { id: 'heartbreak', title: 'Heartbreak', query: 'heartbreak emotional music' },
  { id: 'healing', title: 'Healing', query: 'healing calm music' },
  { id: 'late-night', title: 'Late Night', query: 'late night mood music' },
  { id: 'focus', title: 'Focus', query: 'focus concentration music' },
  { id: 'party-energy', title: 'Party Energy', query: 'party energy dance music' },
  { id: 'romantic', title: 'Romantic', query: 'romantic love songs' },
  { id: 'nostalgic', title: 'Nostalgic', query: 'nostalgic throwback music' },
  { id: 'calm', title: 'Calm', query: 'calm relaxing music' },
  { id: 'deep-feelings', title: 'Deep Feelings', query: 'deep emotional music' },
  { id: 'hidden-gems', title: 'Hidden Gems', query: 'hidden gems underrated songs' },
] as const

export type HomeCatalogGroup = {
  id: string
  title: string
  subtitle: string
  artwork: string | null
  songs: ApiSong[]
}

export type HomeHeroCard = {
  key: string
  label: string
  title: string
  subtitle: string
  song: ApiSong
  isCurrent?: boolean
}

function songText(song: ApiSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function uniqSongs(songs: ApiSong[]) {
  const seen = new Set<string>()
  return songs.filter((song) => {
    const id = String(song.id || `${song.artist}-${song.title}`)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function pickBestArtwork(songs: ApiSong[]) {
  return songs.find((song) => Boolean(song.artwork))?.artwork ?? null
}

function buildMatchedGroup(
  id: string,
  title: string,
  terms: string[],
  songs: ApiSong[],
): HomeCatalogGroup | null {
  const matches = songs.filter((song) => {
    const text = songText(song)
    return terms.some((term) => text.includes(term.toLowerCase()))
  })
  const groupSongs = uniqSongs(matches).slice(0, 18)
  if (!groupSongs.length) return null
  return {
    id,
    title,
    subtitle: `${groupSongs.length} song${groupSongs.length === 1 ? '' : 's'}`,
    artwork: pickBestArtwork(groupSongs) ?? groupSongs[0]?.artwork ?? null,
    songs: groupSongs,
  }
}

export function buildMoodRooms(songs: ApiSong[]): HomeCatalogGroup[] {
  return [
    buildMatchedGroup('healing', HOME_UI.rooms.healing, ['healing', 'heal', 'restore', 'worship', 'prayer', 'peace'], songs),
    buildMatchedGroup('late-night', HOME_UI.rooms.lateNight, ['late', 'night', 'midnight', 'after dark', 'drive'], songs),
    buildMatchedGroup('calm', HOME_UI.rooms.calm, ['calm', 'soft', 'peace', 'ambient', 'quiet', 'instrumental'], songs),
    buildMatchedGroup('energy', HOME_UI.rooms.energy, ['energy', 'dance', 'party', 'afro', 'beat', 'upbeat'], songs),
  ].filter((room): room is HomeCatalogGroup => Boolean(room))
}

export function buildOpenRooms(songs: ApiSong[]): HomeCatalogGroup[] {
  return [
    buildMatchedGroup('calm-instrumentals', HOME_UI.rooms.calmInstrumentals, ['instrumental', 'calm', 'ambient'], songs),
    buildMatchedGroup('night-drive', HOME_UI.rooms.nightDrive, ['night', 'drive', 'late', 'midnight'], songs),
    buildMatchedGroup('worship-focus', HOME_UI.rooms.worshipFocus, ['worship', 'gospel', 'prayer', 'jesus', 'praise'], songs),
    buildMatchedGroup('healing-room', HOME_UI.rooms.healingRoom, ['healing', 'heal', 'restore', 'peace'], songs),
  ].filter((room): room is HomeCatalogGroup => Boolean(room))
}

export function buildRecentlyAddedSongs(songs: ApiSong[], limit = HOME_SECTION_PREVIEW_LIMIT) {
  return sortSongsList(songs, 'latest').slice(0, limit)
}

export function buildBecauseYouListenedSongs(
  songs: ApiSong[],
  history: MusicHistoryEntry[],
  songsById: Map<string, ApiSong>,
  limit = HOME_SECTION_PREVIEW_LIMIT,
) {
  const recentArtists = new Set<string>()
  for (const entry of history.slice(0, 24)) {
    const song = songsById.get(entry.songId)
    const artist = song?.artist?.trim().toLowerCase()
    if (artist) recentArtists.add(artist)
  }

  const candidates = songs.filter((song) => recentArtists.has(song.artist.trim().toLowerCase()))
  return uniqSongs(candidates.length ? candidates : songs.slice(8, 24)).slice(0, limit)
}

export function buildSmartMusicQueueSongs(
  activeQueue: ApiSong[],
  songs: ApiSong[],
  limit = HOME_SECTION_PREVIEW_LIMIT,
) {
  return uniqSongs((activeQueue.length ? activeQueue : songs.slice(12, 30)).filter(Boolean)).slice(
    0,
    limit,
  )
}

export function buildCreatorsInOrbit(
  artists: ApiArtist[],
  limit = HOME_SECTION_PREVIEW_LIMIT,
) {
  return artists.slice(0, limit)
}

export function buildAlbumsWorthStayingWith(
  albums: ApiAlbum[],
  limit = HOME_SECTION_PREVIEW_LIMIT,
) {
  return albums.slice(0, limit)
}

export function songsReadyLabel(count: number) {
  return `${count.toLocaleString()}+ songs ready`
}

export function buildHomeHeroCards(
  songs: ApiSong[],
  currentSong: ApiSong | null,
  recentHead: ApiSong | null,
): HomeHeroCard[] {
  const featuredSongs = songs.slice(0, 8)
  const primary = featuredSongs[0] || songs[0]
  const pick = featuredSongs[1] || featuredSongs[0]
  const genreSong = featuredSongs.find((song) => song.genre) || songs.find((song) => song.genre)
  const cards: HomeHeroCard[] = []

  if (currentSong && primary) {
    const match =
      songs.find((song) => String(song.id) === String(currentSong.id)) || primary
    cards.push({
      key: `current-${match.id}`,
      label: HOME_UI.hero.nowPlaying,
      title: currentSong.title || match.title || HOME_UI.hero.nowPlayingFallback,
      subtitle: currentSong.artist || match.artist || 'Hidden Tunes',
      song: match,
      isCurrent: true,
    })
  }

  if (primary) {
    cards.push({
      key: `featured-${primary.id}`,
      label: HOME_UI.hero.featured,
      title: primary.title,
      subtitle: primary.artist || 'Hidden Tunes',
      song: primary,
    })
  }

  if (pick && String(pick.id) !== String(primary?.id)) {
    cards.push({
      key: `pick-${pick.id}`,
      label: HOME_UI.hero.pick,
      title: pick.title,
      subtitle: pick.artist || HOME_UI.hero.editorPick,
      song: pick,
    })
  }

  if (genreSong) {
    cards.push({
      key: `genre-${genreSong.id}`,
      label: String(genreSong.genre || 'GENRE').toUpperCase(),
      title: genreSong.title,
      subtitle: genreSong.artist || HOME_UI.hero.genreSpotlight,
      song: genreSong,
    })
  }

  if (recentHead) {
    const recentSong =
      songs.find((song) => String(song.id) === String(recentHead.id)) || primary
    if (recentSong) {
      cards.push({
        key: `recent-${recentSong.id}`,
        label: HOME_UI.hero.recentlyPlayed,
        title: recentHead.title || recentSong.title,
        subtitle: recentHead.artist || recentSong.artist || HOME_UI.hero.inRotation,
        song: recentSong,
      })
    }
  }

  const seen = new Set<string>()
  return cards
    .filter((card) => {
      if (seen.has(card.key)) return false
      seen.add(card.key)
      return true
    })
    .slice(0, 6)
}

export type GenreSpotlightCard = {
  id: string
  label: string
  count: number
  artworkUrl: string | null
  songs: ApiSong[]
}

export function buildGenreSpotlightCards(
  indexes: CatalogIndexes,
  history: MusicHistoryEntry[],
  limit = HOME_SECTION_PREVIEW_LIMIT,
): { cards: GenreSpotlightCard[]; personalized: boolean } {
  const preferred = new Map<string, number>()
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId)
    if (!song?.genre) continue
    const key = song.genre.trim().toLowerCase()
    preferred.set(key, (preferred.get(key) ?? 0) + 2)
  }

  const cards: Array<GenreSpotlightCard & { weight: number }> = []
  for (const [genre, genreSongs] of indexes.songsByGenre.entries()) {
    if (genreSongs.length < 2) continue
    const weight = (preferred.get(genre) ?? 0) + Math.min(genreSongs.length, 40)
    cards.push({
      id: genre,
      label: formatGenreLabel(genre),
      count: genreSongs.length,
      artworkUrl: genreSongs.find((song) => song.artwork)?.artwork ?? null,
      songs: genreSongs.slice(0, 18),
      weight,
    })
  }

  cards.sort((a, b) => b.weight - a.weight)
  return {
    cards: cards.slice(0, limit).map(({ id, label, count, artworkUrl, songs }) => ({
      id,
      label,
      count,
      artworkUrl,
      songs,
    })),
    personalized: preferred.size > 0,
  }
}
