import assert from 'node:assert/strict';
import {
  canonicalUrlForContent,
  isExactHiddenTunesUrl,
  parseHiddenTunesUrl,
  requireStableContentId,
  shareMessageForContent,
} from '../utils/contentSharing';

assert.equal(canonicalUrlForContent({ type: 'artist', id: 'artist-1', title: 'Artist' }), 'https://hiddentunes.com/artists/artist-1');
assert.equal(canonicalUrlForContent({ type: 'track', id: 'track 1', title: 'Track' }), 'https://hiddentunes.com/tracks/track%201');
assert.equal(canonicalUrlForContent({ type: 'album', id: 'album#1', title: 'Album' }), 'https://hiddentunes.com/albums/album%231');
assert.equal(canonicalUrlForContent({ type: 'radioStation', id: 'radio-1', title: 'Radio' }), 'https://hiddentunes.com/radio/stations/radio-1');
assert.equal(canonicalUrlForContent({ type: 'podcast', id: 'show-1', title: 'Show' }), 'https://hiddentunes.com/podcasts/show-1');
assert.equal(canonicalUrlForContent({ type: 'podcastEpisode', showId: 'show-1', episodeId: 'episode-1', title: 'Episode' }), 'https://hiddentunes.com/podcasts/show-1/episodes/episode-1');
assert.equal(canonicalUrlForContent({ type: 'audiobook', id: 'book-1', title: 'Book' }), 'https://hiddentunes.com/audiobooks/book-1');
assert.equal(canonicalUrlForContent({ type: 'audiobookChapter', bookId: 'book-1', chapterId: 'chapter-1', title: 'Chapter' }), 'https://hiddentunes.com/audiobooks/book-1/chapters/chapter-1');
assert.equal(canonicalUrlForContent({ type: 'tvChannel', id: 'tv-1', title: 'TV' }), 'https://hiddentunes.com/tv/channels/tv-1');
assert.equal(canonicalUrlForContent({ type: 'motivational', id: 'mot-1', title: 'Motivational' }), 'https://hiddentunes.com/motivationals/mot-1');
assert.equal(canonicalUrlForContent({ type: 'lecture', id: 'lecture-1', title: 'Lecture' }), 'https://hiddentunes.com/lectures/lecture-1');
assert.equal(shareMessageForContent({ type: 'artist', id: 'artist-1', title: 'Artist' }), 'Discover Artist on Hidden Tunes.\nhttps://hiddentunes.com/artists/artist-1');
assert.deepEqual(parseHiddenTunesUrl('https://hiddentunes.com/artists/%E9%9F%B3%E6%A5%BD'), { type: 'artist', id: '音楽' });
assert.deepEqual(parseHiddenTunesUrl('https://hiddentunes.com/podcasts/show-1/episodes/episode-1'), { type: 'podcastEpisode', showId: 'show-1', episodeId: 'episode-1' });

for (const invalid of ['', ' ', '.', '..', '../secret', 'a/b', 'a\\b', '%2e%2e', '%252e%252e', '%2fsecret', '%252fsecret', 'bad%']) {
  assert.throws(() => requireStableContentId(invalid));
}

assert.equal(isExactHiddenTunesUrl('https://hiddentunes.com/artists/1'), true);
for (const invalidUrl of [
  'http://hiddentunes.com/artists/1',
  'https://www.hiddentunes.com/artists/1',
  'https://hiddentunes.com.evil.example/artists/1',
  'https://hiddentunes.com:444/artists/1',
  'https://user@hiddentunes.com/artists/1',
  'javascript:alert(1)',
]) assert.equal(isExactHiddenTunesUrl(invalidUrl), false);
for (const invalidUrl of ['https://hiddentunes.com/artist/1', 'https://hiddentunes.com/tracks/1?token=x', 'https://hiddentunes.com/tracks/1#x', 'https://hiddentunes.com/api/tracks/1', 'https://hiddentunes.com/tracks/%252e%252e']) assert.equal(parseHiddenTunesUrl(invalidUrl), null);

console.log('content sharing contract: PASS');
