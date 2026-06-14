/**
 * Standalone artwork asset registry.
 * PSD *-reference.jpg files are design references only — never import them here.
 *
 * TODO: Replace null bundledUrl entries with exported standalone assets under
 * src/assets/artwork/{songs,albums,artists,playlists,worlds,theater}/
 */

export type RegistryArtworkEntry = {
  id?: string
  name: string
  /** Bundled standalone asset — null until real export is added */
  bundledUrl: string | null
  /** Expected future asset path (documentation / TODO) */
  todoAssetPath: string
}

export function normalizeArtworkKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scopedAlbumKey(albumTitle: string, artistName: string) {
  return `${normalizeArtworkKey(artistName)}::${normalizeArtworkKey(albumTitle)}`
}

function buildNameMap(entries: RegistryArtworkEntry[]) {
  const map = new Map<string, RegistryArtworkEntry>()
  for (const entry of entries) {
    map.set(normalizeArtworkKey(entry.name), entry)
  }
  return map
}

function buildIdMap(entries: RegistryArtworkEntry[]) {
  const map = new Map<string, RegistryArtworkEntry>()
  for (const entry of entries) {
    if (entry.id) map.set(entry.id, entry)
  }
  return map
}

export const SONG_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { name: 'Midnight Reflection', todoAssetPath: 'assets/artwork/songs/midnight-reflection.jpg', bundledUrl: null },
  { name: 'Falling Slowly', todoAssetPath: 'assets/artwork/songs/falling-slowly.jpg', bundledUrl: null },
  { name: 'Afro Sunset', todoAssetPath: 'assets/artwork/songs/afro-sunset.jpg', bundledUrl: null },
  { name: 'Love Vibes', todoAssetPath: 'assets/artwork/songs/love-vibes.jpg', bundledUrl: null },
  { name: 'Rain & Reflection', todoAssetPath: 'assets/artwork/songs/rain-and-reflection.jpg', bundledUrl: null },
  { name: 'Night Drive', todoAssetPath: 'assets/artwork/songs/night-drive.jpg', bundledUrl: null },
]

export const ALBUM_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { name: 'Reflections at Midnight', todoAssetPath: 'assets/artwork/albums/reflections-at-midnight.jpg', bundledUrl: null },
  { name: 'Afro Sunrise', todoAssetPath: 'assets/artwork/albums/afro-sunrise.jpg', bundledUrl: null },
  { name: 'Vibes from Lagos', todoAssetPath: 'assets/artwork/albums/vibes-from-lagos.jpg', bundledUrl: null },
  { name: 'Love & Rhythm', todoAssetPath: 'assets/artwork/albums/love-and-rhythm.jpg', bundledUrl: null },
  { name: 'The Beginning', todoAssetPath: 'assets/artwork/albums/the-beginning.jpg', bundledUrl: null },
]

export const ARTIST_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { name: 'Wills Afrobeats', todoAssetPath: 'assets/artwork/artists/wills-afrobeats.jpg', bundledUrl: null },
  { name: 'Caasi Wills', todoAssetPath: 'assets/artwork/artists/caasi-wills.jpg', bundledUrl: null },
]

export const PLAYLIST_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { name: 'Night Drive', todoAssetPath: 'assets/artwork/playlists/night-drive.jpg', bundledUrl: null },
  { name: 'Chill Vibes', todoAssetPath: 'assets/artwork/playlists/chill-vibes.jpg', bundledUrl: null },
  { name: 'Jazz Café', todoAssetPath: 'assets/artwork/playlists/jazz-cafe.jpg', bundledUrl: null },
  { name: 'Deep Focus', todoAssetPath: 'assets/artwork/playlists/deep-focus.jpg', bundledUrl: null },
]

export const WORLD_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { id: 'rainy-window', name: 'Midnight Reflection', todoAssetPath: 'assets/artwork/worlds/midnight-reflection.jpg', bundledUrl: null },
  { id: 'sunday-morning', name: 'Afro Sunset', todoAssetPath: 'assets/artwork/worlds/afro-sunset.jpg', bundledUrl: null },
  { id: 'heartbreak-recovery', name: 'Healing Slowly', todoAssetPath: 'assets/artwork/worlds/healing-slowly.jpg', bundledUrl: null },
  { name: 'Rain & Reflection', todoAssetPath: 'assets/artwork/worlds/rain-and-reflection.jpg', bundledUrl: null },
  { id: 'midnight-drive', name: 'Night Drive', todoAssetPath: 'assets/artwork/worlds/night-drive.jpg', bundledUrl: null },
]

export const THEATER_ARTWORK_REGISTRY: RegistryArtworkEntry[] = [
  { name: 'Theater Mode', todoAssetPath: 'assets/artwork/theater/theater-mode.jpg', bundledUrl: null },
]

