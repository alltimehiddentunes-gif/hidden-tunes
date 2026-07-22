# Before

- My Library showed music catalog mirrors (songs/albums/artists/editorial playlists), not user saves.
- Likes were music-only (`ht-desktop:music-likes`).
- TV favorites and lecture saves existed but never appeared in Library.
- Radio / Podcasts / Audiobooks / Motivationals had no Library save affordances.
- `isMusicCatalogSong` used the wrong motivational prefix and did not exclude lectures, so non-music queue rows could be hearted into music-likes.
- No typed discriminator or family-safe identity across media families.
