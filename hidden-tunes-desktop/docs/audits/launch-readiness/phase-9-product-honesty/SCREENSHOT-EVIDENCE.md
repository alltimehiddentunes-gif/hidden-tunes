# Screenshot Evidence

Automated Electron smokes on 2026-08-01 validated the honesty surfaces after the branch-recovery incident. Dedicated PNG captures were not written to disk in this pass; proof is the smoke/contract suite.

| # | Intended capture | Proof used |
|---|------------------|------------|
| 1–2 | Sports no Play / streams-off | `verify-sports-contract` + Sports page source gates |
| 3 | TV regression | `verify:route-media` + `verify:video-surface` |
| 4–5 | Music → real Downloads | `smoke-home-music-integration` downloads assertions (PASS) |
| 6 | Follow gate | `AccountRequiredDialog` + phase9 honesty verify |
| 7 | Premium | `verify:premium-honesty` |
| 8 | Settings disabled | Settings source + phase9 honesty |
| 9 | 1024 layout | home smoke 1024 checks |
| 10 | Playback + dialog | Dialog does not call stop/pause; mutex/route-media PASS |

Operator follow-up (optional): CDP capture into this folder for visual QA archive.
