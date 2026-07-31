# BUILD-MATURE-PODCAST-AUDIT

**Date:** 2026-07-31  
**Mode:** Audit only — no source edits, no commit, no push, no rebuild, no deploy, no flag/backend/EAS changes  
**Authoritative workspace:** `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142`

---

## 1. Workspace proof

| Field | Value |
| --- | --- |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| Local HEAD | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Remote HEAD (`origin/fix/library-content-type-safe`) | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Working tree | Clean (`nothing to commit`) |
| Branch sync | Up to date with origin |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Metro | Port `8081`, process `15472` |
| Metro command | `expo start --dev-client --port 8081` |
| Metro project root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |

**Abort check:** Git root matches required SSD path. Audit continued.

---

## 2. Build proof

### A) App Store Connect / TestFlight binary that was actually submitted

Proven from the authorized release session that completed production build + ASC submit from SHA `7288de6`:

| Field | Value |
| --- | --- |
| EAS Build ID | `90538e1d-971b-43b8-b984-dd6176c59491` |
| Build profile | `production` |
| Distribution | `STORE` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/90538e1d-971b-43b8-b984-dd6176c59491 |
| Artifact IPA | https://expo.dev/artifacts/eas/cf1sAoYdNc-QPd0Pg96XKH8qnPlDZiSBvQtyiWqNEBw.ipa *(listed under that build in EAS; sibling listing confirms STORE production)* |
| Build commit SHA | `7288de6aef5e05cab3bac0253d7c114e8a6d6762` |
| Commit message | `fix(playback): prevent duplicate media activation and player flicker` |
| App version | `1.0.1` |
| iOS build number | `1.0.191` |
| Created | `2026-07-31T02:29:49.758Z` |
| Expo project ID | `9cf7fc48-6bf7-4ccc-8fe1-8b793530e70c` |
| Bundle identifier | `com.hiddentunes.app` |
| Submission ID | `9232aac9-96b0-4333-b8c5-4fcf45872fd2` |
| Submission result | Completed to App Store Connect from approved SHA `7288de6` |

### B) Latest finished production EAS build (may not be what TestFlight is serving yet)

| Field | Value |
| --- | --- |
| EAS Build ID | `70003e63-08f8-4188-bf14-981fb794a5d6` |
| Build profile | `production` |
| Distribution | `STORE` |
| Build URL | https://expo.dev/accounts/hiddentunes_1/projects/hidden-tunes/builds/70003e63-08f8-4188-bf14-981fb794a5d6 |
| Artifact IPA | https://expo.dev/artifacts/eas/7P9XTXwpZoGSVZs9jv3lHXvwX_aSNL1W0EHN_fEU4LM.ipa |
| Build commit SHA | `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` |
| Commit message | `release: prepare Hidden Tunes production builds` |
| App version | `1.0.1` |
| iOS build number | `1.0.193` |
| Created | `2026-07-31T20:42:42.773Z` |
| Finished | `2026-07-31T20:48:16.075Z` |
| Fingerprint | `e4d7f00ccb30fa1b93260853caa965ac7bf945f0` |

### Runtime / channel / environment

| Field | Value |
| --- | --- |
| Runtime version | **Not configured** in `app.json` / `app.config.js` |
| Update channel | **None** — `expo-updates` is **not** a dependency |
| OTA mismatch risk | **Ruled out** (no Expo Updates pipeline) |
| Production environment | EAS profile `production` → `EXPO_PUBLIC_BUILD_PROFILE=production` |
| Podcast API host | Hardcoded `https://admin.hiddentunes.com` (same for Metro + production) |

---

## 3. Build SHA

**Submitted TestFlight/ASC build SHA:** `7288de6aef5e05cab3bac0253d7c114e8a6d6762`

**Latest production EAS build SHA:** `3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a`

---

## 4. Local SHA

`3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a`

---

## 5. Remote SHA

