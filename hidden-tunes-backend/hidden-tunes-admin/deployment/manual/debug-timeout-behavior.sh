#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
set -a; source ./.env.production; set +a

python3 - <<'PY'
import os, time
from urllib.request import Request, urlopen
base=os.environ['SUPABASE_URL'].rstrip('/')
key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
print('testing rest with 8s timeout')
t=time.time()
try:
  with urlopen(Request(base+'/rest/v1/podcast_categories?select=id&limit=1', headers={'apikey':key,'Authorization':'Bearer '+key}), timeout=8) as r:
    print('ok', r.status, round(time.time()-t,3))
except Exception as e:
  print('fail', type(e).__name__, round(time.time()-t,3))
PY

echo '=== node timed fetch race ==='
node <<'NODE'
const timeoutMs = 3000;
const url = process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/podcast_categories?select=id&limit=1';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const controller = new AbortController();
const started = Date.now();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => {
    const e = new Error('race_timeout');
    e.name = 'TimeoutError';
    reject(e);
  }, timeoutMs);
});
Promise.race([
  fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }, signal: controller.signal }),
  timeoutPromise,
]).then(async (r) => {
  console.log('resolved', r.status, Date.now()-started);
  clearTimeout(timer);
}).catch((e) => {
  console.log('rejected', e.name, e.message, Date.now()-started);
  clearTimeout(timer);
});
NODE

echo '=== check route source on disk ==='
grep -n "try \|TimeoutError\|jsonPodcastError\|from(\"podcast_categories\")" app/api/podcasts/categories/route.ts | head -20

echo '=== single request with verbose timing after sleep ==='
sleep 2
curl -sv --max-time 16 -o /tmp/pc2.json -w '\nstatus=%{http_code} start=%{time_starttransfer} total=%{time_total}\n' -H 'Accept: application/json' http://127.0.0.1:3000/api/podcasts/categories 2>&1 | tail -30
echo 'body:'; head -c 300 /tmp/pc2.json; echo
echo '=== pm2 err tail ==='
tail -n 20 /root/.pm2/logs/hidden-tunes-admin-error.log
