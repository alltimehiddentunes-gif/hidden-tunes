# DNS inventory before Cloudflare migration

**Captured:** 2026-07-30  
**Authoritative NS (current):** Hostinger `lunar.dns-parking.com`, `solar.dns-parking.com`  
**Serial:** `2026073001`  
**Do not change nameservers until every row below is present in Cloudflare.**

## Apex / mail / verification

| Name | Type | Value | Notes |
| --- | --- | --- | --- |
| `hiddentunes.com` | NS | `lunar.dns-parking.com` / `solar.dns-parking.com` | Registrar NS today |
| `hiddentunes.com` | A | `92.113.16.13`, `92.113.23.88` (Hostinger CDN; rotates) | Website |
| `hiddentunes.com` | AAAA | Hostinger IPv6 (rotates) | Website |
| `hiddentunes.com` | MX | `5 mx1.hostinger.com` | **DNS-only after CF** |
| `hiddentunes.com` | MX | `10 mx2.hostinger.com` | **DNS-only after CF** |
| `hiddentunes.com` | TXT | `v=spf1 include:_spf.mail.hostinger.com ~all` | SPF |
| `_dmarc.hiddentunes.com` | TXT | `v=DMARC1; p=none` | DMARC |
| `hostingermail-a._domainkey.hiddentunes.com` | CNAME | `hostingermail-a.dkim.mail.hostinger.com` | DKIM — **DNS-only** |
| `hostingermail-b._domainkey.hiddentunes.com` | CNAME | `hostingermail-b.dkim.mail.hostinger.com` | DKIM — **DNS-only** |
| `hostingermail-c._domainkey.hiddentunes.com` | CNAME | `hostingermail-c.dkim.mail.hostinger.com` | DKIM — **DNS-only** |

## Subdomains

| Name | Type | Value | Proxy after CF |
| --- | --- | --- | --- |
| `www.hiddentunes.com` | CNAME | `www.hiddentunes.com.cdn.hstgr.net` | Keep Hostinger website CDN unless replacing hosting |
| `admin.hiddentunes.com` | A | `148.230.109.215` | Proxied OK (VPS) |
| `ftp.hiddentunes.com` | A | `72.61.152.132` | Prefer DNS-only |
| `api.hiddentunes.com` | — | **missing** | Create A → `148.230.109.215` **Proxied** |

## Not found (probed)

No public CAA; no `api` record; no obvious Supabase/R2 custom-domain TXT at apex; common `_acme-challenge` / `_vercel` / `_github-challenge` empty.

## VPS origin (already live locally)

| Item | Value |
| --- | --- |
| Host | `srv1677509` / `148.230.109.215` |
| PM2 | `hidden-tunes-api` → `127.0.0.1:3100` |
| Nginx | `api.hiddentunes.com` site present (HTTP) |
| Admin | `hidden-tunes-admin` → `127.0.0.1:3000` — do not disturb |

## Cloudflare actions still required (operator)

1. Sign in to Cloudflare and add zone `hiddentunes.com`.
2. Import/recreate every inventory row (mail/DKIM DNS-only).
3. Add `api` A → `148.230.109.215` Proxied.
4. Change registrar NS to Cloudflare-assigned pair.
5. Origin cert + SSL Full (strict) for `api` (and admin if proxied).
6. Only then cut over mobile/desktop off Render.
