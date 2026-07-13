#!/usr/bin/env bash
# Hidden Tunes — Read-only pending Motivationals promotion review
# Does NOT run promotion:apply.

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"

cd "${PROJECT_DIR}"

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REVIEW_FILE="data/motivation-promotion-review-${TIMESTAMP}.json"

echo "============================================================================="
echo "Motivationals Promotion Review (READ-ONLY)"
echo "============================================================================="

echo ""
echo "--- Catalog status ---"
npm run motivation:status

echo ""
echo "--- Promotion review (no --apply) ---"
npm run motivation:promotion:review | tee "${REVIEW_FILE}"

echo ""
echo "Review saved to: ${REVIEW_FILE}"
echo ""
echo "============================================================================="
echo "No public changes were made."
echo "Review the JSON report manually before any promotion command."
echo "Do NOT run: npm run motivation:promotion:apply"
echo "============================================================================="
