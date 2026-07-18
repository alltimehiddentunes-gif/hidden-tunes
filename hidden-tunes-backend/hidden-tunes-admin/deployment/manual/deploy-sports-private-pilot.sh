#!/usr/bin/env bash
# Hidden Tunes — Private Sports VPS pilot deployment
# Run on production VPS. Does not enable public Sports flags.
# Prerequisites: Sports SQL migrations already applied via psql.

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
BRANCH="${SPORTS_DEPLOY_BRANCH:-deploy/sports-private-pilot}"

echo "============================================================================="
echo "Hidden Tunes — Sports Private Pilot Deployment"
echo "============================================================================="

cd /var/www/hidden-tunes
echo "Repo: $(pwd)"
echo "Current HEAD: $(git rev-parse HEAD) ($(git rev-parse --abbrev-ref HEAD))"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}" || true

cd "${PROJECT_DIR}"
echo "Working directory: $(pwd)"
echo "Deploy HEAD: $(git rev-parse HEAD)"
git log -1 --oneline

echo ""
echo "--- npm ci ---"
npm ci

echo ""
echo "--- Load production environment ---"
if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
  echo "Loaded .env.production (values not printed)."
else
  echo "ERROR: .env.production not found"
  exit 1
fi

# Hard deny live / commercial ScoreBat entitlement in this pilot
export SPORTS_SCOREBAT_LIVE_ENTITLEMENT_CONFIRMED=false
export SPORTS_SCOREBAT_COMMERCIAL_USE_CONFIRMED=false

echo ""
echo "--- Sports unit tests ---"
npm run test:sports-foundation
npm run test:sports-playback
npm run test:sports-scorebat
npm run test:sports-provider
npm run test:sports-home-ia
npm run test:sports-personalization

echo ""
echo "--- TypeScript ---"
npx tsc --noEmit

echo ""
echo "--- Production build ---"
npm run build

echo ""
echo "--- Restart PM2 (admin only) ---"
pm2 restart hidden-tunes-admin --update-env
pm2 status hidden-tunes-admin

echo ""
echo "============================================================================="
echo "Code deploy complete. Run post-deploy smoke next."
echo "============================================================================="
