import assert from 'node:assert/strict'
import { canonicalUrlForContent, isExactHiddenTunesUrl, parseHiddenTunesUrl, requireStableContentId } from '../src/lib/contentSharing.ts'

const cases = [
  [{ type: 'artist', id: 'artist-1', title: 'Artist' }, '/artists/artist-1'],
  [{ type: 'track', id: 'track 1', title: 'Track' }, '/tracks/track%201'],
  [{ type: 'album', id: 'album-1', title: 'Album' }, '/albums/album-1'],
  [{ type: 'radioStation', id: 'radio-1', title: 'Radio' }, '/radio/stations/radio-1'],
  [{ type: 'podcast', id: 'show-1', title: 'Show' }, '/podcasts/show-1'],
  [{ type: 'podcastEpisode', showId: 'show-1', episodeId: 'episode-1', title: 'Episode' }, '/podcasts/show-1/episodes/episode-1'],
  [{ type: 'audiobook', id: 'book-1', title: 'Book' }, '/audiobooks/book-1'],
  [{ type: 'audiobookChapter', bookId: 'book-1', chapterId: 'chapter-1', title: 'Chapter' }, '/audiobooks/book-1/chapters/chapter-1'],
  [{ type: 'tvChannel', id: 'tv-1', title: 'TV' }, '/tv/channels/tv-1'],
  [{ type: 'motivational', id: 'mot-1', title: 'Motivational' }, '/motivationals/mot-1'],
  [{ type: 'lecture', id: 'lecture-1', title: 'Lecture' }, '/lectures/lecture-1'],
]
for (const [content, path] of cases) assert.equal(canonicalUrlForContent(content), `https://hiddentunes.com${path}`)
assert.deepEqual(parseHiddenTunesUrl('https://hiddentunes.com/artists/%E9%9F%B3%E6%A5%BD'), { type: 'artist', id: '音楽' })
assert.deepEqual(parseHiddenTunesUrl('https://hiddentunes.com/audiobooks/book-1/chapters/chapter-1'), { type: 'audiobookChapter', bookId: 'book-1', chapterId: 'chapter-1' })
for (const id of ['', ' ', '.', '..', '../secret', 'a/b', 'a\\b', '%2e%2e', '%252e%252e', '%2fsecret', '%252fsecret', 'bad%']) assert.throws(() => requireStableContentId(id))
assert.equal(isExactHiddenTunesUrl('https://hiddentunes.com/artists/1'), true)
for (const value of ['http://hiddentunes.com/a', 'https://www.hiddentunes.com/a', 'https://hiddentunes.com.evil.example/a', 'https://hiddentunes.com:444/a', 'https://user@hiddentunes.com/a', 'javascript:alert(1)']) assert.equal(isExactHiddenTunesUrl(value), false)
for (const value of ['https://hiddentunes.com/artist/1', 'https://hiddentunes.com/tracks/1?token=x', 'https://hiddentunes.com/tracks/1#x', 'https://hiddentunes.com/api/tracks/1', 'https://hiddentunes.com/tracks/%252e%252e']) assert.equal(parseHiddenTunesUrl(value), null)
console.log('content sharing contract: PASS')
