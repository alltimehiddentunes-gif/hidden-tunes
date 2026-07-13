#!/usr/bin/env bash
# Hidden Tunes — Read-only audit of existing public Motivationals
# Does not demote, hide, or modify any records.

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"

cd "${PROJECT_DIR}"

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

echo "============================================================================="
echo "Motivationals Public Catalog Audit (READ-ONLY)"
echo "============================================================================="

echo ""
echo "--- Running classifier audit ---"
npm run motivation:audit-public

REPORT="data/motivation-public-audit-report.json"
if [[ ! -f "${REPORT}" ]]; then
  echo "ERROR: Expected report not found: ${REPORT}"
  exit 1
fi

echo ""
echo "--- Audit report ---"
cat "${REPORT}"

echo ""
echo "--- Promotion review (read-only, no --apply) ---"
npm run motivation:promotion:review

echo ""
echo "============================================================================="
echo "WATCHLIST — review these titles manually:"
echo "  MIT15.969F04"
echo "  MIT How To Speak, IAP 2018"
echo "  MIT Cryptocurrency Engineering"
echo "  The Light Of Faith"
echo "  Mindwarz Videos"
echo ""
echo "Classifier decisions to inspect:"
echo "  accept | hold | reject | route_lectures | route_podcasts | route_films"
echo ""
echo "No public changes were made by this script."
echo "Use deployment/manual/motivation-public-demotion-template.sql for manual demotion."
echo "============================================================================="
