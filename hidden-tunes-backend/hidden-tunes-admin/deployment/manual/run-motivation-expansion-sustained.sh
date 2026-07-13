#!/usr/bin/env bash
# Hidden Tunes — Sustained Motivationals expansion toward 200k healthy public.
# Writes pending imports only. Never auto-promotes.
#
# Dry-run one round (safe):
#   bash deployment/manual/run-motivation-expansion-sustained.sh
#
# Write pending imports (foreground):
#   APPLY_WRITES=true ROUNDS=5 bash deployment/manual/run-motivation-expansion-sustained.sh
#
# Write in background:
#   nohup env APPLY_WRITES=true ROUNDS=50 LIMIT=200 bash deployment/manual/run-motivation-expansion-sustained.sh \
#     >> logs/motivation-expansion-sustained.log 2>&1 &

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
LOCK_FILE="/tmp/hidden-tunes-motivation-expansion-sustained.lock"
APPLY_WRITES="${APPLY_WRITES:-false}"
ROUNDS="${ROUNDS:-1}"
BATCH_NUMBER="${BATCH_NUMBER:-20}"
LIMIT="${LIMIT:-200}"
PAUSE_MS="${PAUSE_MS:-3000}"
TARGET="${TARGET:-200000}"
LOG_DIR="${LOG_DIR:-logs}"

cleanup() {
  rm -f "${LOCK_FILE}"
}
trap cleanup EXIT INT TERM

if [[ -f "${LOCK_FILE}" ]]; then
  echo "ERROR: Sustained expansion lock exists (${LOCK_FILE})."
  exit 1
fi
echo "$$" > "${LOCK_FILE}"

cd "${PROJECT_DIR}"
mkdir -p "${LOG_DIR}"

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

MODE_ARGS=(--dry-run)
if [[ "${APPLY_WRITES}" == "true" ]]; then
  MODE_ARGS=(--execute)
fi

echo "============================================================================="
echo "Motivationals Sustained Expansion"
echo "APPLY_WRITES=${APPLY_WRITES}  ROUNDS=${ROUNDS}  BATCH=${BATCH_NUMBER}  LIMIT=${LIMIT}"
echo "TARGET healthy public=${TARGET}"
echo "============================================================================="

npm run motivation:expansion:pipeline -- \
  "${MODE_ARGS[@]}" \
  --rounds "${ROUNDS}" \
  --batch "${BATCH_NUMBER}" \
  --limit "${LIMIT}" \
  --pause-ms "${PAUSE_MS}" \
  --target "${TARGET}"

echo ""
echo "============================================================================="
echo "Sustained expansion round complete."
if [[ "${APPLY_WRITES}" == "true" ]]; then
  echo "Pending writes may have been inserted. Public promotions must remain 0."
  echo "Review: bash deployment/manual/review-pending-motivationals.sh"
else
  echo "Dry-run only. To write: APPLY_WRITES=true ROUNDS=${ROUNDS} bash $0"
fi
echo "============================================================================="
