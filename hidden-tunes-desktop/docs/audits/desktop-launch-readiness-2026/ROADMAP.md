# Roadmap to Launch

Continuing from current desktop integration work. Phases are **sequential where dependent**; some can overlap after freeze.

Assumptions:

- Mobile remains behavioural reference.
- Sports streams stay intentionally off for legal/product parity unless separately approved.
- Premium checkout may ship later if launch is labeled “membership preview,” but Auth is still required for true mobile parity.

---

## Phase 8 — Freeze & certify current WIP

| | |
|--|--|
| **Objective** | Turn dirty tree into a reviewable launch candidate baseline without rewriting architecture |
| **Files** | Entire `hidden-tunes-desktop/` dirty set; especially `App.tsx`, `electron/*`, playback, premium |
| **Risk** | Medium — large commit surface |
| **Dependencies** | Explicit user instruction to commit |
| **Validation** | `tsc`, `eslint`, all `verify:*`, fresh installer build |
| **Duration** | 2–3 days |

---

## Phase 9 — Honesty & desktop-only defect sweep

| | |
|--|--|
| **Objective** | Remove false copy and align Sports with mobile streams-off honesty |
| **Files** | `MusicSectionContent.tsx`, sports flags/dispatch, library sports favorites messaging, notifications disabled states |
| **Risk** | Low |
| **Dependencies** | Phase 8 |
| **Validation** | Manual copy review; sports play affordance tests; premium-honesty + recently-added scripts |
| **Duration** | 1–2 days |

---

## Phase 10 — Visual polish pass (launch surfaces)

| | |
|--|--|
| **Objective** | Bring Home/Music/TV/Lectures/Player/Settings empty+loaded states to mobile-grade premium |
| **Files** | `MusicHomePage.tsx`, music components, `TvPage.tsx`, lectures components, `App.css`, Settings UI |
| **Risk** | Medium (CSS monolith) |
| **Dependencies** | Phase 8–9 |
| **Validation** | Fresh 1440/1024 screenshot matrix; no title/badge collisions |
| **Duration** | 5–7 days |

---

## Phase 11 — Settings completion + offline UX

| | |
|--|--|
| **Objective** | Enable Appearance/Playback settings; consistent offline/error banners |
| **Files** | Settings in `App.tsx`, connectivity hooks, catalog banners |
| **Risk** | Low–Medium |
| **Dependencies** | Phase 8 |
| **Validation** | Manual settings matrix; offline airplane-mode smoke |
| **Duration** | 2–3 days |

---

## Phase 12 — Authentication (parity)

| | |
|--|--|
| **Objective** | Login/signup/session UX comparable to mobile `/auth`; unlock Follow + future sync |
| **Files** | New auth UI; `desktopSupabaseAuth.ts` expansion; sidebar profile; LaunchGate |
| **Risk** | High |
| **Dependencies** | Supabase project config; product decision |
| **Validation** | Sign-in/out, Follow, session persistence, security review of tokens |
| **Duration** | 7–12 days |

---

## Phase 13 — Performance hardening

| | |
|--|--|
| **Objective** | Code-split routes; reduce CSS; virtualize large lists; measure startup |
| **Files** | Vite config, App split, `useCatalogWindow`, family pages |
| **Risk** | Medium |
| **Dependencies** | Phase 8 (avoid splitting dirty monolith blindly) |
| **Validation** | Bundle budgets; CDP startup; scroll FPS on large catalogs |
| **Duration** | 4–6 days |

---

## Phase 14 — Release engineering

| | |
|--|--|
| **Objective** | Real version, signed NSIS, auto-update channel, crash telemetry basics |
| **Files** | `package.json` build/publish, electron-updater integration, CI |
| **Risk** | High (ops) |
| **Dependencies** | Code signing cert; update hosting |
| **Validation** | Install → update → relaunch; SmartScreen spot-check |
| **Duration** | 4–7 days |

---

## Phase 15 — Premium (if launch requires billing)

| | |
|--|--|
| **Objective** | Real checkout + entitlement authority — or explicitly defer with preview labeling |
| **Files** | `premiumPresentation.ts`, Premium page, backend entitlement |
| **Risk** | High |
| **Dependencies** | Billing backend |
| **Validation** | Purchase sandbox; entitlement gates; honesty script updated |
| **Duration** | 7–14 days **or** 0 days if deferred |

---

## Phase 16 — Launch QA & ship

| | |
|--|--|
| **Objective** | Full family playback matrix, security re-verify, installer soak, go/no-go |
| **Files** | Docs + release notes |
| **Risk** | Medium |
| **Dependencies** | Phases 8–14 (and 15 if required) |
| **Validation** | Checklist across Home→Sports; mutex; offline downloads; auth |
| **Duration** | 3–5 days |

---

## Estimated remaining development time

| Path | Calendar |
|------|----------|
| **Preview launch** (no auth billing; honesty + freeze + polish + signed build + updater) | **~4–5 weeks** |
| **True 100% mobile-parity production** (auth + polish + perf + release eng + optional premium) | **~7–10 weeks** |

Sports live streams are **not** required for parity with current mobile production posture.
