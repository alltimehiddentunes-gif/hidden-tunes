#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
BATCH_SIZE="${1:-200}"
MAX_NO_PROGRESS="${2:-2}"
cd "$PROJECT_DIR"

set -a
source .env.production
set +a

CUTOFF=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=7)).isoformat())
PY
)

count_platform_cross() {
  psql "$DATABASE_URL" -Atc "select count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable' and reliability_score >= 60 and disabled_at is null and quarantined_at is null and last_health_checked_at >= '$CUTOFF' and ios_playable=true and android_playable=true and stream_is_https=true;"
}

count_eligible_backlog() {
  psql "$DATABASE_URL" -Atc "select count(*) from tv_videos where status in ('approved','pending');"
}

echo "=== TV HEALTH SUSTAINED RUN ==="
echo "batch_size=$BATCH_SIZE max_no_progress=$MAX_NO_PROGRESS"

BEFORE_CROSS=$(count_platform_cross)
BEFORE_BACKLOG=$(count_eligible_backlog)
echo "before_platform_cross=$BEFORE_CROSS"
echo "before_total_approved_pending=$BEFORE_BACKLOG"

BATCHES=0
NO_PROGRESS=0
PREV_CROSS="$BEFORE_CROSS"
TOTAL_CHECKED=0
TOTAL_PLAYABLE=0
TOTAL_FAILED=0
TOTAL_QUARANTINED=0
TOTAL_DISABLED=0

while true; do
  BATCHES=$((BATCHES + 1))
  echo ""
  echo "=== BATCH $BATCHES ==="

  RESULT=$(npm run tv:health -- "$BATCH_SIZE" 2>&1 | tee /tmp/tv-health-last.log)
  PARSED=$(python3 - <<'PY'
import json, re
text=open('/tmp/tv-health-last.log').read()
# npm may prefix with > lines; find JSON block
start=text.find('{')
if start < 0:
    print('0 0 0 0 0')
    raise SystemExit
try:
    d=json.loads(text[start:])
    r=d.get('result',{})
    print(r.get('checked',0), r.get('playable',0), r.get('failed',0), r.get('quarantined',0), r.get('disabled',0))
except Exception:
    print('0 0 0 0 0')
PY
)
  read -r CHECKED PLAYABLE FAILED QUARANTINED DISABLED <<< "$PARSED"
  TOTAL_CHECKED=$((TOTAL_CHECKED + CHECKED))
  TOTAL_PLAYABLE=$((TOTAL_PLAYABLE + PLAYABLE))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
  TOTAL_QUARANTINED=$((TOTAL_QUARANTINED + QUARANTINED))
  TOTAL_DISABLED=$((TOTAL_DISABLED + DISABLED))

  CUR_CROSS=$(count_platform_cross)
  echo "batch_checked=$CHECKED batch_playable=$PLAYABLE batch_failed=$FAILED batch_quarantined=$QUARANTINED batch_disabled=$DISABLED"
  echo "platform_cross=$CUR_CROSS (prev=$PREV_CROSS)"

  if [ "$CHECKED" -eq 0 ]; then
    echo "STOP: zero rows processed — backlog exhausted for current selection."
    break
  fi

  if [ "$CUR_CROSS" -le "$PREV_CROSS" ]; then
    NO_PROGRESS=$((NO_PROGRESS + 1))
    echo "no_progress_streak=$NO_PROGRESS"
  else
    NO_PROGRESS=0
  fi
  PREV_CROSS="$CUR_CROSS"

  PM2_STATUS=$(pm2 jlist | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((p['pm2_env']['status'] for p in d if p.get('name')=='hidden-tunes-admin'),'missing'))")
  echo "pm2_status=$PM2_STATUS"
  if [ "$PM2_STATUS" != "online" ]; then
    echo "STOP: PM2 not online"
    exit 1
  fi

  TV_HTTP=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/tv/videos?page=1&limit=3)
  POD_HTTP=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/api/podcasts/shows?page=1&limit=3")
  echo "tv_http=$TV_HTTP podcasts_http=$POD_HTTP"
  if [ "$TV_HTTP" != "200" ] || [ "$POD_HTTP" != "200" ]; then
    echo "STOP: endpoint failure"
    exit 1
  fi

  if [ "$NO_PROGRESS" -ge "$MAX_NO_PROGRESS" ]; then
    echo "STOP: no platform_cross progress for $MAX_NO_PROGRESS consecutive batches."
    break
  fi

  # Stop when all approved/pending have been cycled and cross count stable — heuristic: if checked < batch size, likely near end
  if [ "$CHECKED" -lt "$BATCH_SIZE" ] && [ "$NO_PROGRESS" -ge 1 ]; then
    echo "STOP: partial batch and no progress."
    break
  fi

  sleep 2
done

AFTER_CROSS=$(count_platform_cross)
echo ""
echo "=== FINAL SUMMARY ==="
echo "batches_run=$BATCHES"
echo "before_platform_cross=$BEFORE_CROSS"
echo "after_platform_cross=$AFTER_CROSS"
echo "total_checked=$TOTAL_CHECKED total_playable=$TOTAL_PLAYABLE total_failed=$TOTAL_FAILED total_quarantined=$TOTAL_QUARANTINED total_disabled=$TOTAL_DISABLED"
pm2 status hidden-tunes-admin | tail -3
