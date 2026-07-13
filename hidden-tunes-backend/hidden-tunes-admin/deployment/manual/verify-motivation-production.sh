#!/usr/bin/env bash
# Hidden Tunes — Motivationals production endpoint verification (read-only)
# Does not print secrets or environment variable values.

set -euo pipefail

BASE_URL="${BASE_URL:-https://admin.hiddentunes.com}"
FORBIDDEN_PATTERN='"(audio_url|video_url|stream_url|play_url|playable_url|source_url|media_url|file_url)"[[:space:]]*:'

PASS_COUNT=0
FAIL_COUNT=0

check_endpoint() {
  local label="$1"
  local path="$2"
  local url="${BASE_URL}${path}"
  local body
  local status

  echo ""
  echo "--- ${label} ---"
  echo "GET ${url}"

  body="$(curl -fsS -H "Accept: application/json" -w "\n%{http_code}" "${url}" 2>/dev/null || true)"
  status="$(echo "${body}" | tail -n1)"
  body="$(echo "${body}" | sed '$d')"

  if [[ "${status}" != "200" ]]; then
    echo "FAIL: HTTP ${status}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi

  if ! echo "${body}" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    echo "FAIL: Response is not valid JSON"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi

  if echo "${body}" | grep -Eqi "${FORBIDDEN_PATTERN}"; then
    echo "FAIL: Forbidden playable URL field found in metadata response"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi

  echo "PASS: HTTP 200, valid JSON, metadata-only"
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "${body}"
}

echo "============================================================================="
echo "Motivationals Production Endpoint Verification"
echo "Base URL: ${BASE_URL}"
echo "============================================================================="

BROWSE_BODY="$(curl -fsS -H "Accept: application/json" "${BASE_URL}/api/motivation/items" 2>/dev/null || echo '{}')"
check_endpoint "Browse items" "/api/motivation/items" || true
check_endpoint "Categories" "/api/motivation/categories" || true
check_endpoint "Search" "/api/motivation/search?q=speech" || true
check_endpoint "Category browse" "/api/motivation/category/speeches" || true

echo ""
echo "--- Optional detail + play (only if public items exist) ---"

ITEM_ID="$(echo "${BROWSE_BODY}" | python3 -c "
import json, sys, re
try:
    data = json.load(sys.stdin)
    items = data.get('items') or data.get('data', {}).get('items') or []
    for item in items:
        item_id = item.get('id', '')
        if re.match(r'^[0-9a-f-]{36}$', str(item_id), re.I):
            print(item_id)
            break
except Exception:
    pass
" 2>/dev/null || true)"

if [[ -z "${ITEM_ID}" ]]; then
  echo "Catalog empty or no public UUID found — skipping detail/play tests."
  echo "metadata endpoint passed: browse returned 200 (may be empty catalog)"
else
  echo "Found public item: ${ITEM_ID}"

  DETAIL_URL="${BASE_URL}/api/motivation/items/${ITEM_ID}"
  DETAIL_BODY="$(curl -fsS -H "Accept: application/json" "${DETAIL_URL}" 2>/dev/null || echo '{}')"
  DETAIL_STATUS="$(curl -fsS -o /dev/null -w "%{http_code}" -H "Accept: application/json" "${DETAIL_URL}" 2>/dev/null || echo "000")"

  if [[ "${DETAIL_STATUS}" == "200" ]]; then
    if echo "${DETAIL_BODY}" | grep -Eqi "${FORBIDDEN_PATTERN}"; then
      echo "FAIL: Detail response contains forbidden playable URL fields"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      echo "PASS: Detail metadata endpoint (no playable URLs in body)"
      PASS_COUNT=$((PASS_COUNT + 1))
    fi
  else
    echo "FAIL: Detail HTTP ${DETAIL_STATUS}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  PLAY_URL="${BASE_URL}/api/motivation/items/${ITEM_ID}/play"
  PLAY_STATUS="$(curl -fsS -o /dev/null -w "%{http_code}" -H "Accept: application/json" "${PLAY_URL}" 2>/dev/null || echo "000")"
  if [[ "${PLAY_STATUS}" == "200" ]]; then
    echo "PASS: Play endpoint returned 200 for public item"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "INFO: Play endpoint HTTP ${PLAY_STATUS} (item may be unhealthy or blocked)"
  fi
fi

echo ""
echo "============================================================================="
echo "Summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "============================================================================="

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi

exit 0
