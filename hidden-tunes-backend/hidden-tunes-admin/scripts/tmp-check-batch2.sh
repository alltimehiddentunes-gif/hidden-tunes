#!/usr/bin/env bash
set -eu
echo "=== wait log ==="
tail -n 50 /tmp/concerts-batch2-wait.log 2>/dev/null || echo no_wait_log
echo "=== expansion ==="
pidfile=/tmp/concerts-batch2-expansion.pid
if [ -f "$pidfile" ]; then
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then echo RUNNING pid=$pid; else echo DONE pid=$pid; fi
else
  echo NO_PIDFILE
fi
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
echo checkpoints=$(ls data/concert-batch2-checkpoints 2>/dev/null | wc -l)
if [ -f data/concerts-batch2-report.json ]; then echo HAS_REPORT; else echo NO_REPORT; fi
bash scripts/tmp-prod-concert-stats.sh | head -n 25
