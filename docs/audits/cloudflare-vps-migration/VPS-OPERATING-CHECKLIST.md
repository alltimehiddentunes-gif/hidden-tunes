# VPS-native songs API operating checklist

Public host: `https://api.hiddentunes.com`  
Origin: `148.230.109.215` / PM2 `hidden-tunes-api` → `127.0.0.1:3100`  
Edge SSL: Cloudflare **Full (strict)**

## Daily / on-call checks

```bash
# Process
pm2 status hidden-tunes-api
pm2 describe hidden-tunes-api | egrep 'status|restarts|uptime|memory|unstable'
pm2 logs hidden-tunes-api --lines 80

# Host resources
free -m
uptime
df -h /

# Local origin (TLS)
curl -sk -o /dev/null -w 'health:%{http_code}\n' -H 'Host: api.hiddentunes.com' https://127.0.0.1/health
curl -sk -o /dev/null -w 'ready:%{http_code}\n' -H 'Host: api.hiddentunes.com' https://127.0.0.1/ready

# Public edge
curl -sS -o /dev/null -w 'health:%{http_code}\n' https://api.hiddentunes.com/health
curl -sS -o /dev/null -w 'ready:%{http_code}\n' https://api.hiddentunes.com/ready

# Nginx
sudo nginx -t
sudo tail -n 100 /var/log/nginx/access.log | grep '/api/songs'
sudo tail -n 50 /var/log/nginx/error.log
# Rough 4xx/5xx sample (adjust path if split logs added later)
sudo awk '$9 ~ /^[45]/' /var/log/nginx/access.log | tail -n 50
```

## Cloudflare dashboard (no extra platform)

1. Zone `hiddentunes.com` → Analytics → Traffic / Errors  
2. Confirm SSL/TLS encryption mode remains **Full (strict)**  
3. DNS: `api` A → `148.230.109.215` **Proxied**

## Do not

- Expose port `3100` publicly  
- Switch SSL to Flexible  
- Restart `hidden-tunes-admin` unless diagnosing admin specifically  
- Point mobile Search back at Render
