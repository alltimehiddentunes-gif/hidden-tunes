#!/usr/bin/env bash
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
. ./.env.production
set +a

echo "=== process ==="
bash /tmp/tmp-batch2-status.sh | head -n 15

echo "=== live counts ==="
bash scripts/tmp-prod-concert-stats.sh

echo "=== pm2 ==="
pm2 describe hidden-tunes-admin 2>/dev/null | egrep 'status|cpu|memory|uptime' | head -n 20 || pm2 list | head -n 20

echo "=== api health ==="
for url in \
  "https://admin.hiddentunes.com/api/concerts/browse?limit=1" \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/sports/home"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" || echo 000)
  echo "$code $url"
done

echo "=== checkpoints ==="
ls data/concert-batch2-checkpoints 2>/dev/null | wc -l
