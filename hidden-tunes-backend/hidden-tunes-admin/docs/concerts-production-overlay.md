# Concerts production overlay reproducibility (Batch 2)

## Problem
Production runs `deploy/sports-private-pilot` while Concerts code was deployed as a file overlay. A failed `next build` that wipes `.next` can take TV/Sports/Concerts offline.

## Rules (do this every deploy)
1. Never switch the production branch for Concerts-only updates.
2. Never run `npm run build` if it calls `clean-next-build.mjs` without a `.next` backup.
3. Use `scripts/safe-concerts-production-build.sh` on the VPS.
4. Verify TV + Sports + Concerts health endpoints before declaring success.
5. Keep Concerts overlay files in a reproducible tarball under `/root/hidden-tunes-safety-backups/concerts-overlay-YYYYMMDD.tgz`.

## Overlay sync command (from local concerts branch)
```bash
# on local machine, from hidden-tunes-admin
tar -czf /tmp/concerts-overlay.tgz \
  lib/concerts app/api/concerts \
  scripts/run-concerts-*.ts scripts/seed-concert-sources.ts \
  scripts/resolve-concert-*.ts scripts/safe-concerts-production-build.sh \
  scripts/apply-concerts-migration.mjs \
  supabase/migrations/*concert*

scp /tmp/concerts-overlay.tgz root@PRODUCTION:/tmp/
ssh root@PRODUCTION 'cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin && tar -xzf /tmp/concerts-overlay.tgz && bash scripts/safe-concerts-production-build.sh'
```

## Controlled integration later (not this batch)
After Sports pilot settles, cherry-pick only Concerts commits onto a dedicated production integration branch. Do not merge unrelated local dirty WIP.
