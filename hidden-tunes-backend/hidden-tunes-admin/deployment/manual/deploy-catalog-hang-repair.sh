#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
cd "$PROJECT_DIR"

echo "=== baseline ==="
git rev-parse --short HEAD
git status --short | head -20
git branch --show-current

echo "=== fetch/checkout repair commit files only ==="
# Expect repair commit hash as $1
COMMIT="${1:?commit required}"

git fetch --all --prune || true
# Prefer applying file contents from the provided commit without switching branch if dirty
for f in \
  app/api/tv/categories/route.ts \
  app/api/tv/videos/route.ts \
  lib/audiobookCatalog.ts \
  lib/supabaseAdmin.ts \
  app/api/podcasts/episodes/route.ts
do
  echo "checkout $f from $COMMIT"
  git checkout "$COMMIT" -- "$f"
done

echo "=== build ==="
npm run build

echo "=== restart pm2 ==="
pm2 restart hidden-tunes-admin --update-env
sleep 3
pm2 status hidden-tunes-admin

echo "=== validate ==="
for url in \
  "http://127.0.0.1:3000/api/tv/categories" \
  "http://127.0.0.1:3000/api/audiobooks/tree" \
  "http://127.0.0.1:3000/api/lectures/categories" \
  "http://127.0.0.1:3000/api/podcasts/categories" \
  "http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android" \
  "http://127.0.0.1:3000/api/audiobooks/category/fiction?page=1&limit=3" \
  "http://127.0.0.1:3000/api/lectures/category/academic-lectures?page=1&limit=3" \
  "http://127.0.0.1:3000/api/podcasts/episodes?category=news&page=1&limit=5" \
  "http://127.0.0.1:3000/api/radio/stations?page=1&limit=2"
do
  curl -sS --connect-timeout 5 --max-time 20 -o /tmp/vbody.txt \
    -w "$url status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n" \
    -H 'Accept: application/json' "$url" || echo "FAIL $url"
  head -c 140 /tmp/vbody.txt 2>/dev/null || true
  echo
done

echo "=== public spot checks ==="
for url in \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/audiobooks/tree" \
  "https://admin.hiddentunes.com/api/lectures/categories"
do
  curl -sS --connect-timeout 5 --max-time 20 -o /tmp/vbody.txt \
    -w "$url status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n" \
    -H 'Accept: application/json' "$url" || echo "FAIL $url"
done

git rev-parse --short HEAD
git status --short | head -20
