#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a
source ./.env.production
set +a

echo "=== dns/tcp supabase api ==="
python3 - <<'PY'
import socket, time
host='kojcyswxfuikxmqntwye.supabase.co'
t=time.time()
ips=socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
print('ips', sorted({i[4][0] for i in ips}))
s=socket.create_connection((host,443), timeout=5)
s.close()
print('tcp443_ok', round(time.time()-t,3))
PY

echo "=== rest HEAD/OPTIONS timing ==="
curl -sv --connect-timeout 5 --max-time 20 \
  -o /tmp/rest-body.txt \
  -w 'status=%{http_code} bytes=%{size_download} start=%{time_starttransfer} total=%{time_total}\n' \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept: application/json" \
  "$SUPABASE_URL/rest/v1/podcast_categories?select=id&limit=1" 2>&1 | tail -40

echo "=== body head ==="
head -c 300 /tmp/rest-body.txt; echo

echo "=== auth health ==="
curl -sS --connect-timeout 5 --max-time 15 -w '\nstatus=%{http_code} total=%{time_total}\n' \
  "$SUPABASE_URL/auth/v1/health" || true

echo "=== rest openapi ==="
curl -sS --connect-timeout 5 --max-time 15 -w '\nstatus=%{http_code} bytes=%{size_download} total=%{time_total}\n' \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/" -o /tmp/openapi.txt || true
head -c 120 /tmp/openapi.txt; echo

echo "=== idle in transaction kill candidates ==="
psql "$DATABASE_URL" <<'SQL'
select pid, state, now()-xact_start as xact_age, now()-state_change as state_age, left(query,160)
from pg_stat_activity
where datname=current_database()
  and state='idle in transaction'
  and pid<>pg_backend_pid();
SQL

echo "=== pg_stat_activity summary ==="
psql "$DATABASE_URL" -c "select application_name, state, count(*) from pg_stat_activity where datname=current_database() group by 1,2 order by 3 desc;"
