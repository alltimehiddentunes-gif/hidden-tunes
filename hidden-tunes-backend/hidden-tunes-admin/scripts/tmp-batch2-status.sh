#!/usr/bin/env bash
set -eu
pidfile=/tmp/concerts-batch2-expansion.pid
if [ -f "$pidfile" ]; then
  pid=$(cat "$pidfile")
  echo "pid=$pid"
  if kill -0 "$pid" 2>/dev/null; then
    echo status=running
  else
    echo status=not_running
  fi
else
  echo pid=none
  echo status=not_running
fi
echo "=== log tail ==="
tail -n 50 /tmp/concerts-batch2-expansion.log 2>/dev/null || echo no_log
echo "=== report ==="
if [ -f /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin/data/concerts-batch2-report.json ]; then
  cat /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin/data/concerts-batch2-report.json
else
  echo no_report_yet
fi
echo "=== resolve pending_nine ==="
python3 - <<'PY'
import json
p="/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin/data/concerts-channel-resolve-map.json"
try:
  d=json.load(open(p))
  print(json.dumps({"resolved_or_known": d.get("resolved_or_known"), "pending_nine": d.get("pending_nine")}, indent=2))
except Exception as e:
  print("err", e)
PY
