# Premium Synced Lyrics Infrastructure

Dev/admin-only premium synced lyrics editor backed by a dedicated `synced_lyrics` table. Existing `track_lyrics` columns and legacy lyrics pages remain intact.

## Files added / updated

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260524180000_synced_lyrics.sql` | Database table + indexes |
| `lib/syncedLyricsTypes.ts` | Shared JSON/LRC types + interlude presets |
| `lib/syncedLyricsUtils.ts` | Parse/generate LRC, JSON↔LRC, sanitize, auto modes |
| `app/api/admin/tracks/[trackId]/synced-lyrics/route.ts` | GET / POST / PATCH API |
| `components/PremiumSyncedLyricsEditorPage.tsx` | Premium sync editor UI |
| `app/admin/releases/[id]/tracks/[trackId]/synced-lyrics/page.tsx` | Route wrapper |

**Unchanged (backward compatible):**
- `/api/admin/releases/[id]/tracks/[trackId]/lyrics` — plain + raw LRC editor
- `/admin/releases/[id]/tracks/[trackId]/sync-lyrics` — manual sync editor
- `/admin/releases/[id]/tracks/[trackId]/lyrics` — plain lyrics
- `PlayerContext`, mobile playback, upload flow, R2 structure

On save, premium API **mirrors** LRC/plain text into `track_lyrics` so existing read paths keep working.

---

## Install steps

### 1. Apply Supabase migration

In Supabase SQL editor (or CLI), run:

```
hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260524180000_synced_lyrics.sql
```

Or with Supabase CLI from `hidden-tunes-admin`:

```bash
cd hidden-tunes-backend/hidden-tunes-admin
supabase db push
```

### 2. Install dependencies (if needed)

```bash
cd hidden-tunes-backend/hidden-tunes-admin
npm install
```

### 3. Run admin locally

```bash
npm run dev
```

### 4. Open premium editor

1. Log in as owner or upload_manager
2. Go to **Admin → Releases → [release]**
3. Click **Edit Synced Lyrics** on a track with audio uploaded
4. Route: `/admin/releases/{releaseId}/tracks/{trackId}/synced-lyrics`

---

## API

### GET `/api/admin/tracks/{trackId}/synced-lyrics`

- Auth: Bearer token + `requireUploadPermission`
- Returns track/release metadata + `syncedLyrics` payload
- Falls back to `track_lyrics` if no `synced_lyrics` row (never crashes on malformed JSON)

### POST `/api/admin/tracks/{trackId}/synced-lyrics`

- Creates first row (409 if already exists)

### PATCH `/api/admin/tracks/{trackId}/synced-lyrics`

- Upserts JSON + LRC + plain lyrics, increments `version`
- Mirrors to `track_lyrics.synced_lrc` for backward compatibility

**JSON line format:**

```json
[
  { "time": 12.42, "text": "I still hear your footsteps", "type": "lyric" },
  { "time": 48.10, "text": "♪ Instrumental ♪", "type": "instrumental" }
]
```

---

## Test checklist

- [ ] Migration applied — `synced_lyrics` table exists
- [ ] GET returns 401 without token
- [ ] GET returns track + lyrics for upload_manager / owner
- [ ] Premium editor loads with artwork + audio
- [ ] Plain lyrics textarea populates parsed lines
- [ ] **Space** stamps current line timestamp
- [ ] **Enter** skips line, **Backspace** undoes stamp
- [ ] **← / →** seek ±3 seconds
- [ ] Interlude buttons insert Instrumental / Guitar Solo / etc.
- [ ] Even timestamp mode + smart spacing helper work
- [ ] Autosave after edits (version increments)
- [ ] Manual Save shows success toast
- [ ] LRC export shows `[MM:SS.CS]♪ Instrumental ♪` format
- [ ] Legacy **Edit Plain Lyrics** + **Sync Lyrics** pages still work
- [ ] `track_lyrics.synced_lrc` updated after premium save
- [ ] Mobile playback / PlayerContext untouched

---

## Git commands

```bash
cd C:/Users/Wills/Desktop/HiddenTunes

git add hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260524180000_synced_lyrics.sql
git add hidden-tunes-backend/hidden-tunes-admin/lib/syncedLyricsTypes.ts
git add hidden-tunes-backend/hidden-tunes-admin/lib/syncedLyricsUtils.ts
git add hidden-tunes-backend/hidden-tunes-admin/app/api/admin/tracks/[trackId]/synced-lyrics/route.ts
git add hidden-tunes-backend/hidden-tunes-admin/components/PremiumSyncedLyricsEditorPage.tsx
git add hidden-tunes-backend/hidden-tunes-admin/app/admin/releases/[id]/tracks/[trackId]/synced-lyrics/page.tsx
git add docs/synced-lyrics-infrastructure.md

git commit -m "Add premium synced lyrics infrastructure for admin editor."

git push -u origin HEAD
```

---

## Mobile prep (Phase 6)

Utilities in `lib/syncedLyricsUtils.ts` are shared-ready:

- `parseLrcToSyncedLines` / `generateLrcFromSyncedLines`
- `jsonToLrc` / `lrcToJson`
- `sanitizeSyncedLyricsJson` / `sortSyncedLyricsByTime`

**Not integrated into PlayerContext yet** — intentional per scope.
