#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin"
cd "$PROJECT_DIR"

set -a
source .env.production
set +a

echo "=== Git ==="
git rev-parse --short HEAD
git branch --show-current

echo "=== DB: motivation_items.content_classification ==="
COL_COUNT=$(psql "$DATABASE_URL" -Atc \
  "select count(*) from information_schema.columns where table_schema='public' and table_name='motivation_items' and column_name='content_classification';")
echo "column_exists=$COL_COUNT"

if [ "$COL_COUNT" = "0" ]; then
  echo "Applying motivation expansion quality migration..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f supabase/migrations/20260712180000_motivation_expansion_quality.sql
  echo "Migration applied."
else
  echo "Column already present; skipping migration."
fi

if [ -f scripts/motivation-grants-service-role.sql ]; then
  echo "Applying motivation service_role grants..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/motivation-grants-service-role.sql || true
fi

echo "=== TV catalog counts ==="
psql "$DATABASE_URL" -Atc "select count(*) as tv_total from tv_videos;"
psql "$DATABASE_URL" -Atc \
  "select count(*) as tv_public from tv_videos where is_active=true and status='approved' and playback_status='playable';"

echo "=== Production build ==="
if [ ! -f .next/BUILD_ID ]; then
  echo "Missing .next/BUILD_ID — running npm ci && npm run build"
  npm ci
  npx tsc --noEmit --incremental false
  npm run build
else
  echo "BUILD_ID present: $(cat .next/BUILD_ID)"
fi

echo "=== PM2 restart ==="
pm2 restart hidden-tunes-admin --update-env
sleep 3
pm2 status hidden-tunes-admin

echo "=== Local health ==="
curl -sS -o /dev/null -w "local_tv_categories=%{http_code}\n" http://127.0.0.1:3000/api/tv/categories
curl -sS -o /dev/null -w "local_podcasts=%{http_code}\n" "http://127.0.0.1:3000/api/podcasts/shows?page=1&limit=3"

echo "=== Repair complete ==="