`3fe6c9f3102acbc9bac3f7fc7c77e8b1b8ee235a` (`origin/fix/library-content-type-safe`)

**Was the submitted build produced from the latest pushed commit?**  
**No.** Submitted ASC binary = `7288de6`. Latest pushed commit = `3fe6c9f`.

`7288de6` **is an ancestor** of `3fe6c9f`, but it **predates** the mature catalog restore commit `f6176ce`.

---

## 6. Build contained fixes? (Yes/No)

Inspected **submitted build commit** `7288de6` and **latest production build commit** `3fe6c9f`.

| Fix / surface | In submitted `7288de6` (1.0.191) | In latest EAS `3fe6c9f` (1.0.193) / Metro HEAD |
| --- | --- | --- |
| Mature Podcast page (`app/podcasts/mature.tsx`) | **Yes** | **Yes** |
| Mature Podcast navigation card on `/podcasts` | **Yes** | **Yes** |
| Mature category visibility (seed children / gate) | **Partial** (seed-only) | **Yes** (backend catalog + seed category chips) |
| `includeMature=true` client plumbing | **Partial** (settings/API helpers exist; mature page did not fetch backend mature catalog) | **Yes** |
| Mature pagination (`useMaturePodcastCatalog`) | **No** (`hooks/useMaturePodcastCatalog.ts` absent) | **Yes** (added in `f6176ce`) |
| Mature cache separation (`podcast-shows:mature:` + clear on disable) | **No** (hook/cache path from `f6176ce` absent) | **Yes** |
| Podcast auto-next / same-category continuation (`PodcastPlaybackController`) | **No** (file absent at that SHA) | **Yes** |
| Backend mature catalog restore (`fetchMaturePodcastShows` used by mature screen) | **No** — mature screen calls `getMaturePodcastPageSections` seeds only | **Yes** |

**Ancestor proof:**

```text
git merge-base --is-ancestor f6176ce 3fe6c9f  → exit 0 (YES in latest)
git merge-base --is-ancestor f6176ce 7288de6  → exit 1 (NO in submitted)
```

`f6176ce` = `fix: optimize podcasts and restore mature episodes`  
(AuthorDate: Fri Jul 31 22:40:30 2026 +0200)

---

## 7. Metro configuration

| Item | Value |
| --- | --- |
| Project root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Port | `8081` |
| Mode | Dev client (`expo start --dev-client`) |
| JS source | Live Metro bundle from current HEAD `3fe6c9f` |
| Mature data path | `useMaturePodcastCatalog` → `fetchMaturePodcastShows` → `category=adult-lifestyle&includeMature=true` |
| Age gate default | OFF until Profile / Mature toggle + consent (`AsyncStorage`) |
| Entry card | Always rendered on Podcast home (locked or unlocked subtitle) |

---

## 8. Production configuration

| Item | Submitted TestFlight (`1.0.191` / `7288de6`) | Latest EAS production IPA (`1.0.193` / `3fe6c9f`) |
| --- | --- | --- |
| Profile | `production` | `production` |
| Embedded JS | Commit `7288de6` | Commit `3fe6c9f` |
| Mature data path | Seed-only `getMaturePodcastPageSections` | Backend paginated mature catalog |
| Adult seeds available | **1** (`MATURE_PODCAST_FEEDS`) | Same seeds for category chips + **1761** backend shows |
| `EXPO_PUBLIC_BUILD_PROFILE` | `production` | `production` |
| Podcast host | `https://admin.hiddentunes.com` | Same |
| OTA | None | None |

`eas.json` production env contains sports flags only. **No mature/podcast feature-flag env vars.**

---

## 9. Feature flags

### Every visibility condition found

