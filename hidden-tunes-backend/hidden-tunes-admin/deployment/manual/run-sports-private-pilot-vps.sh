#!/usr/bin/env bash
# Sports private pilot — VPS preflight, migrate, seed, deploy
# Does NOT stash/reset/clean. Preserves unrelated dirty files.
# Creates local commit on deploy/sports-private-pilot with Sports-only paths.

set -euo pipefail

REPO=/var/www/hidden-tunes
ADMIN="${REPO}/hidden-tunes-backend/hidden-tunes-admin"
BRANCH=deploy/sports-private-pilot
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/var/backups/hidden-tunes
mkdir -p "${BACKUP_DIR}"

cd "${ADMIN}"
set -a
# shellcheck disable=SC1091
source .env.production
set +a

echo "=== PREFLIGHT ==="
echo "HEAD=$(cd "${REPO}" && git rev-parse HEAD)"
echo "BRANCH=$(cd "${REPO}" && git rev-parse --abbrev-ref HEAD)"
pm2 jlist | python3 -c 'import json,sys; d=json.load(sys.stdin); p=next(x for x in d if x["name"]=="hidden-tunes-admin"); print("pm2", p["pm2_env"]["status"], "restarts", p["pm2_env"].get("restart_time"))'

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select pg_size_pretty(pg_database_size(current_database())) as db_size;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select count(*) as active_connections from pg_stat_activity where datname=current_database();"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select to_regclass('public.sports') as sports, to_regclass('public.sports_fixtures') as fixtures;"

BACKUP="${BACKUP_DIR}/pre-sports-pilot-${STAMP}.sql"
echo "Creating full schema backup at ${BACKUP}"
pg_dump "$DATABASE_URL" --schema-only > "${BACKUP}"
ls -lah "${BACKUP}"

echo "=== FETCH + LOCAL SPORTS COMMIT ==="
cd "${REPO}"
BEFORE_HEAD=$(git rev-parse HEAD)
git fetch origin "${BRANCH}"

# Ensure we are on a sports deploy branch based on current production HEAD
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git checkout "${BRANCH}"
else
  git checkout -b "${BRANCH}"
fi

# Bring Sports trees from origin branch (paths only)
git checkout "origin/${BRANCH}" -- \
  hidden-tunes-backend/hidden-tunes-admin/lib/sports \
  hidden-tunes-backend/hidden-tunes-admin/app/api/sports \
  hidden-tunes-backend/hidden-tunes-admin/app/admin/sports \
  hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260717210000_sports_foundation.sql \
  hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260718040000_sports_playback_validation.sql \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-foundation.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-olympics-provider.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-home-ia.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-personalization.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-scorebat.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-playback-resolver.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/validate-sports-migration.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/run-sports-import-provider.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/run-sports-validate-live-broadcasts.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/smoke-sports-olympics-staging.ts \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/sports-private-pilot.rollback.sql \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/sports-private-pilot-seed.sql \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/sports-private-pilot-verify.sql \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/deploy-sports-private-pilot.sh \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/run-sports-private-pilot-vps.sh

# Merge sports scripts into working package.json for npm test commands.
# Do NOT commit package.json — VPS copy already has unrelated dirty changes.
python3 <<'PY'
import json, subprocess, pathlib
path = pathlib.Path("hidden-tunes-backend/hidden-tunes-admin/package.json")
cur = json.loads(path.read_text())
src = json.loads(subprocess.check_output(
    ["git", "show", "origin/deploy/sports-private-pilot:hidden-tunes-backend/hidden-tunes-admin/package.json"],
    text=True,
))
keys = [k for k in src["scripts"] if "sports" in k.lower() or "scorebat" in k.lower() or "olympics" in k.lower()]
for k in keys:
    cur["scripts"][k] = src["scripts"][k]
path.write_text(json.dumps(cur, indent=2) + "\n")
print("merged scripts into working package.json (not committed):", keys)
PY

