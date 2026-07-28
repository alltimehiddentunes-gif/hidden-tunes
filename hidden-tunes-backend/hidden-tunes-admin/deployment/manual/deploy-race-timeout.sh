#!/usr/bin/env bash
set -euo pipefail
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
python3 - <<'PY'
from pathlib import Path
p=Path('lib/supabaseAdmin.ts')
b=p.read_bytes()
if b.startswith(b'\xef\xbb\xbf'):
    p.write_bytes(b[3:])
    print('stripped bom')
print('bytes', p.stat().st_size)
print('has_race', 'Promise.race' in p.read_text(encoding='utf-8'))
PY
npm run build
pm2 restart hidden-tunes-admin --update-env
sleep 4
echo '=== probes ==='
curl -sS --max-time 18 -o /tmp/pc.json -w 'pod_cats status=%{http_code} bytes=%{size_download} total=%{time_total}\n' -H 'Accept: application/json' http://127.0.0.1:3000/api/podcasts/categories || true
head -c 220 /tmp/pc.json; echo
curl -sS --max-time 18 -o /tmp/tv.json -w 'tv_vid status=%{http_code} bytes=%{size_download} total=%{time_total}\n' -H 'Accept: application/json' 'http://127.0.0.1:3000/api/tv/videos?page=1&limit=2&platform=android' || true
head -c 220 /tmp/tv.json; echo
curl -sS --max-time 5 -o /tmp/ok.json -w 'tv_cats status=%{http_code} bytes=%{size_download} total=%{time_total}\n' -H 'Accept: application/json' http://127.0.0.1:3000/api/tv/categories || true
curl -sS --max-time 5 -o /tmp/ab.json -w 'ab_tree status=%{http_code} bytes=%{size_download} total=%{time_total}\n' -H 'Accept: application/json' http://127.0.0.1:3000/api/audiobooks/tree || true
pm2 status hidden-tunes-admin
