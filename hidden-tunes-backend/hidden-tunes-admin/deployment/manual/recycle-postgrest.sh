#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

echo "=== supabase service probes ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
for path in ["/auth/v1/health", "/rest/v1/", "/rest/v1/podcast_categories?select=id&limit=1"]:
    t=time.time()
    try:
        with urlopen(Request(base+path, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"}), timeout=10) as r:
            print(path, "OK", r.status, len(r.read(200)), round(time.time()-t,3))
    except Exception as e:
        print(path, "FAIL", type(e).__name__, str(e)[:140], round(time.time()-t,3))
PY

echo "=== kill ALL postgrest backends + reload notify ==="
psql "$DATABASE_URL" <<'SQL'
select count(*) as postgrest_before from pg_stat_activity where application_name='postgrest';
select pg_terminate_backend(pid)
from pg_stat_activity
where datname=current_database()
  and pid<>pg_backend_pid()
  and application_name='postgrest';
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
SQL

echo "sleep 5 for reconnect"
sleep 5

psql "$DATABASE_URL" -c "select count(*) as postgrest_after, state from pg_stat_activity where application_name='postgrest' group by state;"

echo "=== rest after full postgrest recycle ==="
python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
for path in [
  "/rest/v1/podcast_categories?select=id,name&is_active=eq.true&limit=5",
  "/rest/v1/radio_stations?select=id&limit=1",
  "/rest/v1/tv_videos?select=id&limit=1",
]:
    t=time.time()
    try:
        with urlopen(Request(base+path, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"}), timeout=20) as r:
            body=r.read()
            print(path, "OK", r.status, len(body), round(time.time()-t,3), body[:80])
    except Exception as e:
        print(path, "FAIL", type(e).__name__, str(e)[:140], round(time.time()-t,3))
PY
