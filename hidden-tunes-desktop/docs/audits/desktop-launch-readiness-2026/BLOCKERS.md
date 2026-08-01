# Launch Blockers

Nothing hidden. Classified from current source + verify scripts + packaging state (2026-08-01).

---

## Critical

| # | Blocker | Evidence | Why launch-blocking |
|---|---------|----------|---------------------|
| C1 | **Dirty launch tree** | 81 dirty `hidden-tunes-desktop` paths; security/playback/App WIP uncommitted | Cannot certify what ships |
| C2 | **No auto-update** | No `electron-updater`, no `publish` config | Cannot safely iterate post-install |
| C3 | **Release still `0.0.1` + unsigned** | `package.json` version; `signAndEditExecutable: false` | Not a production release identity |
| C4 | **Product authentication missing** | No login/signup UI; cosmetic “Hidden Listener”; Follow dead-ends | Not mobile-parity; account features broken |
| C5 | **Sports stream honesty** | Desktop will attempt play when API playable; mobile keeps streams off | Risk of false Watch Live / legal exposure |

---

## Major

| # | Blocker | Evidence |
|---|---------|----------|
| M1 | Music Downloads stub dishonest | `MusicSectionContent.tsx` “not available… yet” while Downloads work |
| M2 | Settings incomplete | Appearance/Playback nav disabled |
| M3 | Premium not productized | `checkoutAvailable: false` — OK only if launch is explicitly preview |
| M4 | Dual nav / unfinished chrome | Top pills + sidebar; notifications coming soon |
| M5 | Performance: 1.39 MB single JS chunk + huge CSS | Vite build warning |
| M6 | Genre load empty-scan risk | 25-page scan limit |
| M7 | TV artwork placeholders | Letter initials on channels |
| M8 | Lectures card layout risk | Older capture overlap — needs current re-proof |
| M9 | Offline UX uneven | Connectivity advisory only; no global offline shell |
| M10 | App.tsx monolith (~8335 lines) | Change risk for launch fixes |
| M11 | Installer artifact older than dirty WIP | `Setup 0.0.1.exe` dated 2026-07-30 |

---

## Minor

| # | Item |
|---|------|
| m1 | No dedicated Queue page (panel-only) |
| m2 | No More hub (sidebar IA instead) |
| m3 | Keyboard shortcut map incomplete |
| m4 | Sports favorites unavailable in library dispatch |
| m5 | Recommendations not a first-class surface |
| m6 | Personal Radio IA differs from mobile |
| m7 | Window tray / background policy undefined |
| m8 | ESLint module-type package warning |

---

## Cosmetic

| # | Item |
|---|------|
| c1 | “Hidden Listener” placeholder profile |
| c2 | Retained-for-reference dead panels/pages in App.tsx |
| c3 | Stale audit PNGs with fake Recently Added titles |
| c4 | Temporary `scripts/_*.mjs` probe/patch helpers untracked |
| c5 | Premium “Coming soon” chrome (intentional honesty) |

---

## Explicit non-blockers (verified)

- TypeScript build
- ESLint (errors)
- Electron security baseline
- Playback single-owner + mutex
- Route-independent media
- Recently Added catalogue honesty (source)
- Premium presentation honesty (no fake prices)
- Crash fallback page exists
- NSIS packaging capability exists
