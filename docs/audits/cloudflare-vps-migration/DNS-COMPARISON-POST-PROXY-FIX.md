# DNS comparison after approved proxy fixes

**Captured:** 2026-07-30  
**Zone:** `hiddentunes.com` (`b037977471bcbcd9eb403ae15c691251`)  
**Cloudflare status:** `pending` (NS not switched yet)  
**Cloudflare-assigned NS:** `sneh.ns.cloudflare.com`, `wells.ns.cloudflare.com`  
**Current registrar NS:** `lunar.dns-parking.com`, `solar.dns-parking.com`

## Proxy status applied (approved modification)

| Name | Type | Proxy | Notes |
| --- | --- | --- | --- |
| `ftp` | A | DNS-only | Set grey cloud |
| `autoconfig` | CNAME | DNS-only | Set grey cloud |
| `autodiscover` | CNAME | DNS-only | Set grey cloud |
| `hostingermail-a._domainkey` | CNAME | DNS-only | Set grey cloud |
| `hostingermail-b._domainkey` | CNAME | DNS-only | Set grey cloud |
| `hostingermail-c._domainkey` | CNAME | DNS-only | Set grey cloud |
| `@` (apex A/AAAA) | A/AAAA | Proxied | Left orange |
| `admin` | A | Proxied | Left orange |
| `api` | A | Proxied | Left orange |
| `www` | CNAME | Proxied | **Unchanged** — no proof Hostinger requires DNS-only |

## Verification vs `DNS-INVENTORY-BEFORE.md`

| Check | Result |
| --- | --- |
| Website apex A/AAAA present | **PASS** — IPs rotated vs inventory snapshot (Hostinger CDN expected) |
| `www` CNAME → `www.hiddentunes.com.cdn.hstgr.net` | **PASS** — preserved; proxy left as-is |
| MX `5 mx1.hostinger.com` / `10 mx2.hostinger.com` | **PASS** — DNS-only |
| SPF `v=spf1 include:_spf.mail.hostinger.com ~all` | **PASS** |
| DMARC `v=DMARC1; p=none` | **PASS** |
| DKIM a/b/c CNAMEs | **PASS** — all three present, DNS-only |
| `admin` → `148.230.109.215` Proxied | **PASS** |
| `api` → `148.230.109.215` Proxied | **PASS** (new vs inventory “missing”) |
| Mail/FTP not proxied | **PASS** |

## Verdict

**All required rows match. Safe to proceed with nameserver cutover.**