const SONG_BY_ID = buildIdMap(SONG_ARTWORK_REGISTRY)
const SONG_BY_NAME = buildNameMap(SONG_ARTWORK_REGISTRY)
const ALBUM_BY_ID = buildIdMap(ALBUM_ARTWORK_REGISTRY)
const ALBUM_BY_NAME = buildNameMap(ALBUM_ARTWORK_REGISTRY)
const ALBUM_BY_ARTIST_SCOPE = new Map<string, RegistryArtworkEntry>(
  ALBUM_ARTWORK_REGISTRY.flatMap((entry) => [
    [scopedAlbumKey(entry.name, 'Wills Afrobeats'), entry],
    [scopedAlbumKey(entry.name, 'Caasi Wills'), entry],
  ]),
)
const ARTIST_BY_ID = buildIdMap(ARTIST_ARTWORK_REGISTRY)
const ARTIST_BY_NAME = buildNameMap(ARTIST_ARTWORK_REGISTRY)
const PLAYLIST_BY_ID = buildIdMap(PLAYLIST_ARTWORK_REGISTRY)
const PLAYLIST_BY_NAME = buildNameMap(PLAYLIST_ARTWORK_REGISTRY)
const WORLD_BY_ID = buildIdMap(WORLD_ARTWORK_REGISTRY)
const WORLD_BY_NAME = buildNameMap(WORLD_ARTWORK_REGISTRY)
const THEATER_BY_NAME = buildNameMap(THEATER_ARTWORK_REGISTRY)

function resolveBundled(entry: RegistryArtworkEntry | undefined): string | null {
  if (!entry?.bundledUrl) return null
  return entry.bundledUrl.trim()
}

export function lookupRegistrySongArtwork(song: {
  id?: string | null
  title?: string | null
}): string | null {
  if (song.id) {
    const byId = resolveBundled(SONG_BY_ID.get(song.id))
    if (byId) return byId
  }
  const title = song.title ?? ''
  return resolveBundled(SONG_BY_NAME.get(normalizeArtworkKey(title)))
}

export function lookupRegistryAlbumArtwork(
  album: { id?: string | null; title?: string | null; artistId?: string | null },
  artistName?: string | null,
): string | null {
  if (album.id) {
    const byId = resolveBundled(ALBUM_BY_ID.get(album.id))
    if (byId) return byId
  }
  const titleKey = normalizeArtworkKey(album.title ?? '')
  if (artistName) {
    const scoped = resolveBundled(ALBUM_BY_ARTIST_SCOPE.get(scopedAlbumKey(album.title ?? '', artistName)))
    if (scoped) return scoped
  }
  return resolveBundled(ALBUM_BY_NAME.get(titleKey))
}

export function lookupRegistryArtistArtwork(artist: {
  id?: string | null
  name?: string | null
}): string | null {
  if (artist.id) {
    const byId = resolveBundled(ARTIST_BY_ID.get(artist.id))
    if (byId) return byId
  }
  return resolveBundled(ARTIST_BY_NAME.get(normalizeArtworkKey(artist.name ?? '')))
}

export function lookupRegistryPlaylistArtwork(playlist: {
  id?: string | null
  title?: string | null
}): string | null {
  if (playlist.id) {
    const byId = resolveBundled(PLAYLIST_BY_ID.get(playlist.id))
    if (byId) return byId
  }
  return resolveBundled(PLAYLIST_BY_NAME.get(normalizeArtworkKey(playlist.title ?? '')))
}

export function lookupRegistryWorldArtwork(world: {
  id?: string | null
  title?: string | null
}): string | null {
  if (world.id) {
    const byId = resolveBundled(WORLD_BY_ID.get(world.id))
    if (byId) return byId
  }
  return resolveBundled(WORLD_BY_NAME.get(normalizeArtworkKey(world.title ?? '')))
}

export function lookupRegistryTheaterArtwork(label = 'Theater Mode'): string | null {
  return resolveBundled(THEATER_BY_NAME.get(normalizeArtworkKey(label)))
}

/** Standalone assets still pending export — for QA / deliverables */
export function listMissingRegistryAssets(): string[] {
  const pending: string[] = []
  const all = [
    ...SONG_ARTWORK_REGISTRY,
    ...ALBUM_ARTWORK_REGISTRY,
    ...ARTIST_ARTWORK_REGISTRY,
    ...PLAYLIST_ARTWORK_REGISTRY,
    ...WORLD_ARTWORK_REGISTRY,
    ...THEATER_ARTWORK_REGISTRY,
  ]
  for (const entry of all) {
    if (!entry.bundledUrl) pending.push(entry.todoAssetPath)
  }
  return pending
}
