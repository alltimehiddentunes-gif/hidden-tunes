# Mobile Auto-Next / Smart Queue → Desktop Parity Audit

Date: 2026-07-27
Desktop branch: `desktop/integrate-home-music-split`
Mobile reference: `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` (read-only)

## Gap table (pre-fix)

| Behaviour | Mobile | Desktop before | Gap | Required change |
|---|---|---|---|---|
| single-song play | replaces queue | `playTrack` → single + manual | none | keep |
| section queue seeding | section list, index retained, **bounded stop** | section list + related extend | over-extends | mark bounded; stop at end |
| album queue | full album, index retained, **bounded stop** | full album + related extend | over-extends | default bounded |
| artist queue | artist tracks, **bounded stop** | artist + related extend | over-extends | default bounded |
| playlist queue | replace, editorial order, **bounded stop** | manual seed, no extend | ok | keep |
| search queue | results list, **bounded stop** | discover + related extend | over-extends | default bounded |
| auto-next | ended → debounce → next | ended → next | weak debounce | add debounce guard |
| queue exhaustion | bounded stop / unbounded smart | related append for non-manual | wrong gate | mobile bounded gate |
| smart continuation | up to 12 at exhaustion, unbounded only | up to 5, near-end + start | timing + size | exhaustion-only, 12, scoring |
| manual Play next | music: N/A | insert after current | keep + priority | insert before smart region |
| Add to queue | music: N/A | append | keep + priority | insert before smart region |
| reorder | N/A music | moveQueueItem | keep | keep |
| shuffle | random next | upcoming reshuffle | keep desktop | keep |
| repeat-one | restart | restart | ok | keep |
| repeat-all | wrap | wrap | ok | keep |
| failure skip | music: stop (no skip) | music: stop; radio skip | optional URL skip bound | bounded invalid-URL skip on advance |
| duplicate prevention | by song.id | by song.id | ok | keep |
| queue persistence | AsyncStorage | localStorage v1 | ok | keep |
| navigation independence | queue survives | provider survives | ok | keep Home no-nav |
| media switching | handoff owners | stopInactiveMedia | ok | keep |

## Implementation (this task)

- `smartContinuation.ts` — mobile-parity scoring, bounded gate, limit 12
- `queueIntelligence.ts` — adapter over smart continuation
- `DesktopPlaybackProvider` — exhaustion-only extend, ended debounce, manual-before-smart
- `MusicHomePage` — full catalog / hero `bounded: false`; sections default bounded
- `scripts/test-auto-next-smart-queue.mjs` — contract tests 1–25
