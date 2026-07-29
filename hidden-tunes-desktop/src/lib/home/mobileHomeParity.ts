/**
 * Mobile Home (`app/music-feed.tsx`) parity builders for desktop.
 * Labels and matching logic mirror HiddenTunes-CLEAN-1.0.142.
 */
import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import { sortSongsList } from '../api'
import { selectInstantPlayableUrl } from '../audioVersions'
import {
  normalizeArtistKey,
  resolveAlbumDisplayArtist,
  resolveAlbumArtwork,
  resolveSongsForAlbum,
  resolveSongsForArtist,
  type CatalogIndexes,
} from '../catalogIndexes'
import {
  formatSongCountLabel,
  isGenericAlbumTitle,
  normalizeCatalogDisplayText,
} from '../catalogDisplayText'
import { excludeInternalDevCatalogSongs } from '../devAudioVersionTestHarness'
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

export type HomeCreatorOrbitCard = {
  artist: ApiArtist
  /** Public playable songs associated via id, name index, or artist.tracks. */
  playableSongCount: number
  personalisationScore: number
}

function resolvePlayableSongsForCreator(
  artist: ApiArtist,
  indexes: Pick<CatalogIndexes, 'songsByArtistId' | 'songsByArtistName'>,
): ApiSong[] {
  const associated = excludeInternalDevCatalogSongs(
    resolveSongsForArtist(artist, indexes.songsByArtistId, indexes.songsByArtistName),
  )
  return associated.filter((song) => Boolean(selectInstantPlayableUrl(song)))
}

/**
 * Creators In Your Orbit — eligibility first, then light personalisation.
 * Never promotes empty / unplayable creators.
 */
export function buildCreatorsInOrbit(
  artists: ApiArtist[],
  indexes: Pick<CatalogIndexes, 'songsByArtistId' | 'songsByArtistName' | 'songsById'>,
  history: MusicHistoryEntry[] = [],
  limit = HOME_SECTION_PREVIEW_LIMIT,
): HomeCreatorOrbitCard[] {
  const affinity = new Map<string, number>()
  for (const entry of history) {
    const song = indexes.songsById.get(entry.songId)
    if (!song) continue
    if (song.artistId) {
      const idKey = `id:${song.artistId}`
      affinity.set(idKey, (affinity.get(idKey) ?? 0) + 2)
    }
    const nameKey = normalizeArtistKey(song.artist)
    if (nameKey) {
      const key = `name:${nameKey}`
      affinity.set(key, (affinity.get(key) ?? 0) + 1)
    }
  }

  const eligible: HomeCreatorOrbitCard[] = []
  for (const artist of artists) {
    const name = artist.name?.trim()
    if (!artist.id || !name) continue

    const playable = resolvePlayableSongsForCreator(artist, indexes)
    if (playable.length === 0) continue

    const nameKey = normalizeArtistKey(name)
    const personalisationScore =
      (affinity.get(`id:${artist.id}`) ?? 0) +
      (affinity.get(`name:${nameKey}`) ?? 0) +
      Math.min(playable.length, 40)

    eligible.push({
      artist,
      playableSongCount: playable.length,
      personalisationScore,
    })
  }

  // Consolidate normalised spelling variants; keep strongest eligible card.
  const byName = new Map<string, HomeCreatorOrbitCard>()
  for (const card of eligible) {
    const key = normalizeArtistKey(card.artist.name)
    const existing = byName.get(key)
    if (
      !existing ||
      card.personalisationScore > existing.personalisationScore ||
      (card.personalisationScore === existing.personalisationScore &&
        card.playableSongCount > existing.playableSongCount)
    ) {
      byName.set(key, card)
    }
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.personalisationScore - a.personalisationScore ||
        a.artist.name.localeCompare(b.artist.name),
    )
    .slice(0, limit)
}

export type HomeAlbumContentType =
  | 'album'
  | 'single'
  | 'singles'
  | 'playlist'
  | 'collection'
  | 'podcast'
  | 'unknown'

export type HomeAlbumWorthCard = {
  album: ApiAlbum
  /** Editorial/catalog order — playable, public, de-duped. */
  playableTracks: ApiSong[]
  trackCount: number
  playableTrackCount: number
  artistName: string | null
  contentType: HomeAlbumContentType
  /** Omit when the type label adds no value on the card. */
  contentTypeLabel: string | null
  displayTitle: string
  displaySubtitle: string | null
  artwork: string | null
  rawTitle: string
  sourceType: 'album'
}

const NON_MUSIC_ALBUM_TITLES = new Set(['podcast', 'podcasts', 'episode', 'episodes'])

