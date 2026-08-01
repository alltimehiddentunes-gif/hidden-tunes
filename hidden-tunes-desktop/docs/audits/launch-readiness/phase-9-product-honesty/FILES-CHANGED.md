# Files Changed

| File | Change |
|------|--------|
| `src/lib/sports/sportsFlags.ts` | **New** — streams-off flag + copy |
| `src/lib/sports/dispatchSportsPlayback.ts` | Short-circuit when streams off |
| `src/components/sports/DesktopSportsPage.tsx` | Hide Play; banner; honest hero |
| `src/components/sports/SportsFixtureDetails.tsx` | streamsEnabled gate + copy |
| `src/lib/account/accountGate.ts` | **New** — centralized gate copy |
| `src/components/account/AccountRequiredDialog.tsx` | **New** — dialog |
| `src/App.tsx` | Follow gate; Music Downloads wire; Settings/sidebar honesty |
| `src/App.css` | Account gate + sports info banner + settings hints |
| `src/components/music/MusicSectionContent.tsx` | Stub → real Downloads |
| `src/components/music/MusicWorkspace.tsx` | onOpenDownloads |
| `src/components/music/MusicSubNav.tsx` | Downloads tab → real destination |
| `src/components/music/MusicDiscoverPage.tsx` | Optional downloads prop |
| `src/components/music/GlobalTopNav.tsx` | Notifications copy |
| `scripts/verify-sports-contract.mjs` | Phase 9 streams-off assertions |
| `scripts/verify-phase9-product-honesty.mjs` | **New** |
| `scripts/verify-premium-honesty.mjs` | Sidebar wording |
| `scripts/smoke-home-music-integration.mjs` | Downloads routing checks |
| `package.json` | `verify:phase9-honesty` |
| `docs/audits/launch-readiness/phase-9-product-honesty/*` | Phase docs |

**Not changed:** DesktopPlaybackProvider ownership, Queue owner, TV video service, backend, mobile.
