# Discovery Visibility Fix

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`

## Goal

Expose existing podcast and live-radio discovery through normal user navigation — no new content, no redesign, no playback changes.

## Podcast Entry Points

| Location | Action | Route |
|----------|--------|-------|
| **Home** | Emotional Worlds → **Podcasts** card (1 tap) | `/podcasts` |
| **Profile** | Discovery → **Podcasts** | `/podcasts` |
| **Library** | Collection → **Podcasts** | `/podcasts` |
| **Search** | Deferred podcast results → See more | `/podcasts` |

From `/podcasts`, users reach without search:

- Featured Podcasts
- Trending Podcasts
- Popular Podcasts
- Emotional Podcasts (when populated)
- Browse Categories (including African Voices when populated)
- Mature Podcasts (only when mature ON + consent)

## Live Radio Entry Points

| Location | Action | Route |
|----------|--------|-------|
| **Home** | Emotional Worlds → **Live Radio** card (1 tap) | `/stations` |
| **Profile** | Discovery → **Live Radio** | `/stations` |
| **Library** | Collection → **Live Radio** | `/stations` |
| **Search** | Deferred radio results → See more | `/stations` |

## Library Entry Points

| Location | Action | Route |
|----------|--------|-------|
| **Bottom nav** | **Library** tab | `/library` |
| **Profile** | Library → **Your Library** | `/library` |
| **Library hub** | Favorites card | `/favorites` |
| **Library hub** | Playlists, Downloads, Recently Played | respective routes |

The Library tab now opens the library hub (`app/library.tsx`). Favorites remains reachable from the hub and profile — it no longer replaces the entire Library tab.

## Personal Radio vs Live Radio

| Feature | Label | Route | What it is |
|---------|-------|-------|------------|
| **Personal Radio** | Personal Radio | `/radio` | Smart endless music mix from your catalog |
| **Live Radio** | Live Radio | `/stations` | Browse and play thousands of live global stations |

Clarity cues:

- Home cards label **Podcasts** and **Live Radio** distinctly
- Profile Discovery uses **Personal Radio** (`infinite-outline`) vs **Live Radio** (`radio` icon)
- Library Collection uses **Personal Radio** (SMART MIX) vs **Live Radio** (LIVE STATIONS)
- Desktop sidebar nav item renamed to **Personal Radio** for `/radio`

## Routes Exposed (user-facing)

- `/library` — Library hub
- `/favorites` — Saved favorites
- `/podcasts` — Podcast discovery home
- `/podcasts/[categoryId]` — Category browse
- `/podcasts/show/[showId]` — Show episodes
- `/podcasts/mature` — Mature hub (gated)
- `/stations` — Live radio discovery home
- `/stations/[categoryId]` — Station category
- `/stations/search` — Station search
- `/radio` — Personal Radio

## Routes Hidden (no bottom-nav tab)

- `/podcasts/*` and `/stations/*` — reachable via cards/shortcuts; no dedicated tab (avoids tab highlight conflicts when opened from Home)
- `/radio` — Personal Radio; desktop sidebar + profile + library only on mobile
- `/search` — desktop sidebar; mobile via profile/library shortcuts
- Creator/admin routes — unchanged

## Files Changed

- `components/navigation/navigationConfig.ts` — Library tab → `/library`; expanded library matches; Personal Radio label
- `components/navigation/AppShell.tsx` — `/library` mini-player + background variant
- `components/navigation/AppShell.web.tsx` — `/library` background variant
- `app/profile.tsx` — Your Library shortcut; clearer Personal vs Live Radio copy
- `app/library.tsx` — Personal Radio card; discovery cards reordered; hero copy
- `components/EmotionalDiscoveryChips.tsx` — Podcasts first; clearer Live Radio copy

## Manual QA Checklist

- [ ] Home → Podcasts (1 tap) → podcast lanes appear
- [ ] Profile → Podcasts → same discovery home
- [ ] Home → Live Radio → `/stations`
- [ ] Profile → Live Radio → `/stations`
- [ ] Bottom nav → Library → library hub opens
- [ ] Library → Podcasts / Live Radio / Personal Radio
- [ ] Library → Favorites still works
- [ ] Podcast categories and mature podcasts (with consent)
- [ ] Personal Radio (`/radio`) distinct from Live Radio (`/stations`)