export function resolveHomeAlbumContentType(
  album: ApiAlbum,
  playableTrackCount: number,
): { type: HomeAlbumContentType; label: string | null } {
  const title = normalizeCatalogDisplayText(album.title) ?? ''
  const lower = title.toLowerCase()
  const release = normalizeCatalogDisplayText(album.releaseType)?.toLowerCase() ?? ''

  if (release.includes('playlist') || /\bplaylist\b/i.test(title)) {
    return { type: 'playlist', label: 'Playlist' }
  }
  if (release.includes('podcast') || NON_MUSIC_ALBUM_TITLES.has(lower)) {
    return { type: 'podcast', label: 'Podcast' }
  }
  if (release.includes('collection') || /\b(collection|mix|mixtape)\b/i.test(title)) {
    return { type: 'collection', label: 'Collection' }
  }
  if (release === 'single' || lower === 'single') {
    return { type: 'single', label: 'Single' }
  }
  if (lower === 'singles' || release === 'singles') {
    return {
      type: playableTrackCount <= 1 ? 'single' : 'singles',
      label: playableTrackCount <= 1 ? 'Single' : 'Singles',
    }
  }
  if (isGenericAlbumTitle(title)) {
    // Placeholder catalog title "Album" — infer from track depth, omit redundant label.
    if (playableTrackCount <= 1) return { type: 'single', label: 'Single' }
    return { type: 'album', label: null }
  }
  if (playableTrackCount <= 1) return { type: 'single', label: null }
  return { type: 'album', label: null }
}

function resolvePlayableSongsForAlbum(
  album: ApiAlbum,
  indexes: Pick<CatalogIndexes, 'songsByAlbumId' | 'songsByAlbumName' | 'artistNames'>,
): ApiSong[] {
  const associated = excludeInternalDevCatalogSongs(
    resolveSongsForAlbum(
      album,
      indexes.songsByAlbumId,
      indexes.songsByAlbumName,
      indexes.artistNames,
    ),
  )
  return associated.filter((song) => Boolean(selectInstantPlayableUrl(song)))
}

function scoreAlbumWorthCard(card: HomeAlbumWorthCard): number {
  const namedBonus = isGenericAlbumTitle(card.rawTitle) ? 0 : 120
  const multiTrackBonus = card.playableTrackCount >= 2 ? 40 : 0
  const singlesPenalty = card.contentType === 'singles' || card.contentType === 'single' ? 8 : 0
  return namedBonus + multiTrackBonus + card.playableTrackCount * 3 - singlesPenalty
}

/**
 * Albums Worth Staying With — playable collections only.
 * Prefers named albums over placeholder "Singles"/"Album" rows when both exist.
 */
export function buildAlbumsWorthStayingWith(
  albums: ApiAlbum[],
  indexes: Pick<CatalogIndexes, 'songsByAlbumId' | 'songsByAlbumName' | 'artistNames'>,
  artistNames?: Map<string, string> | null,
  limit = HOME_SECTION_PREVIEW_LIMIT,
): HomeAlbumWorthCard[] {
  if (!indexes?.songsByAlbumId || !indexes?.songsByAlbumName) return []
  const resolvedArtistNames = artistNames ?? indexes.artistNames ?? new Map<string, string>()
  const cards: HomeAlbumWorthCard[] = []

  for (const album of albums) {
    if (!album?.id) continue
    const rawTitle = normalizeCatalogDisplayText(album.title) ?? album.title ?? ''
    if (NON_MUSIC_ALBUM_TITLES.has(rawTitle.toLowerCase())) continue

    const playableTracks = resolvePlayableSongsForAlbum(album, {
      songsByAlbumId: indexes.songsByAlbumId,
      songsByAlbumName: indexes.songsByAlbumName,
      artistNames: resolvedArtistNames,
    })
    const artistName =
      normalizeCatalogDisplayText(
        resolveAlbumDisplayArtist(album, playableTracks, resolvedArtistNames),
      ) ?? null
    const { type, label } = resolveHomeAlbumContentType(album, playableTracks.length)
    const genericTitle = isGenericAlbumTitle(rawTitle)
    const trackLabel = formatSongCountLabel(playableTracks.length, {
      noun: 'track',
      omitZero: true,
    })

    // When catalog title is a placeholder ("Singles"/"Album"), lead with artist
    // so the rail is not a wall of identical "Singles" titles.
    const displayTitle = genericTitle
      ? artistName || rawTitle || 'Untitled'
      : rawTitle
    const displaySubtitle = genericTitle
      ? [label, trackLabel].filter(Boolean).join(' · ') || null
      : artistName

    cards.push({
      album,
      playableTracks,
      trackCount: playableTracks.length,
      playableTrackCount: playableTracks.length,
      artistName,
      contentType: type,
      contentTypeLabel: genericTitle ? null : label,
      displayTitle,
      displaySubtitle: displaySubtitle || null,
      artwork: resolveAlbumArtwork(album, playableTracks),
      rawTitle,
      sourceType: 'album',
    })
  }

  const ranked = cards.sort((a, b) => scoreAlbumWorthCard(b) - scoreAlbumWorthCard(a))
  const playable = ranked.filter((card) => card.playableTrackCount > 0)
  if (playable.length >= limit) return playable.slice(0, limit)
  const seen = new Set(playable.map((card) => card.album.id))
  const fillers = ranked.filter((card) => !seen.has(card.album.id))
  return [...playable, ...fillers].slice(0, limit)
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
  const seenSongIds = new Set<string>()
  return cards
    .filter((card) => {
      if (seen.has(card.key)) return false
      const songId = String(card.song.id || '')
      if (songId && seenSongIds.has(songId)) return false
      seen.add(card.key)
      if (songId) seenSongIds.add(songId)
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
