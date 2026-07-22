# After

- Library is a typed multi-family collection hydrated from `ht-desktop:library:v2`.
- Discriminated union + `{type}:{id}` identity prevents cross-family collisions.
- Music / Radio / Podcast show / Podcast episode / Audiobook / TV / Motivational / Lecture saves are supported where desktop pages are real.
- Sports is deferred (`unsupported` visible error if present).
- Legacy music/TV/lecture stores migrate once and continue dual-writing for existing UIs.
- Mature radio stays typed and gated from general Library.
- Playback routing is explicit per type; no “play as song” fallback.
- Liked Songs remains the music-specific surface; My Library is the multi-family destination.
- Player heart gating fixed for motivational/lecture queue ids.
