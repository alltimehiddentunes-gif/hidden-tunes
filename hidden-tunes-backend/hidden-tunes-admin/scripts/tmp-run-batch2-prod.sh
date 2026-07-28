#!/usr/bin/env bash
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
. ./.env.production
set +a

echo "=== seed sources (curated + wave) ==="
./node_modules/.bin/tsx scripts/seed-concert-sources.ts 2>&1 | tee /tmp/concerts-batch2-seed.log | tail -n 40

echo "=== resolve channel identities (HTML) ==="
./node_modules/.bin/tsx scripts/resolve-concert-channels-html.ts 2>&1 | tee /tmp/concerts-batch2-resolve.log | tail -n 60

echo "=== starting batch2 expansion in background ==="
nohup ./node_modules/.bin/tsx scripts/run-concerts-batch2-expansion.ts \
  > /tmp/concerts-batch2-expansion.log 2>&1 &
echo $! > /tmp/concerts-batch2-expansion.pid
echo "pid=$(cat /tmp/concerts-batch2-expansion.pid)"
sleep 5
tail -n 30 /tmp/concerts-batch2-expansion.log || true
