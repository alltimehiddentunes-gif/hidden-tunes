#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
cd "$PROJECT_DIR"

set -a
source .env.production
set +a

phase="${1:-baseline}"

if [ "$phase" = "baseline" ]; then
  echo "=== ENV PRESENCE ==="
  test -n "${DATABASE_URL:-}" && echo "DATABASE_URL=present" || echo "DATABASE_URL=missing"
  test -n "${SUPABASE_URL:-}" && echo "SUPABASE_URL=present" || echo "SUPABASE_URL=missing"
  test -n "${SUPABASE_SERVICE_ROLE_KEY:-}" && echo "SUPABASE_SERVICE_ROLE_KEY=present" || echo "SUPABASE_SERVICE_ROLE_KEY=missing"

  echo "=== TV BASELINE ==="
  psql "$DATABASE_URL" -Atc "select 'tv_total', count(*) from tv_videos;"
  psql "$DATABASE_URL" -Atc "select 'tv_public_general', count(*) from tv_videos where is_active=true and status='approved' and playback_status='playable';"
  psql "$DATABASE_URL" -Atc "select 'tv_quarantined', count(*) from tv_videos where quarantined_at is not null;"
  psql "$DATABASE_URL" -Atc "select 'tv_failed_playback', count(*) from tv_videos where playback_status='failed';"

  echo "=== API HEALTH ==="
  curl -fsS -o /dev/null -w "stations_http=%{http_code} time=%{time_total}\n" "https://admin.hiddentunes.com/api/tv/stations?limit=1"
  curl -fsS -o /dev/null -w "categories_http=%{http_code} time=%{time_total}\n" "https://admin.hiddentunes.com/api/tv/categories"
  exit 0
fi

if [ "$phase" = "deploy" ]; then
  git fetch origin
  git checkout radio-mature-worldwide-expansion
  git pull --ff-only origin radio-mature-worldwide-expansion
  npm ci
  npm run build
  echo "DEPLOYED_COMMIT=$(git rev-parse HEAD)"
  exit 0
fi

if [ "$phase" = "dryrun1" ]; then
  export TV_DISCOVERY_CONCURRENCY=6
  export TV_DISCOVERY_CONCURRENCY_MAX=12
  export TV_VERIFY_CONCURRENCY=16
  export TV_VERIFY_CONCURRENCY_MAX=32
  export TV_PER_HOST_CONCURRENCY=2
  export TV_IMPORT_BATCH_SIZE=500
  export TV_VERIFY_BATCH_SIZE=100
  timeout 900 npm run tv:expand:fast -- --source international-news-wave4 --max-batches 1
  exit $?
fi

if [ "$phase" = "dryrun2" ]; then
  export TV_DISCOVERY_CONCURRENCY=6
  export TV_VERIFY_CONCURRENCY=16
  export TV_PER_HOST_CONCURRENCY=2
  timeout 900 npm run tv:expand:fast -- --source religious-education-wave4 --max-batches 1
  exit $?
fi

if [ "$phase" = "dryrun3" ]; then
  export TV_DISCOVERY_CONCURRENCY=6
  export TV_VERIFY_CONCURRENCY=16
  export TV_PER_HOST_CONCURRENCY=2
  timeout 1800 npm run tv:expand:fast -- --max-batches 3
  exit $?
fi

if [ "$phase" = "dryrun-community" ]; then
  export TV_DISCOVERY_CONCURRENCY=6
  export TV_VERIFY_CONCURRENCY=16
  export TV_PER_HOST_CONCURRENCY=2
  timeout 900 npm run tv:expand:fast -- --source free-community-playlists-wave4 --max-batches 1
  exit $?
fi

echo "Unknown phase: $phase" >&2
exit 1
