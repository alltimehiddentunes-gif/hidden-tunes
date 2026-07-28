#!/usr/bin/env bash
set -euo pipefail
pm2 restart hidden-tunes-admin --update-env
sleep 4
pm2 status hidden-tunes-admin

probe() {
  local url="$1"
  echo "======== $url"
  curl -sS --connect-timeout 5 --max-time 18 \
    -o /tmp/vbody.txt \
    -w 'status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n' \
    -H 'Accept: application/json' \
    "$url" || echo "curl_fail"
  head -c 160 /tmp/vbody.txt 2>/dev/null || true
  echo
}

echo "=== local ==="
probe "http://127.0.0.1:3000/api/tv/categories"
probe "http://127.0.0.1:3000/api/audiobooks/tree"
probe "http://127.0.0.1:3000/api/lectures/categories"
probe "http://127.0.0.1:3000/api/podcasts/categories"
probe "http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android"
probe "http://127.0.0.1:3000/api/audiobooks/category/fiction?page=1&limit=3"
probe "http://127.0.0.1:3000/api/lectures/category/academic-lectures?page=1&limit=3"
probe "http://127.0.0.1:3000/api/podcasts/episodes?category=news&page=1&limit=5"
probe "http://127.0.0.1:3000/api/radio/stations?page=1&limit=2"

echo "=== public ==="
probe "https://admin.hiddentunes.com/api/tv/categories"
probe "https://admin.hiddentunes.com/api/audiobooks/tree"
probe "https://admin.hiddentunes.com/api/lectures/categories"
probe "https://admin.hiddentunes.com/api/podcasts/categories"
probe "https://admin.hiddentunes.com/api/tv/videos?page=1&limit=2&platform=android"
probe "https://admin.hiddentunes.com/api/radio/stations?page=1&limit=2"

# Rest API health
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a; source ./.env.production; set +a
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
t=time.time()
try:
  with urlopen(Request(base+"/rest/v1/podcast_categories?select=id&limit=1", headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"}), timeout=12) as r:
    print("supabase_rest", r.status, len(r.read()), round(time.time()-t,3))
except Exception as e:
  print("supabase_rest_fail", type(e).__name__, round(time.time()-t,3))
PY
