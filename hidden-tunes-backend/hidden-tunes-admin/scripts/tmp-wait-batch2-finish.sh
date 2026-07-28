#!/usr/bin/env bash
# Wait until batch2 finishes, then print final stats. Do not kill the job.
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
for i in $(seq 1 120); do
  if [ -f /tmp/concerts-batch2-expansion.pid ]; then
    pid=$(cat /tmp/concerts-batch2-expansion.pid)
    if kill -0 "$pid" 2>/dev/null; then
      echo "wait_$i still_running pid=$pid checkpoints=$(ls data/concert-batch2-checkpoints 2>/dev/null | wc -l)"
      bash scripts/tmp-prod-concert-stats.sh | head -n 8
      sleep 60
      continue
    fi
  fi
  echo "batch2_finished"
  break
done
echo "=== FINAL REPORT FILE ==="
cat data/concerts-batch2-report.json 2>/dev/null || echo missing_report
echo "=== FINAL STATS ==="
bash scripts/tmp-prod-concert-stats.sh
echo "=== PM2 ==="
pm2 describe hidden-tunes-admin 2>/dev/null | egrep 'status|memory|cpu|uptime|restarts' | head -n 30
echo "=== API ==="
for url in \
  "https://admin.hiddentunes.com/api/concerts/browse?limit=3" \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/sports/home"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" || echo 000)
  echo "$code $url"
done
echo "=== DIRTY PRESERVE ==="
git rev-parse --abbrev-ref HEAD
git status -sb | head -n 15
