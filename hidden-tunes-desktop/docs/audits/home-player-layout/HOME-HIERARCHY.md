# Home Hierarchy

Final Home section order (`MusicHomePage`):

1. Page header (“Home” + subtitle)
2. Continue Listening *(hidden if empty)*
3. Featured *(compact banner; hidden if empty or duplicate of continue)*
4. Recently Played *(hidden if empty)*
5. Recommended for You *(personal mixes; skeleton only while catalog loading with no mixes)*
6. Genre Spotlights *(hidden if empty)*
7. Emotional Worlds *(hidden if empty)*
8. Hidden Gems *(hidden if empty)*
9. More to Explore *(destination chips for Radio / Podcasts / Audiobooks / Motivationals / Lectures / TV / Sports — navigation only, no fake catalogue rails)*

Rules applied:

- Music-first
- Empty sections hidden
- No fake recommendation payloads
- Bounded rails (8–10 items)
- Featured uses existing `buildMusicHeroContent` as a compact banner, not a full-viewport hero
- Centre content scrolls in `.main-scroll` only
