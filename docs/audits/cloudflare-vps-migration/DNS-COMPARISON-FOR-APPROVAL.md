# Cloudflare DNS — before/after comparison (STOP for approval)

**Zone:** `hiddentunes.com`  
**Cloudflare account:** Alltimehiddentunes@gmail.com  
**Zone status:** Pending (nameservers not switched yet)  
**Captured after:** Free plan onboard + automatic DNS import + `api` A record create  

**Do not change Hostinger nameservers until you explicitly approve this table.**

## Comparison

| Name | Type | Inventory (Hostinger live) | Cloudflare now | Match? | Proxy now | Required proxy |
| --- | --- | --- | --- | --- | --- | --- |
| `@` | A | Hostinger website CDN (rotating `92.113.*`) | `148.135.128.243`, `92.112.198.36` | Partial (Hostinger CDN rotates) | Proxied | Proxied OK for website |
| `@` | AAAA | Hostinger IPv6 (rotating) | 2 imported AAAA | Partial (rotates) | Proxied | Proxied OK |
| `www` | CNAME | `www.hiddentunes.com.cdn.hstgr.net` | same | Yes | Proxied | Prefer **DNS only** (Hostinger CDN) |
| `admin` | A | `148.230.109.215` | `148.230.109.215` | Yes | Proxied | Proxied OK |
| `ftp` | A | `72.61.152.132` | `72.61.152.132` | Yes | Proxied | **Must DNS only** |
| `@` | MX | `5 mx1` / `10 mx2.hostinger.com` | same | Yes | DNS only | DNS only |
| `@` | TXT SPF | Hostinger SPF | same | Yes | DNS only | DNS only |
| `_dmarc` | TXT | `v=DMARC1; p=none` | same | Yes | DNS only | DNS only |
| `hostingermail-a._domainkey` | CNAME | → `hostingermail-a.dkim.mail.hostinger.com` | same | Yes | Proxied | **Must DNS only** |
| `hostingermail-b._domainkey` | CNAME | → hostingermail-b… | same | Yes | Proxied | **Must DNS only** |
| `hostingermail-c._domainkey` | CNAME | → hostingermail-c… | same | Yes | Proxied | **Must DNS only** |
| `autoconfig` | CNAME | (discovered on import) | → `autoconfig.mail.hostinger.com` | Extra (good) | Proxied | **Must DNS only** |
| `autodiscover` | CNAME | (discovered on import) | → `autodiscover.mail.hostinger.com` | Extra (good) | Proxied | **Must DNS only** |
| **`api`** | A | missing | **`148.230.109.215`** | **NEW** | **Proxied** | **Proxied (required)** |

## Critical fixes still needed before NS switch

In Cloudflare DNS UI, set **Proxy status → DNS only** for:

1. `ftp`
2. `autoconfig`
3. `autodiscover`
4. `hostingermail-a._domainkey`
5. `hostingermail-b._domainkey`
6. `hostingermail-c._domainkey`
7. Recommended: `www` (Hostinger website CDN)

Leave proxied: `@` A/AAAA, `admin`, **`api`**.

## Nameservers

Not fetched yet (waiting for your approval). After approval we will:

1. Read the two Cloudflare nameservers from the zone Overview  
2. Open Hostinger nameserver settings  
3. You complete any Hostinger login/2FA  
4. Replace only `lunar`/`solar.dns-parking.com` with the Cloudflare pair  

## Browser note

Cursor Browser MCP disconnected after the `api` record was saved. Re-open Cloudflare DNS for `hiddentunes.com` if the tab closed, apply the DNS-only fixes above, then reply **approve** (or list edits) to continue.