# AdminShell: only touch if clean relative to HEAD, then commit sports nav
if git diff --quiet HEAD -- hidden-tunes-backend/hidden-tunes-admin/components/AdminShell.tsx; then
  python3 <<'PY'
from pathlib import Path
p = Path("hidden-tunes-backend/hidden-tunes-admin/components/AdminShell.tsx")
text = p.read_text()
if 'href: "/admin/sports"' not in text:
    needle = '''    href: "/admin/tv/discovery",
    label: "TV Discovery",
    description: "Seed bulk discovery plans",
    roles: "all",
  },
  {
    href: "/admin/submissions",'''
    insert = '''    href: "/admin/tv/discovery",
    label: "TV Discovery",
    description: "Seed bulk discovery plans",
    roles: "all",
  },
  {
    href: "/admin/sports",
    label: "Sports",
    description: "Sports foundation ops",
    roles: "all",
  },
  {
    href: "/admin/submissions",'''
    if needle not in text:
        raise SystemExit("AdminShell needle not found — abort")
    p.write_text(text.replace(needle, insert, 1))
    print("AdminShell sports nav inserted")
else:
    print("AdminShell sports nav already present")
PY
  ADMINSHELL_OK=1
else
  echo "WARNING: AdminShell is dirty on VPS — skipping AdminShell commit; sports APIs still deploy."
  ADMINSHELL_OK=0
fi

# Stage ONLY sports-related paths (+ AdminShell if clean)
git add \
  hidden-tunes-backend/hidden-tunes-admin/lib/sports \
  hidden-tunes-backend/hidden-tunes-admin/app/api/sports \
  hidden-tunes-backend/hidden-tunes-admin/app/admin/sports \
  hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260717210000_sports_foundation.sql \
  hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260718040000_sports_playback_validation.sql \
  hidden-tunes-backend/hidden-tunes-admin/scripts/test-sports-*.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/validate-sports-migration.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/run-sports-*.ts \
  hidden-tunes-backend/hidden-tunes-admin/scripts/smoke-sports-olympics-staging.ts \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/sports-private-pilot*.sql \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/deploy-sports-private-pilot.sh \
  hidden-tunes-backend/hidden-tunes-admin/deployment/manual/run-sports-private-pilot-vps.sh

if [[ "${ADMINSHELL_OK}" == "1" ]]; then
  git add hidden-tunes-backend/hidden-tunes-admin/components/AdminShell.tsx
fi

# Refuse if staged set contains non-sports paths beyond AdminShell
BAD=$(git diff --cached --name-only | grep -vE 'sports|Sports|scorebat|olympics|Olympics|AdminShell\.tsx$' || true)
if [[ -n "${BAD}" ]]; then
  echo "Refusing to commit unrelated staged files:"
  echo "${BAD}"
  exit 1
fi

git commit -m "Deploy private Sports backend pilot (schema, APIs, ScoreBat highlights foundation)." || {
  echo "Commit skipped or failed — checking if sports already committed"
  git status --short | head -40
}

echo "DEPLOY_HEAD=$(git rev-parse HEAD)"
git log -1 --oneline

echo "=== APPLY MIGRATIONS ==="
cd "${ADMIN}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260717210000_sports_foundation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260718040000_sports_playback_validation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deployment/manual/sports-private-pilot-verify.sql

echo "=== SEED PILOT ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deployment/manual/sports-private-pilot-seed.sql

echo "=== TESTS ==="
export SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED=false
export SPORTS_SCOREBAT_COMMERCIAL_USE_CONFIRMED=false
npm run test:sports-foundation
npm run test:sports-playback
npm run test:sports-scorebat

echo "=== BUILD ==="
npx tsc --noEmit
npm run build

echo "=== PM2 RESTART ==="
pm2 restart hidden-tunes-admin --update-env
sleep 4
pm2 status hidden-tunes-admin

echo "=== DONE ==="
echo "BEFORE_HEAD=${BEFORE_HEAD}"
echo "DEPLOY_HEAD=$(cd "${REPO}" && git rev-parse HEAD)"
echo "BACKUP=${BACKUP}"
