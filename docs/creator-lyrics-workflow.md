# Creator Lyrics Workflow

Hidden Tunes admin and creator roles can edit plain and synced lyrics for catalog tracks they are allowed to manage. Permissions are enforced on the API — UI hiding alone is not sufficient.

## Roles and access

| Role | Plain + synced lyrics |
| --- | --- |
| `owner`, `admin` | All tracks |
| `upload_manager`, `uploader`, `creator` | Tracks where `songs.uploaded_by_user_id` or `albums.uploaded_by_user_id` matches their profile id |
| `artist` | Tracks linked via `artist_submissions.published_song_id` where `artist_user_id` matches |
| `moderator` | No lyrics editing |
| Listener (mobile app) | Read-only; no public editing |

## UI entry points

- **Creator hub:** `/admin/creator/lyrics` — lists editable tracks for the signed-in user and links to editors.
- **Existing admin editors (unchanged paths):**
  - Plain: `/admin/releases/[id]/tracks/[trackId]/lyrics`
  - Legacy sync: `/admin/releases/[id]/tracks/[trackId]/sync-lyrics`
  - Premium synced (Auto Sync): `/admin/releases/[id]/tracks/[trackId]/synced-lyrics`

Nav item **Creator Lyrics** appears for roles in `CREATOR_LYRICS_ROLES` (`lib/adminPermissions.ts`).

## API routes

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/api/admin/creator/lyrics-tracks` | `requireCreatorLyricsPermission` |
| GET/PUT | `/api/admin/releases/[id]/tracks/[trackId]/lyrics` | `requireTrackLyricsPermission` |
| GET/PUT/DELETE | `/api/admin/tracks/[trackId]/synced-lyrics` | `requireTrackLyricsPermission` |
| GET | `/api/admin/releases?mine=1` | Non-admin users auto-filter to `uploaded_by_user_id = profile.id` |

Unauthorized track edits return **403**. Missing tracks return **404**.

## Ownership evaluation

Implemented in `lib/trackLyricsAccess.ts`:

1. Admin/owner → allow all.
2. Song `uploaded_by_user_id` → allow.
3. Album `uploaded_by_user_id` → allow.
4. `artist_submissions` with matching `artist_user_id` and `published_song_id` → allow.
5. Otherwise → forbid.

## Artist ownership scaffold

There is **no** `artists.owner_user_id` column today. Artist lyrics access uses published submission songs only:

```sql
artist_submissions.artist_user_id = current_user_id
AND artist_submissions.published_song_id = songs.id
```

### Future migration (recommended)

When direct artist–catalog ownership is needed beyond submissions:

```sql
-- Example future column; do not run until product confirms mapping rules
ALTER TABLE artists ADD COLUMN owner_user_id uuid REFERENCES auth.users(id);
CREATE INDEX idx_artists_owner_user_id ON artists(owner_user_id);
```

Then extend `evaluateTrackLyricsAccess` to allow edits when the track’s release artist row matches `owner_user_id`. Until then, artist accounts rely on submission publish links.

## Database

No destructive schema changes. Saves use existing columns/tables:

- `track_lyrics` — `plain_lyrics`, `synced_lrc`, `lyrics_type`, etc.
- `songs` — `has_lyrics`, `lyrics_type`, `lyrics_url` mirrors

Mobile playback reads the same stored format; this phase does not modify the mobile playback engine.

## Assisted Auto Sync

Premium synced editor (`PremiumSyncedLyricsEditorPage`) supports:

- Load plain lyrics
- Auto-spread timestamps from track duration
- Per-line timestamp edits
- Shift all timestamps
- Insert instrumental gaps
- LRC preview
- Save synced lyrics

## Manual test checklist

1. Admin edits lyrics for any track.
2. Uploader edits lyrics for own uploaded track.
3. Uploader gets 403 on another uploader’s track.
4. Artist hub lists only published submission songs (when mapping exists).
5. Auto Sync produces valid LRC and saves.
6. Saved lyrics appear on mobile (unchanged consumer path).

## Validation

```bash
cd hidden-tunes-backend/hidden-tunes-admin
npx tsc --noEmit
```

Mobile `tsc` is not required unless `hidden-tunes-app` is modified.
