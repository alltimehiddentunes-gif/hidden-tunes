#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

echo "=== terminate postgrest backlog ==="
psql "$DATABASE_URL" <<'SQL'
select application_name, state, count(*)
from pg_stat_activity
where datname=current_database()
group by 1,2
order by 3 desc;

select pg_terminate_backend(pid) as killed, pid, state, left(query,100) as q
from pg_stat_activity
where datname=current_database()
  and pid<>pg_backend_pid()
  and application_name='postgrest'
  and state in ('active','idle in transaction','idle in transaction (aborted)');
SQL

sleep 2

echo "=== rest probe ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
for path in [
  "/rest/v1/podcast_categories?select=id,name&is_active=eq.true&limit=5",
  "/rest/v1/tv_videos?select=id&limit=1",
  "/rest/v1/radio_stations?select=id&limit=1",
]:
  req=Request(base+path, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"})
  t=time.time()
  try:
    with urlopen(req, timeout=20) as r:
      print(path, "OK", r.status, len(r.read()), round(time.time()-t,3))
  except Exception as e:
    print(path, "FAIL", type(e).__name__, str(e)[:100], round(time.time()-t,3))
PY

echo "=== local routes ==="
for url in \
  "http://127.0.0.1:3000/api/podcasts/categories" \
  "http://127.0.0.1:3000/api/radio/stations?page=1&limit=2" \
  "http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android" \
  "http://127.0.0.1:3000/api/tv/categories" \
  "http://127.0.0.1:3000/api/audiobooks/tree" \
  "http://127.0.0.1:3000/api/audiobooks/category/fiction?page=1&limit=3" \
  "http://127.0.0.1:3000/api/lectures/category/academic-lectures?page=1&limit=3" \
  "http://127.0.0.1:3000/api/podcasts/episodes?category=news&page=1&limit=5"
do
  curl -sS --connect-timeout 5 --max-time 25 -o /tmp/rbody.txt \
    -w "%{url_effective} status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n" \
    -H 'Accept: application/json' "$url" || echo "FAIL $url"
  head -c 120 /tmp/rbody.txt; echo
done
