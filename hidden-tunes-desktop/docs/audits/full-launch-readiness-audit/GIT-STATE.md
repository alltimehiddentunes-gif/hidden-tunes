# Git State

| Field | Value |
|-------|-------|
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `1114cf2d79f51f6fc6f8f527db8adc35a54da18f` |
| Message | Complete backend migration to SSD workspace |
| Dirty | Yes (~264 entries; many staged `A` + modified `M`) |
| Clean checkout of HEAD alone | **Cannot reproduce current app** |

## Recent commits (25)

Includes Music rebuild, Home content-first, catalog pagination, queue/player, Sports foundation, search, history, playlists, downloads, library, podcast/radio hardening, TV integration.

## Critical launch fact

Live runtime depends on **uncommitted/staged** production modules. Shipping or clean-checking out `1114cf2` alone loses genres, smart continuation, player surface resolver, display text, global background, TV transport helpers, home-reference assets, and extensive Home/Music/App changes.
