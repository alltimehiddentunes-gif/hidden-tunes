#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
python3 - <<'PY'
from pathlib import Path
for f in ['app/api/podcasts/categories/route.ts','app/api/tv/videos/route.ts']:
    p=Path(f)
    b=p.read_bytes()
    if b.startswith(b'\xef\xbb\xbf'):
        p.write_bytes(b[3:])
        print('stripped', f)
    print(f, p.stat().st_size)
PY
npm run build
pm2 restart hidden-tunes-admin --update-env
sleep 4
for url in \
  "http://127.0.0.1:3000/api/tv/categories" \
  "http://127.0.0.1:3000/api/audiobooks/tree" \
  "http://127.0.0.1:3000/api/podcasts/categories" \
  "http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android" \
  "http://127.0.0.1:3000/api/lectures/category/academic-lectures?page=1&limit=3" \
  "https://admin.hiddentunes.com/api/tv/categories" \
  "https://admin.hiddentunes.com/api/audiobooks/tree" \
  "https://admin.hiddentunes.com/api/podcasts/categories"
do
  echo "==== $url"
  curl -sS --max-time 20 -o /tmp/out.json \
    -w 'status=%{http_code} bytes=%{size_download} total=%{time_total}\n' \
    -H 'Accept: application/json' "$url" || echo curl_fail
  head -c 180 /tmp/out.json 2>/dev/null || true
  echo
done
pm2 status hidden-tunes-admin
