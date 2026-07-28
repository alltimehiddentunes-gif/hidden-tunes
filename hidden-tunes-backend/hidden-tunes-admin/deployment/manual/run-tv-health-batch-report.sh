#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
BATCH_SIZE="${1:-200}"
cd "$PROJECT_DIR"

set -a
source .env.production
set +a

CUTOFF=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=7)).isoformat())
PY
)

report_counts() {
  local label="$1"
  echo "=== COUNTS: $label ==="
  psql "$DATABASE_URL" -Atc "select 'basic_public', count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable';"
  psql "$DATABASE_URL" -Atc "select 'ios_playable', count(*) from tv_videos where ios_playable=true;"
  psql "$DATABASE_URL" -Atc "select 'android_playable', count(*) from tv_videos where android_playable=true;"
  psql "$DATABASE_URL" -Atc "select 'platform_cross', count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable' and reliability_score >= 60 and disabled_at is null and quarantined_at is null and last_health_checked_at >= '$CUTOFF' and ios_playable=true and android_playable=true and stream_is_https=true;"
  psql "$DATABASE_URL" -Atc "select 'fresh_health', count(*) from tv_videos where last_health_checked_at >= '$CUTOFF';"
  psql "$DATABASE_URL" -Atc "select 'quarantined', count(*) from tv_videos where quarantined_at is not null;"
  psql "$DATABASE_URL" -Atc "select 'disabled', count(*) from tv_videos where disabled_at is not null;"
  psql "$DATABASE_URL" -Atc "select 'eligible_backlog', count(*) from tv_videos where status in ('approved','pending') and (ios_playable is distinct from true or android_playable is distinct from true or last_validation_result = 'pending_revalidation');"
}

test_endpoints() {
  echo "=== ENDPOINT TESTS ==="
  curl -sS -o /tmp/tv-cat.json -w "tv_categories_http=%{http_code}\n" http://127.0.0.1:3000/api/tv/categories
  python3 - <<'PY'
import json
with open('/tmp/tv-cat.json') as f:
    d=json.load(f)
print('tv_categories_success', d.get('success'), 'categories', len(d.get('categories',[])))
PY

  curl -sS -o /tmp/tv-vid.json -w "tv_videos_http=%{http_code}\n" "http://127.0.0.1:3000/api/tv/videos?page=1&limit=3"
  python3 - <<'PY'
import json, urllib.request
with open('/tmp/tv-vid.json') as f:
    d=json.load(f)
videos=d.get('videos',[])
print('tv_videos_success', d.get('success'), 'total', d.get('pagination',{}).get('total'), 'returned', len(videos))
if videos:
    vid=videos[0]['id']
    open('/tmp/tv-play-id.txt','w').write(vid)
    print('sample_video_id', vid)
else:
    open('/tmp/tv-play-id.txt','w').write('')
    print('sample_video_id', None)
PY

  if [ -s /tmp/tv-play-id.txt ]; then
    VID=$(cat /tmp/tv-play-id.txt)
    if [ -n "$VID" ]; then
      curl -sS -o /tmp/tv-play.json -w "tv_play_http=%{http_code}\n" "http://127.0.0.1:3000/api/tv/videos/${VID}/play"
      python3 - <<'PY'
import json
with open('/tmp/tv-play.json') as f:
    d=json.load(f)
print('tv_play_success', d.get('success'), 'has_stream', bool(d.get('stream_url') or d.get('playback',{}).get('url')))
PY
    fi
  fi
}

report_counts "before_batch"
echo "=== RUNNING tv:health batch size=$BATCH_SIZE ==="
npm run tv:health -- "$BATCH_SIZE" | tee /tmp/tv-health-batch.json
report_counts "after_batch"
test_endpoints
echo "=== PM2 ==="
pm2 status hidden-tunes-admin | tail -3
