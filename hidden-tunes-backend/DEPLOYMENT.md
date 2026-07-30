# Songs API — VPS + Cloudflare deployment

## Production

| Item | Value |
| --- | --- |
| Public URL | `https://api.hiddentunes.com` |
| Origin | VPS `148.230.109.215` / `srv1677509` |
| Process | PM2 `hidden-tunes-api` → `127.0.0.1:3100` |
| Deploy path | `/var/www/hidden-tunes-api` |
| Edge | Cloudflare zone `hiddentunes.com` |
| SSL mode | **Full (strict)** — never Flexible |
| Origin TLS | Let's Encrypt (`api.hiddentunes.com`) |

## Bind address

`ecosystem.config.cjs` sets `HOST=127.0.0.1` and `PORT=3100`.
Do not expose port 3100 publicly. Nginx terminates TLS and proxies locally.

## Admin

`hidden-tunes-admin` on `127.0.0.1:3000` / `admin.hiddentunes.com` is separate — do not disturb.

## Smoke tests

```bash
curl -sS https://api.hiddentunes.com/health
curl -sS https://api.hiddentunes.com/ready
curl -sS 'https://api.hiddentunes.com/api/songs?q=Afrobeats&limit=3'
```
