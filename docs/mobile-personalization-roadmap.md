# Hidden Tunes Mobile Personalization Roadmap

## Purpose

This roadmap defines the next major mobile UX system for Hidden Tunes: first-open listener/artist onboarding and smart personalized song arrangement.

This is a planning document only. It does not change app code, playback, admin tools, upload flows, Supabase schema, or existing genre data.

## Phase Goal

Hidden Tunes should feel personal from the first open. New users should quickly identify whether they are here to listen or create, then receive an experience shaped around their taste, role, and intent.

The listener experience should become calm, premium, and tailored. The artist experience should unlock creator tools without mixing those tools into the listener-first flow.

## First-Open Role Selection

On first open, new users should choose their intent before the full app experience loads:

- I am here to listen
- I am an artist / creator

This selection should guide onboarding, default navigation, and feature visibility. It should not permanently lock the user out of switching roles later, but the first session should feel focused and simple.

## Listener Onboarding

Listeners should complete a short onboarding flow before the full app opens. The goal is to gather enough signal for a better first session without making onboarding feel heavy.

Listener onboarding should ask for:

- Favorite genres
- Preferred moods
- Energy level
- Language and region preferences
- Favorite artists
- Discovery style: familiar, balanced, or adventurous

The onboarding flow should feel visual and lightweight. It should favor quick choices, tasteful defaults, and the ability to skip non-critical steps.

## Artist / Creator Onboarding

Artist or creator accounts should unlock profile extras and admin-adjacent creator features in the mobile experience over time.

Artist accounts should be able to:

- Upload songs for review
- Manage releases
- Edit lyrics
- Submit artwork
- See review and copyright status

Creator tools should not appear as destructive or publishing controls during this early phase. Public catalog submission should remain review-based and rights-safe.

## Listener Local Uploads

Listeners should be able to bring their own music into their private listening experience.

Listeners can:

- Upload or import songs locally to their own device
- Play their own local songs
- Include local songs in personal playlists

Listeners cannot:

- Publish local uploads to the Hidden Tunes public catalog
- Access creator release tools unless they switch or apply as an artist

Local listener uploads should be treated as private library content, not public catalog content.

## Smart Premium Music Arrangement

Hidden Tunes should personalize song arrangement using catalog metadata, listening behavior, and future audio-derived signals.

The arrangement system should consider:

- Original genre
- Mood
- BPM
- Energy
- Waveform feel
- Texture
- Lyrics emotion
- Artist similarity
- Skip and replay behavior
- Favorites
- Listening history

The goal is not to create random shuffle. The goal is to make every sequence feel intentional, smooth, and emotionally coherent.

## Critical Genre Rule

Never mutate, rewrite, or overwrite the original genre.

Original genre is canonical catalog metadata. Personalization may create internal arrangement tags, mood clusters, vibe labels, or sequencing hints, but the song's stored genre must stay pure.

Example:

A song stays `Afrobeat`, but can be arranged internally as:

- Smooth
- Romantic
- Warm drums
- Mid-tempo
- Late-night
- Soft bounce

These internal descriptors are arrangement signals only. They must not replace or corrupt the original genre.

## Future Playlist Behavior

Personalized playlists should feel:

- Smooth
- Soothing
- Premium
- Not random
- Not overwhelming
- Tailored to user taste
- Still faithful to original genre

Playlist flow should respect both user preference and song identity. A listener who loves Afrobeat should still feel they are hearing Afrobeat, even when the app arranges songs by softness, warmth, energy, or late-night feel.

## Role Boundaries

Hidden Tunes should keep listener and creator experiences cleanly separated.

Listener mode should focus on:

- Personal taste
- Discovery
- Playlists
- Favorites
- Local private library

Creator mode should focus on:

- Artist profile
- Review submissions
- Release management
- Lyrics and artwork
- Rights and copyright status

The app may allow users to switch or apply for creator tools, but creator controls should not clutter the default listener journey.

## Non-Goals For This Phase

Do not implement:

- Playback changes
- Track Player changes
- PlayerContext changes
- Admin releases changes
- R2 upload flow changes
- Supabase schema changes
- Existing genre data changes
- External copyright scanning
- Audio fingerprint generation
- Public publishing from listener local uploads
- Creator enforcement gates

## Implementation Principles For Later Phases

When this roadmap moves into implementation, changes should be phased:

1. Add documentation and product decisions first.
2. Add non-destructive UI shells for onboarding.
3. Store user preferences only after schema and privacy decisions are approved.
4. Use original genre as read-only input.
5. Add arrangement logic without changing playback behavior.
6. Validate performance on low-memory Android devices before expanding the system.

## Success Criteria

This personalization system is successful when:

- New listeners understand the app immediately.
- Artists understand where creator tools live.
- Local listener uploads remain private.
- Public catalog uploads remain review-safe.
- Personalized playlists feel curated, calm, and premium.
- Original genres remain untouched.
- The system can grow into smarter recommendations without requiring risky rewrites.
