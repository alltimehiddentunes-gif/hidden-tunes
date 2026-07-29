/**
 * Focused catalog display / encoding normalisation tests.
 */
import assert from 'node:assert/strict'
import {
  formatAlbumCardSecondary,
  formatCatalogMetaParts,
  formatSongCardSecondary,
  formatSongCountLabel,
  isGenericAlbumTitle,
  isMojibakeText,
  normalizeCatalogAlbumTitle,
  normalizeCatalogArtistLabel,
  normalizeCatalogDisplayText,
  pickAlbumTitleFromRecord,
  pickArtistNameFromRecord,
} from '../src/lib/catalogDisplayText.ts'

function normalizeSongFixture(row) {
  const title =
    normalizeCatalogDisplayText(
      typeof row.title === 'string' ? row.title : null,
    ) || 'Untitled'
  const artist = pickArtistNameFromRecord(row) || ''
  const album = pickAlbumTitleFromRecord(row) || ''
  const artistId =
    row.artistId != null
      ? String(row.artistId)
      : row.artist_id != null
        ? String(row.artist_id)
        : null
  return { title, artist, album, artistId }
}

function normalizeAlbumFixture(row) {
  const title =
    normalizeCatalogDisplayText(
      typeof row.title === 'string' ? row.title : null,
    ) || 'Untitled Album'
  const artistId =
    row.artistId != null
      ? String(row.artistId)
      : row.artist_id != null
        ? String(row.artist_id)
        : null
  return { title, artistId }
}

assert.equal(normalizeCatalogDisplayText('Midnight Drive'), 'Midnight Drive')
assert.equal(normalizeCatalogArtistLabel('Hidden Tunes'), 'Hidden Tunes')

assert.equal(normalizeCatalogDisplayText('Jazz Café'), 'Jazz Café')
assert.equal(normalizeCatalogDisplayText('Señorita'), 'Señorita')
assert.equal(normalizeCatalogAlbumTitle('Études'), 'Études')

assert.equal(normalizeCatalogDisplayText("Don't Stop"), "Don't Stop")
assert.equal(normalizeCatalogDisplayText('Rock ’n’ Roll'), 'Rock ’n’ Roll')

assert.equal(
  normalizeCatalogDisplayText('Liya & Simi Adua Remix'),
  'Liya & Simi Adua Remix',
)

assert.equal(normalizeCatalogDisplayText('Part 1 – Intro'), 'Part 1 – Intro')
assert.equal(normalizeCatalogDisplayText('Echoes — Live'), 'Echoes — Live')
assert.equal(
  formatCatalogMetaParts(['12 songs', '3h 12m'], ' • '),
  '12 songs • 3h 12m',
)

assert.equal(normalizeCatalogArtistLabel('宇多田ヒカル'), '宇多田ヒカル')
assert.equal(normalizeCatalogArtistLabel('Белый снег'), 'Белый снег')
assert.equal(normalizeCatalogArtistLabel('أحمد'), 'أحمد')

assert.equal(isMojibakeText('Jazz CafÃ©'), true)
assert.equal(normalizeCatalogDisplayText('Jazz CafÃ©'), null)
assert.equal(normalizeCatalogDisplayText('50 songs ├óÔé¼┬ó 3h'), null)
assert.equal(normalizeCatalogDisplayText('ÔÇô'), null)
assert.equal(normalizeCatalogArtistLabel('Caf├â┬®'), null)

assert.equal(normalizeCatalogDisplayText('   '), null)
assert.equal(normalizeCatalogDisplayText('[object Object]'), null)

assert.equal(normalizeCatalogArtistLabel(null), null)
assert.equal(normalizeCatalogArtistLabel(''), null)
assert.equal(normalizeCatalogArtistLabel('Unknown Artist'), null)
assert.equal(
  normalizeCatalogArtistLabel(null, { allowUnknownFallback: true }),
  'Unknown artist',
)

assert.equal(formatSongCountLabel(0), null)
assert.equal(formatSongCountLabel(0, { omitZero: false }), '0 songs')
assert.equal(formatSongCountLabel(1, { noun: 'track' }), '1 track')
assert.equal(formatSongCountLabel(12), '12 songs')
assert.equal(formatSongCountLabel(null), null)

assert.equal(
  formatAlbumCardSecondary({ releaseYear: 2024, trackCount: 0 }),
  'Released 2024',
)
assert.equal(formatAlbumCardSecondary({ trackCount: 0 }), null)
assert.equal(
  formatAlbumCardSecondary({ releaseYear: 2024, trackCount: 10 }),
  'Released 2024 · 10 tracks',
)

assert.equal(formatSongCardSecondary({ artist: 'Ada', album: 'Ada' }), 'Ada')
assert.equal(isGenericAlbumTitle('Singles'), true)
assert.equal(isGenericAlbumTitle('Night Drive'), false)

const nested = normalizeSongFixture({
  id: '1',
  title: "Can't Stop",
  artist: 'Björk',
  album: { title: 'Homogenic', id: 'alb-1' },
  artistId: 'art-1',
})
assert.equal(nested.title, "Can't Stop")
assert.equal(nested.artist, 'Björk')
assert.equal(nested.album, 'Homogenic')
assert.notEqual(nested.album, 'Singles')
assert.notEqual(nested.album, '[object Object]')

const missingAlbum = normalizeSongFixture({
  id: '2',
  title: 'Loose Track',
  artist_name: 'أحمد',
})
assert.equal(missingAlbum.album, '')
assert.equal(missingAlbum.artist, 'أحمد')

const mojibakeSong = normalizeSongFixture({
  id: '3',
  title: 'Jazz CafÃ©',
  artist: 'Hidden Tunes',
  album: 'Singles',
})
assert.equal(mojibakeSong.title, 'Untitled')
assert.equal(mojibakeSong.album, 'Singles')

const albumCamel = normalizeAlbumFixture({
  id: 'alb',
  title: 'Singles',
  artistId: 'cd9091ad-4671-4eb0-8066-d9ab8bdd96dd',
})
assert.equal(albumCamel.artistId, 'cd9091ad-4671-4eb0-8066-d9ab8bdd96dd')

const albumSnake = normalizeAlbumFixture({
  id: 'alb2',
  title: 'Night Drive',
  artist_id: 'legacy-id',
})
assert.equal(albumSnake.artistId, 'legacy-id')

const albumMissingArtist = normalizeAlbumFixture({
  id: 'alb3',
  title: 'Homogenic',
})
assert.equal(albumMissingArtist.artistId, null)

console.log('catalog display text tests passed')
