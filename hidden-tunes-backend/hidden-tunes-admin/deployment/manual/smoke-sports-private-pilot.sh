#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes

GIT_AUTHOR_NAME=deploy GIT_AUTHOR_EMAIL=deploy@hiddentunes.com \
GIT_COMMITTER_NAME=deploy GIT_COMMITTER_EMAIL=deploy@hiddentunes.com \
  git commit -m "Fix ScoreBat health field name for production typecheck." -- \
  hidden-tunes-backend/hidden-tunes-admin/lib/sports/providers/scorebat/videoProvider.ts \
  || echo "commit_noop"

echo "DEPLOY_HEAD=$(git rev-parse HEAD)"
echo "BRANCH=$(git rev-parse --abbrev-ref HEAD)"

echo "=== EXISTING ENDPOINTS ==="
for u in \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/radio/stations?page=1&limit=2" \
  "https://admin.hiddentunes.com/api/podcasts/categories" \
  "https://admin.hiddentunes.com/api/audiobooks/tree" \
  "https://admin.hiddentunes.com/api/lectures/categories" \
  "https://admin.hiddentunes.com/api/motivation/categories"
do
  code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 25 "$u" || echo ERR)
  echo "$code $u"
done

echo "=== SPORTS ROUTES ==="
for u in \
  "https://admin.hiddentunes.com/api/sports/home" \
  "https://admin.hiddentunes.com/api/sports/live" \
  "https://admin.hiddentunes.com/api/sports/fixtures"
do
  code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 25 "$u" || echo ERR)
  echo "$code $u"
  head -c 320 /tmp/smoke_body.txt; echo
done

code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 25 \
  -X POST "https://admin.hiddentunes.com/api/sports/fixtures/00000000-0000-4000-8000-000000000001/play" \
  -H "Content-Type: application/json" \
  -d '{"platform":"ios","country":"ZZ"}' || echo ERR)
echo "$code POST fixtures/play"
head -c 400 /tmp/smoke_body.txt; echo

code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 25 \
  "https://admin.hiddentunes.com/api/sports/playback-sessions/not-a-real-token" || echo ERR)
echo "$code GET playback-sessions"
head -c 320 /tmp/smoke_body.txt; echo

cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
# shellcheck disable=SC1091
source .env.production
set +a
psql "$DATABASE_URL" -c "select count(*) as pilot, count(*) filter (where playable) as playable_true, count(*) filter (where availability_state='live_in_app') as live_in_app from sports_fixtures where metadata->>'source'='sports_private_pilot_2026_07_18';"
psql "$DATABASE_URL" -c "select key, enabled from sports_feature_flags order by 1;"
psql "$DATABASE_URL" -c "select availability_state, count(*) from sports_fixtures where metadata->>'source'='sports_private_pilot_2026_07_18' group by 1 order by 1;"