| Location | Condition | Effect |
| --- | --- | --- |
| `utils/maturePodcastSettings.ts` | `shouldIncludeMaturePodcasts()` = `enabled && hasConsent` | Default **false**. Controls API `includeMature`, unlocked catalog fetch, play gating |
| `utils/maturePodcastSettings.ts` | AsyncStorage keys `@hidden_tunes_mature_podcasts_enabled_v1`, `@hidden_tunes_mature_podcasts_consent_v1` | Persist toggle + consent |
| `app/podcasts/index.tsx` | Mature card **unconditional** when search empty | Entry always visible; lock icon reflects gate |
| `app/podcasts/mature.tsx` | `enabled` from settings | Locked panel vs catalog list |
| `app/podcasts/mature.tsx` / `useMaturePodcastCatalog` | `if (!enabled) return` (empty) | No mature API calls while locked |
| `app/podcasts/category/[id].tsx` | `category.matureOnly && !shouldIncludeMaturePodcasts()` | Redirect to `/podcasts/mature` |
| `app/podcasts/show/[id].tsx` / episode | Mature show/episode without consent | Redirect / block play |
| `services/podcastService.ts` `buildStaticPodcastHomeSync` | `if (section.matureOnly) return false` | **Always strips** mature root section from seed home sections (does not affect current dedicated mature card) |
| `services/podcastCatalogApi.ts` `BACKEND_PODCAST_CATEGORY_SLUGS` | Does **not** include `adult-lifestyle` | Mature is **not** a browse chip; only via Mature card / route |
| `eas.json` / `.env*` | No `EXPO_PUBLIC_*MATURE*` | No EAS/env feature flag hides Mature |
| `__DEV__` | No `__DEV__` gate around Mature Podcast UI | Not Metro-only |

**Verdict:** No production feature flag removes Mature Podcasts. Visibility of **catalog content** requires local age-gate consent. The **entry card** is not feature-flagged.

---

## 10. Navigation conditions

| Question | Answer (evidence) |
| --- | --- |
| Section hidden by flag? | **No** |
| Route removed in production? | **No** — `app/podcasts/mature.tsx` exists in both SHAs; standalone guard only strips expo-dev-client pods |
| Screen excluded from bundle? | **No** evidence |
| Age gate blocks entry UI? | **No** — card still shows locked state |
| Age gate blocks catalog? | **Yes** — until consent; then submitted build still only has seeds |
| Menu filter removes it? | Library only links to `/podcasts`; no mature filter there |
| Category filtered from browse chips? | **Yes by design** — `adult-lifestyle` not in `BACKEND_PODCAST_CATEGORY_SLUGS` |
| API returns nothing without `includeMature`? | **Yes** — proven below |

---

## 11. API comparison

| Item | Metro (HEAD `3fe6c9f`) | Production submitted (`7288de6`) |
| --- | --- | --- |
| Mature Podcast visible (entry card) | Yes | Yes (same UI pattern in that SHA) |
| Mature catalog after unlock | Backend paginated (~1761) | Seed path (~1 adult show) |
| Age gate enabled | Client AsyncStorage | Same mechanism |
| `includeMature=true` on mature catalog fetch | Yes (`fetchMaturePodcastShows`) | **Not used by mature page** |
| Feature flag | None | None |
| Environment | Dev client + Metro JS | Store IPA embedded JS |
| API host | `https://admin.hiddentunes.com` | Same hardcoded host |
| Podcast endpoint | `/api/podcasts/shows` | Same |
| Returned mature count (backend) | **1761** when correctly queried | Backend identical; **client did not query it** |

### Metro vs Production comparison table (required)

| Item | Metro | Production Build (submitted 1.0.191) |
| --- | --- | --- |
| Mature Podcast visible | Yes (card + backend catalog when unlocked) | Card yes; **backend mature catalog no** |
| Age gate enabled | Client consent required for catalog/play | Same |
| `includeMature=true` | Sent by mature catalog hook | Not sent by mature page (seed-only) |
| Feature flag | None | None |
| Environment | Dev client / Metro HEAD | Store IPA `7288de6` |
| API host | `https://admin.hiddentunes.com` | `https://admin.hiddentunes.com` |
| Podcast endpoint | `/api/podcasts/shows` | Same host/path available |
| Returned mature count | Client can load **1761** | Client capped to **1 seed** |

