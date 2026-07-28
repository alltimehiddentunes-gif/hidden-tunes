#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

echo "=== terminate stuck postgrest/active heavy queries ==="
psql "$DATABASE_URL" <<'SQL'
select pid, state, now()-query_start as age, left(query,120) as q
from pg_stat_activity
where datname=current_database()
  and pid<>pg_backend_pid()
  and application_name='postgrest'
  and state in ('active','idle in transaction')
  and query_start < now() - interval '3 seconds';

select pg_terminate_backend(pid) as terminated, pid, left(query,80) as q
from pg_stat_activity
where datname=current_database()
  and pid<>pg_backend_pid()
  and application_name='postgrest'
  and state in ('active','idle in transaction')
  and (
    query ilike '%tv_videos%'
    or query ilike '%podcast_%'
    or query ilike '%audiobook%'
    or query ilike '%lecture_%'
    or query ilike '%radio_stations%'
    or state = 'idle in transaction'
  )
  and query_start < now() - interval '2 seconds';
SQL

echo "=== approx table sizes ==="
psql "$DATABASE_URL" <<'SQL'
select relname, n_live_tup, n_dead_tup, seq_scan, idx_scan
from pg_stat_user_tables
where relname in (
  'podcast_categories','podcast_shows','podcast_episodes',
  'tv_videos','audiobooks','lecture_items','radio_stations'
)
order by n_live_tup desc nulls last;
SQL

echo "=== rest retry (no verbose secrets) ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
for path in [
  "/rest/v1/podcast_categories?select=id&limit=1",
  "/rest/v1/radio_stations?select=id&limit=1",
  "/rest/v1/tv_videos?select=id&limit=1",
]:
  req=Request(base+path, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"})
  t=time.time()
  try:
    with urlopen(req, timeout=15) as r:
      body=r.read()
      print(path, "OK", r.status, len(body), round(time.time()-t,3))
  except Exception as e:
    print(path, "FAIL", type(e).__name__, str(e)[:80], round(time.time()-t,3))
PY

echo "=== local next routes ==="
for url in \
  "http://127.0.0.1:3000/api/podcasts/categories" \
  "http://127.0.0.1:3000/api/radio/stations?page=1&limit=2" \
  "http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android" \
  "http://127.0.0.1:3000/api/tv/categories" \
  "http://127.0.0.1:3000/api/audiobooks/tree" \
  "http://127.0.0.1:3000/api/lectures/category/academic-lectures?page=1&limit=3"
do
  curl -sS --connect-timeout 5 --max-time 20 -o /tmp/rbody.txt \
    -w "$url -> status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n" \
    -H 'Accept: application/json' "$url" || echo "$url -> curl_fail"
done
