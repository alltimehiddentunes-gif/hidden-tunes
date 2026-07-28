#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a && source .env.production && set +a

CUTOFF=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=7)).isoformat())
PY
)

echo "=== TV filter diagnostics ==="
psql "$DATABASE_URL" -Atc "select 'basic_public', count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable';"
psql "$DATABASE_URL" -Atc "select 'platform_cross', count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable' and reliability_score >= 70 and disabled_at is null and quarantined_at is null and last_health_checked_at >= '$CUTOFF' and ios_playable=true and android_playable=true and stream_is_https=true;"
psql "$DATABASE_URL" -Atc "select 'ios_playable_true', count(*) from tv_videos where ios_playable=true;"
psql "$DATABASE_URL" -Atc "select 'fresh_health', count(*) from tv_videos where last_health_checked_at >= '$CUTOFF';"

echo "=== Public API samples ==="
curl -sS -o /tmp/tv.json -w "tv_videos_http=%{http_code}\n" "http://127.0.0.1:3000/api/tv/videos?page=1&limit=3"
python3 - <<'PY'
import json
with open('/tmp/tv.json') as f:
    d=json.load(f)
print('tv_success', d.get('success'), 'total', d.get('pagination',{}).get('total'))
PY

curl -sS -o /tmp/pod.json -w "podcasts_http=%{http_code}\n" "http://127.0.0.1:3000/api/podcasts/shows?page=1&limit=3"
python3 - <<'PY'
import json
with open('/tmp/pod.json') as f:
    d=json.load(f)
print('pod_success', d.get('success'), 'total', d.get('pagination',{}).get('total'))
PY

echo "=== Recent PM2 errors ==="
grep -E 'production build|42703|502|content_classification' /root/.pm2/logs/hidden-tunes-admin-error.log | tail -5 || true
