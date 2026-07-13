#!/usr/bin/env bash
# Hidden Tunes — Motivationals expansion VPS deployment (manual reference)
# Run on production VPS as the deploy user. Contains no secrets.

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
EXPECTED_COMMIT="5fa65d1"

echo "============================================================================="
echo "Hidden Tunes — Motivationals Expansion Deployment"
echo "============================================================================="
echo ""
echo "IMPORTANT: Run the following in Supabase SQL Editor BEFORE this script:"
echo "  deployment/manual/motivation-expansion-quality-production.sql"
echo ""
echo "Then verify with:"
echo "  deployment/manual/motivation-expansion-quality-verify.sql"
echo ""
read -r -p "Press Enter after Supabase migration is complete, or Ctrl+C to abort..."

cd "${PROJECT_DIR}"
echo "Working directory: $(pwd)"

echo ""
echo "--- Git status ---"
git status --short

echo ""
echo "--- HEAD commit ---"
git rev-parse HEAD
git log -1 --oneline

CURRENT_SHORT="$(git rev-parse --short HEAD)"
if [[ "${CURRENT_SHORT}" != "${EXPECTED_COMMIT}" ]]; then
  echo "WARNING: HEAD (${CURRENT_SHORT}) does not match expected (${EXPECTED_COMMIT})."
  echo "Confirm you intend to deploy this commit before continuing."
  read -r -p "Continue anyway? [y/N] " CONFIRM
  if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

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
  echo "WARNING: .env.production not found. Ensure Supabase env vars are set."
fi

echo ""
echo "--- TypeScript validation ---"
npx tsc --noEmit

echo ""
echo "--- Motivationals tests ---"
npm run test:motivation-classifier
npm run test:motivation-normalization
npm run test:motivation-scale
npm run test:motivation-expansion-safety
npm run test:motivation-public
npm run test:motivation-quality

echo ""
echo "--- Production build ---"
npm run build

echo ""
echo "--- Restart PM2 ---"
pm2 restart hidden-tunes-admin --update-env

echo ""
echo "--- PM2 status ---"
pm2 status

echo ""
echo "============================================================================="
echo "Deployment complete."
echo "Next: bash deployment/manual/verify-motivation-production.sh"
echo "============================================================================="
