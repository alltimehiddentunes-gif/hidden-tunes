#!/usr/bin/env bash
# Safe production Next build: never delete working .next until replacement succeeds.
set -eu
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin

stamp=$(date +%Y%m%d-%H%M%S)
backup=".next.safe-$stamp"

echo "=== preflight route presence ==="
test -f app/api/concerts/browse/route.ts
test -f app/api/concerts/items/\[id\]/play/route.ts
test -d app/api/tv
test -d app/api/sports
echo "routes_ok"

if [ -d .next ]; then
  echo "backing up .next -> $backup"
  cp -a .next "$backup"
fi

# Bypass clean-next-build destructive wipe by calling next build directly
echo "=== building (preserving previous .next backup) ==="
if npx next build --webpack > /tmp/concerts-safe-build.out 2>&1; then
  echo "build_ok"
  tail -n 15 /tmp/concerts-safe-build.out
  test -f .next/BUILD_ID
  pm2 restart hidden-tunes-admin --update-env
  sleep 6
else
  echo "build_failed — restoring previous .next"
  tail -n 40 /tmp/concerts-safe-build.out
  if [ -d "$backup" ]; then
    rm -rf .next
    mv "$backup" .next
  fi
  pm2 restart hidden-tunes-admin --update-env || true
  exit 1
fi

# health checks
for url in \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/concerts/browse?limit=1" \
  "https://admin.hiddentunes.com/api/sports/home"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || echo 000)
  echo "health $code $url"
  if [ "$code" != "200" ] && [ "$code" != "401" ] && [ "$code" != "403" ]; then
    echo "UNHEALTHY after build: $url -> $code"
    if [ -d "$backup" ]; then
      echo "rolling back .next"
      rm -rf .next
      mv "$backup" .next
      pm2 restart hidden-tunes-admin --update-env
    fi
    exit 2
  fi
done

# keep one backup, prune older
ls -dt .next.safe-* 2>/dev/null | tail -n +3 | xargs -r rm -rf
echo "safe_build_complete"