---

## 12. Backend comparison

Probed production host with the same mature request the fixed client uses:

| Request | HTTP | Result |
| --- | --- | --- |
| `GET /api/podcasts/shows?category=adult-lifestyle&includeMature=true&page=1&limit=40` | **200** | `success=true`, shows=40, **total=1761**, page=1, hasMore=true |
| `GET /api/podcasts/shows?category=adult-lifestyle&includeMature=false&page=1&limit=40` | **200** | `success=true`, shows=[], **total=0** |
| `GET /api/podcasts/shows?page=1&limit=5&includeMature=false` | **200** | safe catalog total=2367 |
| `GET /api/podcasts/categories` | **200** | categories=10 |

**Backend does not hide the mature catalog.** It returns it only when `includeMature=true` (and for adult-lifestyle category). Production backend is fine.

---

## 13. Exact root cause

**One proven cause:**

The TestFlight / App Store Connect binary that was submitted is **iOS build `1.0.191` (EAS `90538e1d`) from commit `7288de6`**, which **does not contain** the mature backend catalog restore (`f6176ce`). That binary’s Mature screen still loads **local podcast seeds only** (`getMaturePodcastPageSections` → **1** adult seed).  

Metro serves **current HEAD `3fe6c9f`**, which **does contain** `f6176ce` and loads **`/api/podcasts/shows?category=adult-lifestyle&includeMature=true`** (backend total **1761**).  

Therefore Mature “works” under Metro and appears missing / empty on the submitted production build because **the submitted build predates the mature catalog fix**, not because of a production feature flag, age-gate removal of the route, backend filtering, OTA mismatch, or wrong API host.

**Ruled out with evidence:**

- Wrong latest EAS commit for `1.0.193` — that IPA **has** the fix, but it is **not** the proven submitted ASC binary (`1.0.191`).
- Production EAS env feature flag — none for mature.
- Backend hiding mature — returns 1761 with `includeMature=true`.
- OTA channel mismatch — `expo-updates` not installed; no runtimeVersion/channel.
- Route deleted in standalone builds — mature page + card exist in `7288de6`.

---

## 14. Required fix

1. **Install / distribute the IPA that already contains the fix:** EAS build `70003e63` / iOS **`1.0.193`** / SHA **`3fe6c9f`** (or submit that exact build to App Store Connect / TestFlight if not already the active TestFlight build).
2. On device, confirm TestFlight shows build number **`1.0.193`** (not `1.0.191`).
3. Unlock Mature Podcasts 18+ (Profile or Mature screen toggle + consent).
4. Confirm catalog loads with backend pagination (thousands total, not a single seed show).

No additional mature feature-flag or backend change is required for this specific defect.

---

## 15. Whether a new build is actually required

| Question | Answer |
| --- | --- |
| Is new **source** work required? | **No** for this root cause — fix already landed in `f6176ce` and is in HEAD/`1.0.193`. |
| Is a new **EAS compile** required? | **No**, if `70003e63` (`1.0.193`) is submitted/installed. **Yes**, only if that IPA is discarded/expired or never submitted and TestFlight remains on `1.0.191`. |
| Is **submit / TestFlight update** required? | **Yes** — device must leave submitted `1.0.191` (`7288de6`) and run a binary that includes `f6176ce` (e.g. `1.0.193`). |

---

## Phase checklist index

1. Workspace proof — §1  
2. Build proof — §2  
3. Build SHA — §3  
4. Local SHA — §4  
5. Remote SHA — §5  
6. Build contained fixes? — §6  
7. Metro configuration — §7  
8. Production configuration — §8  
9. Feature flags — §9  
10. Navigation conditions — §10  
11. API comparison — §11  
12. Backend comparison — §12  
13. Exact root cause — §13  
14. Required fix — §14  
15. New build required? — §15  

**No code was modified for this audit.**
