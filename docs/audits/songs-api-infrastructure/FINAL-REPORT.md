# Songs API Infrastructure Audit (read-only)

**Date:** 2026-07-30  
**Workspace:** `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`  
**Branch:** `fix/library-content-type-safe` @ `5f8771e`  
**Rule:** No application code modified during this audit.

---

## 1. Mobile runtime songs search path (proven)

```text
app/search.tsx
  → searchHiddenTunesSongs(...)   // import from services/hiddenTunesApi
    → HIDDEN_TUNES_API_BASE_URL + "/api/songs?page=1&limit=…&q=…"
```

### Exact base URL used at runtime

```ts
// services/hiddenTunesApi.ts (hardcoded — not env-driven)
const HIDDEN_TUNES_API_BASE_URL = "https://hidden-tunes-api.onrender.com";
```

| Check | Evidence |
| --- | --- |
| Env override for songs API? | **None** — no `EXPO_PUBLIC_*` music/songs API URL |
| Active `.env` / `.env.local` | Sports flags only (+ example has Supabase anon keys) |
| Auth on songs search request? | None (Accept JSON only) |

**Conclusion:** Whatever the intended infra is, **this mobile build’s live Search song requests go to Render’s hostname**, because that string is hardcoded in source.

---

## 2. Backend ownership map

| Surface | Repository / path | Host (live) | Platform |
| --- | --- | --- | --- |
| Express `/api/songs` (music) | `HiddenTunes/hidden-tunes-backend` (`server.js`, `routes/songs.js`) | Mobile points at `hidden-tunes-api.onrender.com` | **Stale mobile config → Render hostname** (service suspended) |
| Intended VPS Express (docs) | Same repo: `ecosystem.config.cjs` | Suggested `api.hiddentunes.com` → `127.0.0.1:4000` | **VPS + PM2** (documented as “Render replacement”) |
| Admin catalogues (TV/Radio/Podcasts/…) | `hidden-tunes-backend/hidden-tunes-admin` | `admin.hiddentunes.com` → `148.230.109.215` | **VPS + PM2 (`hidden-tunes-admin`)** |
| Datastore | Supabase project `kojcyswxfuikxmqntwye` | Used by Express via `SUPABASE_*` | **Supabase** (not anonymous public songs API) |
| Legacy static fallback | `services/hiddenTunes.ts` → `https://hiddentunes.com/songs.json` | `hiddentunes.com` | Marketing/hosting IPs; **403** from this probe |
| Alternate client helper | `services/api.ts` / `constants/api.ts` | `https://hiddentunes.com/api` | **Not** used by Search screen song path |

Admin has **no** public `/api/songs?q=` (404). Music Express and Admin Next are separate processes.

---

## 3. Live probes (this audit)

| Target | Result |
| --- | --- |
| `hidden-tunes-api.onrender.com/api/songs?q=afrobeats` | **503** + `x-render-routing: suspend` |
| `admin.hiddentunes.com/api/songs` | **404** |
| `api.hiddentunes.com` | **DNS does not exist** |
| `http://148.230.109.215:4000/health` | **Timeout** (songs PM2 not publicly reachable / not listening) |
| `http://148.230.109.215/api/songs` | **404** (nginx/admin surface, no songs route) |
| `hiddentunes.com/api/songs` | **403** |
| `hiddentunes.com/songs.json` | **403** |
| Supabase REST `/songs` without key | **401** (expected) |
| Local Express (`PORT=4010`) against same repo | **200** with real Afrobeats rows |

---

## 4. Stale Render configuration

| Location | Status |
| --- | --- |
| `services/hiddenTunesApi.ts` hardcoded onrender URL | **Still used** by Search |
| `hidden-tunes-desktop/src/lib/api.ts` onrender URL | Desktop still references it |
| `app/admin/upload.tsx` → `hidden-tunes-backend.onrender.com` | Separate admin upload host string |
| `render.yaml` in backend | Blueprint for old Render deploy |
| `ecosystem.config.cjs` | Explicitly labeled **“PM2 config for VPS Express catalog API (Render replacement)”** |
| Mobile references to `api.hiddentunes.com` | **Zero** |

**Why Cursor previously treated Render as authoritative:** the mobile Search code path **literally hardcodes** that hostname. That is source-of-truth for *what the app calls*, not a guess. It does **not** prove Render is the infra you want or currently operate.

**Stale-config contribution:** Backend docs/PM2 already describe a **VPS replacement**, but mobile (and desktop) were never retargeted to `api.hiddentunes.com` / the VPS, and that DNS name does not exist yet. Result: app still hammers a suspended Render service.

---

## 5. Answers required by the brief

### Actual production songs API (as shipped in this mobile app)

```text
https://hidden-tunes-api.onrender.com/api/songs
```

Hardcoded. No env switch.

### Deployment platform the app currently addresses

Render hostname (suspended). **Not** verified as an active operator-managed service if you no longer use Render.

### Intended / documented replacement (not live for mobile)

```text
VPS Express PM2 app `hidden-tunes-api`
Suggested public host: api.hiddentunes.com → 127.0.0.1:4000
Repo: HiddenTunes/hidden-tunes-backend
```

Not reachable today (no DNS; :4000 timeout).

### Working production backend for *other* media

```text
admin.hiddentunes.com on VPS 148.230.109.215 (PM2 hidden-tunes-admin)
```

### Repository for songs Express API

```text
C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend
```

### Runtime configuration for song search

Hardcoded constants in `hiddenTunesApi.ts` — **not** `.env`.

---

## 6. Safety / next steps (no code yet)

Do **not** resume Render if it is out of scope.

Before changing mobile:

1. Confirm where Express `hidden-tunes-api` should run on the VPS (PM2 process name, nginx site, public hostname).
2. Create/point DNS (e.g. `api.hiddentunes.com` → `148.230.109.215`) and proxy `/api/songs`.
3. Prove production `GET /api/songs?q=afrobeats` returns 200.
4. Only then retarget mobile `HIDDEN_TUNES_API_BASE_URL` (preferably via `EXPO_PUBLIC_` config) away from onrender.

Until step 3 is live, Search cannot receive music payloads regardless of mobile logic quality.
