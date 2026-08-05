#!/usr/bin/env sh
set -eu

threshold="${HIDDEN_TUNES_LOG_DISK_ALERT_PERCENT:-80}"
used="$(df -P /root/.pm2/logs | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
if [ "$used" -ge "$threshold" ]; then
  echo "hidden-tunes log disk usage is ${used}% (threshold ${threshold}%)" >&2
  exit 1
fi
echo "hidden-tunes log disk usage is ${used}% (threshold ${threshold}%)"
