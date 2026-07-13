#!/usr/bin/env bash
# Hidden Tunes — Playable-first Motivationals sustained import toward 200k.
#
# Dry-run (default):
#   bash deployment/manual/run-motivation-playable-sustained.sh
#
# Production writes:
#   APPLY_WRITES=true ROUNDS=100 bash deployment/manual/run-motivation-playable-sustained.sh
#
# Background:
#   nohup env APPLY_WRITES=true ROUNDS=500 SOURCE_LIMIT=1000 \
#     bash deployment/manual/run-motivation-playable-sustained.sh \
#     >> logs/motivation-playable-sustained.log 2>&1 &

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
LOCK_FILE="/tmp/hidden-tunes-motivation-playable-sustained.lock"

TARGET_ITEMS="${TARGET_ITEMS:-200000}"
SOURCE_LIMIT="${SOURCE_LIMIT:-1000}"
INSERT_BATCH_SIZE="${INSERT_BATCH_SIZE:-200}"
PROBE_CONCURRENCY="${PROBE_CONCURRENCY:-6}"
MAX_PAGES="${MAX_PAGES:-5}"
ROUNDS="${ROUNDS:-1}"
APPLY_WRITES="${APPLY_WRITES:-false}"
RESUME="${RESUME:-true}"
PAUSE_MS="${PAUSE_MS:-2000}"
LOG_DIR="${LOG_DIR:-logs}"

cleanup() {
  rm -f "${LOCK_FILE}"
}
trap cleanup EXIT INT TERM

if [[ -f "${LOCK_FILE}" ]]; then
  echo "ERROR: Playable sustained lock exists (${LOCK_FILE})."
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

RESUME_ARGS=()
if [[ "${RESUME}" != "true" ]]; then
  RESUME_ARGS=(--no-resume)
fi

echo "============================================================================="
echo "Motivationals Playable-First Sustained Import"
echo "APPLY_WRITES=${APPLY_WRITES}  RESUME=${RESUME}  ROUNDS=${ROUNDS}"
echo "TARGET_ITEMS=${TARGET_ITEMS}  SOURCE_LIMIT=${SOURCE_LIMIT}"
echo "INSERT_BATCH_SIZE=${INSERT_BATCH_SIZE}  PROBE_CONCURRENCY=${PROBE_CONCURRENCY}"
echo "============================================================================="

npm run motivation:playable:pipeline -- \
  "${MODE_ARGS[@]}" \
  "${RESUME_ARGS[@]}" \
  --rounds "${ROUNDS}" \
  --target "${TARGET_ITEMS}" \
  --source-limit "${SOURCE_LIMIT}" \
  --insert-batch-size "${INSERT_BATCH_SIZE}" \
  --probe-concurrency "${PROBE_CONCURRENCY}" \
  --max-pages "${MAX_PAGES}" \
  --pause-ms "${PAUSE_MS}"

echo ""
echo "============================================================================="
echo "Playable sustained import cycle complete."
if [[ "${APPLY_WRITES}" == "true" ]]; then
  echo "Post-import jobs (optional):"
  echo "  npm run motivation:post-import:classify"
  echo "  npm run motivation:post-import:rights"
  echo "  npm run motivation:post-import:health"
fi
echo "============================================================================="
