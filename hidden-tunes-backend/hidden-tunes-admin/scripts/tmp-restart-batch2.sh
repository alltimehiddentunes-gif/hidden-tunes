#!/usr/bin/env bash
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin

# stop previous batch2 if running
if [ -f /tmp/concerts-batch2-expansion.pid ]; then
  old=$(cat /tmp/concerts-batch2-expansion.pid)
  if kill -0 "$old" 2>/dev/null; then
    kill "$old" || true
    sleep 2
    kill -9 "$old" 2>/dev/null || true
    echo killed_old=$old
  fi
fi

set -a
. ./.env.production
set +a

# force line-buffered node logs
export NODE_OPTIONS="${NODE_OPTIONS:-}"
export PYTHONUNBUFFERED=1

echo "=== seed ==="
./node_modules/.bin/tsx scripts/seed-concert-sources.ts > /tmp/concerts-batch2-seed2.log 2>&1 || true
tail -n 25 /tmp/concerts-batch2-seed2.log

echo "=== resolve remaining handles ==="
./node_modules/.bin/tsx scripts/resolve-concert-channels-html.ts > /tmp/concerts-batch2-resolve2.log 2>&1 || true
python3 - <<'PY'
import json
d=json.load(open("data/concerts-channel-resolve-map.json"))
print("resolved_or_known", d.get("resolved_or_known"))
print(json.dumps(d.get("pending_nine"), indent=2))
PY

echo "=== start batch2 ==="
# unbuffered: stdbuf if available
if command -v stdbuf >/dev/null 2>&1; then
  nohup stdbuf -oL -eL ./node_modules/.bin/tsx scripts/run-concerts-batch2-expansion.ts \
    > /tmp/concerts-batch2-expansion.log 2>&1 &
else
  nohup ./node_modules/.bin/tsx scripts/run-concerts-batch2-expansion.ts \
    > /tmp/concerts-batch2-expansion.log 2>&1 &
fi
echo $! > /tmp/concerts-batch2-expansion.pid
echo pid=$(cat /tmp/concerts-batch2-expansion.pid)
sleep 8
wc -l /tmp/concerts-batch2-expansion.log || true
tail -n 20 /tmp/concerts-batch2-expansion.log || true
bash /tmp/tmp-prod-concert-stats.sh | head -n 20
