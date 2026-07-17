# Artist Profile Phase 9 — Rollback Plan

Prepared before production SQL apply. Do not print secrets.

## Recorded production baseline (pre-Phase-9)

| Item | Value |
|---|---|
| Host | `srv1677509` (admin.hiddentunes.com / 148.230.109.215) |
| Workspace | `/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin` |
| Branch | `radio-mature-worldwide-expansion` |
| HEAD | `c2f71b8` |
| Rollback tag (existing) | `pre-catalog-hang-repair-20260717-091813` |
| PM2 process | `hidden-tunes-admin` |
| Pre-migration schema | All `artist_*` profile tables present; `artists` extended columns **absent**; `albums.release_type` **absent** |

## Code rollback

Prefer non-destructive restore:

1. Keep unrelated dirty production overlays untouched.
2. Restore only Artist Profile files from the pre-deploy file backup under `/root/hidden-tunes-safety-backups/`.
3. Rebuild if needed: `npm run build` in the production workspace (or previous `.next` backup).
4. `pm2 restart hidden-tunes-admin --update-env`

Do **not** use `git reset --hard` on the dirty production worktree.

## Database rollback

Migrations are additive / mostly idempotent (`IF NOT EXISTS`).

- There is **no** automatic down migration.
- Rollback = restore from the Phase 9 `pg_dump` custom archive.
- Restore command (after approval):

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" \
  /root/hidden-tunes-safety-backups/artist-profile-pre-phase9-YYYYMMDD-HHMM.dump
```

Data created after migration (new follows, ranking rows, similar scores) may be lost on restore.

## Trigger conditions

Roll back if:

- artist browse / profile returns persistent 500 after deploy
- follow/unfollow corrupts state
- schema verification fails
- PM2 restart loop
- protected catalog APIs regress
- stream URLs appear in browse metadata payloads
