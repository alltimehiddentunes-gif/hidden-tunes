#!/usr/bin/env bash
# Hidden Tunes — Controlled Motivationals expansion batches
# Default: dry-run only. Set APPLY_WRITES=true to write pending records.

set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
LOCK_FILE="/tmp/hidden-tunes-motivation-expansion.lock"
APPLY_WRITES="${APPLY_WRITES:-false}"
BATCH_NUMBER="${BATCH_NUMBER:-20}"
LIMIT="${LIMIT:-200}"
FAMILIES=(speeches commencement leadership mindset discipline fitness faith prelinger opensource)

cleanup() {
  rm -f "${LOCK_FILE}"
}
trap cleanup EXIT INT TERM

if [[ -f "${LOCK_FILE}" ]]; then
  echo "ERROR: Expansion lock exists (${LOCK_FILE}). Another job may be running."
  exit 1
fi
echo "$$" > "${LOCK_FILE}"

cd "${PROJECT_DIR}"

if [[ -f .env.production ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production
  set +a
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="data/motivation-expansion-batch-reports"
mkdir -p "${REPORT_DIR}"

echo "============================================================================="
echo "Motivationals Expansion Batches"
echo "APPLY_WRITES=${APPLY_WRITES}  BATCH=${BATCH_NUMBER}  LIMIT=${LIMIT}"
echo "============================================================================="

run_family() {
  local family="$1"
  local mode="dry"
  local report_file="${REPORT_DIR}/${family}-${TIMESTAMP}-dry.json"

  echo ""
  echo "--- ${family}: dry run ---"
  npm run motivation:expansion:dry -- --limit "${LIMIT}" --batch "${BATCH_NUMBER}" --query-family "${family}" \
    | tee "${report_file}"

  local promotions errors proposed accepted
  promotions="$(python3 -c "
import json,sys
data=json.load(open('${report_file}'))
print(data.get('import_result',{}).get('public_promotions', 'missing'))
" 2>/dev/null || echo "parse_error")"
  errors="$(python3 -c "
import json,sys
data=json.load(open('${report_file}'))
errs=data.get('import_result',{}).get('errors',[])
print(len(errs))
" 2>/dev/null || echo "parse_error")"
  proposed="$(python3 -c "
import json,sys
data=json.load(open('${report_file}'))
print(data.get('import_result',{}).get('proposed_item_inserts', 'missing'))
" 2>/dev/null || echo "parse_error")"
  accepted="$(python3 -c "
import json,sys
data=json.load(open('${report_file}'))
print(data.get('import_result',{}).get('records_accepted', 'missing'))
" 2>/dev/null || echo "parse_error")"

  echo "Summary ${family}: accepted=${accepted} proposed=${proposed} public_promotions=${promotions} errors=${errors}"

  if [[ "${promotions}" != "0" ]]; then
    echo "FAIL: public_promotions must be 0"
    exit 1
  fi
  if [[ "${errors}" != "0" ]]; then
    echo "FAIL: errors must be empty for ${family}"
    exit 1
  fi

  if [[ "${APPLY_WRITES}" == "true" && "${proposed}" != "0" ]]; then
    mode="write"
    report_file="${REPORT_DIR}/${family}-${TIMESTAMP}-write.json"
    echo ""
    echo "--- ${family}: pending write ---"
    npm run motivation:expansion -- --limit "${LIMIT}" --batch "${BATCH_NUMBER}" --query-family "${family}" --apply \
      | tee "${report_file}"

    promotions="$(python3 -c "
import json,sys
data=json.load(open('${report_file}'))
print(data.get('import_result',{}).get('public_promotions', 'missing'))
" 2>/dev/null || echo "parse_error")"
    if [[ "${promotions}" != "0" ]]; then
      echo "FAIL: write batch produced public promotions"
      exit 1
    fi
    echo "Write complete for ${family}. Report: ${report_file}"
  elif [[ "${APPLY_WRITES}" == "true" ]]; then
    echo "Skipping write for ${family}: no proposed inserts."
  fi
}

for family in "${FAMILIES[@]}"; do
  run_family "${family}"
done

echo ""
echo "============================================================================="
echo "Batch run complete."
if [[ "${APPLY_WRITES}" == "true" ]]; then
  echo "Pending writes may have been inserted. Public promotions must remain 0."
else
  echo "Dry-run only. No database writes were made."
  echo "To write pending records: APPLY_WRITES=true bash $0"
fi
echo "Promotion apply was NOT run."
echo "============================================================================="
