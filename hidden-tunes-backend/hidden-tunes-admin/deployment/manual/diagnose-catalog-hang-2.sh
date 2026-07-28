#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

echo "=== env hosts (redacted) ==="
python3 - <<'PY'
import os
from urllib.parse import urlparse
for key in ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL", "POSTGRES_URL"]:
    val = os.environ.get(key, "")
    if not val:
        print(key, "MISSING")
        continue
    p = urlparse(val)
    host = p.hostname or ""
    port = p.port
    path = (p.path or "")[:40]
    user = p.username or ""
    print(f"{key} scheme={p.scheme} host={host} port={port} user={user} path={path}")
PY

echo "=== pooler/db health via short timeout ==="
python3 - <<'PY'
import os, time, socket
from urllib.parse import urlparse
url = os.environ.get("DATABASE_URL", "")
p = urlparse(url)
host = p.hostname
port = p.port or 5432
print("tcp_probe", host, port)
t = time.time()
try:
    s = socket.create_connection((host, port), timeout=5)
    s.close()
    print("tcp_ok", round(time.time()-t,3))
except Exception as e:
    print("tcp_fail", e, round(time.time()-t,3))
PY

echo "=== long running queries ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select
  pid,
  state,
  wait_event_type,
  wait_event,
  now() - xact_start as xact_age,
  now() - query_start as query_age,
  left(query, 300) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and query_start < now() - interval '5 seconds'
order by query_start asc
limit 40;

select setting as max_connections from pg_settings where name='max_connections';
select count(*) as current_connections from pg_stat_activity;
select count(*) filter (where state='active') as active,
       count(*) filter (where state='idle') as idle,
       count(*) filter (where state='idle in transaction') as idle_in_tx,
       count(*) filter (where wait_event_type='Lock') as waiting_lock
from pg_stat_activity;
SQL

echo "=== tiny selects via psql ==="
psql "$DATABASE_URL" -c "select count(*) from podcast_categories where is_active=true;"
psql "$DATABASE_URL" -c "select id,name from podcast_categories where is_active=true order by sort_order limit 5;"
psql "$DATABASE_URL" -c "select count(*) from tv_videos;"
psql "$DATABASE_URL" -c "select id,title from tv_videos limit 1;"
psql "$DATABASE_URL" -c "select count(*) from lecture_items;"

echo "=== postgrest again after psql ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/podcast_categories?select=id,name&is_active=eq.true&limit=3"
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
req = Request(url, headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
t=time.time()
try:
    with urlopen(req, timeout=20) as r:
        print("rest_ok", r.status, len(r.read()), round(time.time()-t,3))
except Exception as e:
    print("rest_fail", type(e).__name__, e, round(time.time()-t,3))
PY
