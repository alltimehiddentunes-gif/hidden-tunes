#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
# shellcheck disable=SC1091
source ./.env.production
set +a

echo "=== time ==="
date -u

echo "=== direct supabase rest podcast_categories ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
url = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/rest/v1/podcast_categories?select=id&is_active=eq.true&limit=3"
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
req = Request(url, headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
t = time.time()
try:
    with urlopen(req, timeout=12) as r:
        body = r.read()
        print("status", r.status, "bytes", len(body), "secs", round(time.time() - t, 3))
        print(body[:180])
except Exception as e:
    print("error", type(e).__name__, e, "secs", round(time.time() - t, 3))
PY

echo "=== direct supabase rest radio_stations tiny ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
url = os.environ.get("SUPABASE_URL", "").rstrip("/") + "/rest/v1/?select=1"
# Prefer a known small table if radio_stations exists
candidates = [
    "/rest/v1/podcast_categories?select=count&limit=1",
    "/rest/v1/lecture_items?select=id&limit=1",
    "/rest/v1/tv_videos?select=id&limit=1",
]
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
base = os.environ.get("SUPABASE_URL", "").rstrip("/")
for path in candidates:
    url = base + path
    req = Request(url, headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json", "Prefer": "count=exact"})
    t = time.time()
    try:
        with urlopen(req, timeout=12) as r:
            body = r.read()
            print(path, "status", r.status, "bytes", len(body), "secs", round(time.time() - t, 3))
    except Exception as e:
        print(path, "error", type(e).__name__, str(e)[:120], "secs", round(time.time() - t, 3))
PY

echo "=== psql activity ==="
psql "$DATABASE_URL" <<'SQL'
select now() as db_now;
select count(*) as total_connections from pg_stat_activity;
select state, count(*) from pg_stat_activity group by 1 order by 2 desc;
select
  pid,
  usename,
  application_name,
  client_addr,
  state,
  wait_event_type,
  wait_event,
  now() - query_start as duration,
  left(query, 240) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
order by query_start nulls last
limit 50;
select
  locktype,
  relation::regclass as relation,
  mode,
  granted,
  pid
from pg_locks
where not granted
limit 30;
SQL

echo "=== table sizes ==="
psql "$DATABASE_URL" <<'SQL'
select relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze
from pg_stat_user_tables
where relname in (
  'podcast_categories','podcast_shows','podcast_episodes',
  'tv_videos','audiobooks','audiobook_chapters','lecture_items','radio_stations'
)
order by relname;
SQL
