#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

python3 - <<'PY'
import os, time
from urllib.parse import urlparse, urlunparse, quote
from urllib.request import Request, urlopen

db = urlparse(os.environ["DATABASE_URL"])
password = db.password or ""
user = db.username or ""
project = "kojcyswxfuikxmqntwye"

# Candidate DSNs (password kept in-process only)
candidates = {
  "session_pooler_5432": os.environ["DATABASE_URL"],
  "txn_pooler_6543": urlunparse(("postgresql", f"{user}:{password}@aws-0-eu-west-1.pooler.supabase.com:6543", "/postgres", "", db.query, "")),
  "direct_db": urlunparse(("postgresql", f"postgres:{password}@db.{project}.supabase.co:5432", "/postgres", "", "sslmode=require", "")),
}

import subprocess, shlex

def run_psql(label, dsn, sql):
    env = os.environ.copy()
    # Use env var to avoid shell quoting secrets in process list as much as practical
    env["PGPASSWORD"] = password
    # Rewrite DSN without password for argv? keep simple with full URI via env
    env["DIAG_DSN"] = dsn
    cmd = ["psql", dsn, "-v", "ON_ERROR_STOP=1", "-c", sql]
    t=time.time()
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=20, env=env, text=True)
        print(f"OK {label} {round(time.time()-t,3)}s")
        print(out[:500])
        return True
    except subprocess.TimeoutExpired:
        print(f"TIMEOUT {label} {round(time.time()-t,3)}s")
    except subprocess.CalledProcessError as e:
        msg = (e.output or "")[:300].replace(password, "***")
        print(f"FAIL {label} {round(time.time()-t,3)}s :: {msg}")
    return False

print("=== try alternate DB endpoints ===")
for label, dsn in candidates.items():
    # Never print DSN
    host = urlparse(dsn).hostname
    port = urlparse(dsn).port
    print(f"-- {label} host={host} port={port}")
    ok = run_psql(label, dsn, "select now() as n, current_setting('max_connections') as max_conn, (select count(*) from pg_stat_activity) as conns;")
    if ok and label != "session_pooler_5432":
        run_psql(label+"-term", dsn, """
select count(*) as postgrest_active
from pg_stat_activity
where application_name='postgrest' and state in ('active','idle in transaction');
""")
        run_psql(label+"-kill", dsn, """
select pg_terminate_backend(pid)
from pg_stat_activity
where datname=current_database()
  and pid <> pg_backend_pid()
  and application_name='postgrest'
  and state in ('active','idle in transaction')
  and query_start < now() - interval '2 seconds';
""")
        run_psql(label+"-sizes", dsn, """
select relname, n_live_tup, n_dead_tup
from pg_stat_user_tables
where relname in ('tv_videos','podcast_episodes','podcast_shows','audiobooks','lecture_items','radio_stations','podcast_categories')
order by n_live_tup desc nulls last;
""")

print("=== rest after attempted cleanup ===")
base=os.environ["SUPABASE_URL"].rstrip("/")
key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
for path in ["/rest/v1/podcast_categories?select=id&limit=1","/rest/v1/tv_videos?select=id&limit=1"]:
  req=Request(base+path, headers={"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"})
  t=time.time()
  try:
    with urlopen(req, timeout=12) as r:
      print(path, "OK", r.status, len(r.read()), round(time.time()-t,3))
  except Exception as e:
    print(path, "FAIL", type(e).__name__, str(e)[:100], round(time.time()-t,3))
PY
