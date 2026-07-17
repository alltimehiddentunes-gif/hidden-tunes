# Worldwide Live Sports Provider Candidate Audit

**Date:** 2026-07-17  
**Scope:** Read-only research for Hidden Tunes Sports **second provider** (after Olympics YouTube pilot)  
**Rule:** Do not implement in this task. Prefer free legal **live** competitions that can remain **inside** Hidden Tunes via lawful in-app delivery.

---

## Research method

Evaluated lawful integration models only:

- Official federation / league YouTube live embeds  
- Official embeddable players and documented video APIs returning publisher embeds  
- Official SDKs / syndication programs  
- Free registration platforms (geo-aware)  
- Public-service / FAST distribution where authorization is clear  

**Explicitly rejected as Hidden Tunes inventory sources:**

| Source | Reason |
|--------|--------|
| SportSRC API | Unverifiable ownership; aggregated iframe streams without rights-holder authorization evidence |
| EmbedSportex | Same — free multi-source sports iframes; treat as unauthorized restream risk |
| Community IPTV / m3u sports lists | Unauthorized |
| Scraped googlevideo / hidden manifests | YouTube/ToS violation |

Technical accessibility ≠ legal permission.

---

## Scoring legend (0–5)

Live-event value · In-app playback · Official-source confidence · Legal clarity · Territory coverage · Metadata quality · Schedule availability · Technical stability · Integration effort (5 = easy) · Long-term catalog potential  

**Penalties applied for:** external-only, unclear rights, irregular live schedule, scrape requirement, fragile tokens, circumvention, unverifiable ownership, no repeatable feed.

---

## Shortlist (≤10)

### 1) ScoreBat Video API — **PRIMARY recommendation**

| Field | Evidence |
|-------|----------|
| Provider | ScoreBat |
| Legal org | ScoreBat (commercial football video/widget platform) |
| Domain | https://www.scorebat.com/ |
| Sports | Football (global competitions) |
| Live types | Official live broadcasts **when published** by leagues/clubs; highlights |
| Frequency | High for football calendars; live endpoint ~5 min before kickoff |
| Playback tech | Official **embed HTML** from original publishers (often YouTube / official sites) |
| In-app mode | WebView official embed — `OFFICIAL_EMBED_ALLOWED` (conditional) |
| Native feed | No (does not host files) |
| API | Documented Video API + live-streams endpoint + free-feed |
| Auth | API token (server-side) |
| Geo | Inherited from each publisher embed / YouTube |
| Commercial | Paid plans for production; free feed for testing |
| Docs | https://www.scorebat.com/video-api/docs/ |
| Last verified | 2026-07-17 |
| Uncertainties | Must confirm commercial redistribution of embeds for Hidden Tunes app store distribution; per-item publisher terms still apply; live coverage is opportunistic not guaranteed for every match |

**Scores:** Live 5 · In-app 4 · Official 4 · Legal 3 · Territory 4 · Metadata 4 · Schedule 5 · Stability 4 · Effort 4 · Catalog 5  

**Classification:** `OFFICIAL_EMBED_ALLOWED` (with commercial-terms confirmation)  
**Why primary:** Best evidence of **repeatable free live football embeds** + fixtures metadata + documented API — closest to “live matches inside Hidden Tunes” without scraping.

---

### 2) ICC Official YouTube — **fallback A**

| Field | Evidence |
|-------|----------|
| Provider | International Cricket Council |
| Domain | https://www.icc-cricket.com / YouTube ICC |
| Sports | Cricket |
| Live | Selected free live matches / warm-ups in territories without exclusive broadcast (e.g. Women’s T20 WC coverage expansions) |
| Playback | YouTube IFrame when embeddable |
| Mode | `OFFICIAL_EMBED_ALLOWED` |
| Territory | Event-specific allowlists; ICC.tv elsewhere |
| Uncertainty | Live volume bursty; many matches still pay-TV |

**Scores:** Live 4 · In-app 4 · Official 5 · Legal 4 · Territory 3 · Metadata 3 · Schedule 3 · Stability 4 · Effort 5 · Catalog 3  

---

### 3) BWF TV (Badminton World Federation YouTube) — **fallback B**

| Field | Evidence |
|-------|----------|
| Provider | Badminton World Federation |
| Channel | https://www.youtube.com/c/bwftv |
| Sports | Badminton |
| Live | Tour / championship live streams on official channel (geo may apply) |
| Mode | `OFFICIAL_EMBED_ALLOWED` |
| Strength | Clear federation ownership; regular calendar |
| Uncertainty | Confirm which events remain free vs geo-blocked |

**Scores:** Live 4 · In-app 4 · Official 5 · Legal 4 · Territory 3 · Metadata 3 · Schedule 4 · Stability 4 · Effort 5 · Catalog 3  

---

### 4) FIBA YouTube / Courtside 1891

| Field | Evidence |
|-------|----------|
| Provider | FIBA |
| Sports | Basketball (national teams, windows, youth) |
| Live | Select free YouTube / Courtside 1891 |
| Mode | YouTube → `OFFICIAL_EMBED_ALLOWED`; Courtside → often `METADATA_AND_DEEP_LINK_ONLY` or partnership |
| Uncertainty | Courtside terms for third-party embedding unclear |

**Scores:** Live 4 · In-app 3 · Official 5 · Legal 3 · Territory 3 · Metadata 3 · Schedule 4 · Stability 3 · Effort 3 · Catalog 4  

---

### 5) World Athletics+ / World Athletics YouTube

| Field | Evidence |
|-------|----------|
| Provider | World Athletics |
| Domain | https://worldathletics.org/watch/live |
| Live | Free World Athletics+ streams in unsold territories; sometimes YouTube |
| Mode | `OFFICIAL_EMBED_ALLOWED` for YouTube; WA+ may be `PARTNERSHIP_REQUIRED` / external |
| Uncertainty | Registration + geo; embedding WA+ player not publicly documented |

**Scores:** Live 4 · In-app 2 · Official 5 · Legal 3 · Territory 3 · Metadata 4 · Schedule 4 · Stability 3 · Effort 2 · Catalog 4  

---

### 6) FIFA+ on DAZN (free-to-view football)

| Field | Evidence |
|-------|----------|
| Provider | FIFA / DAZN |
| Live | Large volume of free MA matches (thousands/year, selected territories) |
| Mode | `PARTNERSHIP_REQUIRED` for in-app; currently `METADATA_AND_DEEP_LINK_ONLY` |
| Why listed | Highest live football value long-term if licensing opens |
| Uncertainty | Exclusive DAZN distribution; no public embed API found |

**Scores:** Live 5 · In-app 1 · Official 5 · Legal 2 · Territory 4 · Metadata 4 · Schedule 5 · Stability 4 · Effort 1 · Catalog 5  

---

### 7) UCI / World Cycling YouTube

| Field | Evidence |
|-------|----------|
| Sports | Cycling |
| Live | Select free race streams / highlights on official channels |
| Mode | `OFFICIAL_EMBED_ALLOWED` when YouTube-live |
| Catalog | Seasonal peaks |

**Scores:** Live 3 · In-app 4 · Official 4 · Legal 4 · Territory 3 · Metadata 3 · Schedule 3 · Stability 3 · Effort 5 · Catalog 2  

---

### 8) World Aquatics / swimming federation YouTube

| Field | Evidence |
|-------|----------|
| Sports | Swimming, diving, water polo |
| Live | Championship windows on official channels |
| Mode | `OFFICIAL_EMBED_ALLOWED` |

**Scores:** Live 3 · In-app 4 · Official 4 · Legal 4 · Territory 3 · Metadata 3 · Schedule 3 · Stability 3 · Effort 5 · Catalog 2  

---

### 9) National federation YouTube live (CAF / AFC / CONMEBOL youth & cups — sample class)

| Field | Evidence |
|-------|----------|
| Pattern | Many confederations/NAs publish free YouTube live for lower-tier / youth / cups |
| Mode | `OFFICIAL_EMBED_ALLOWED` per channel audit |
| Risk | Fragmented; each needs own rights audit |

**Scores:** Live 3 · In-app 4 · Official 3 · Legal 3 · Territory 2 · Metadata 2 · Schedule 2 · Stability 2 · Effort 3 · Catalog 4  

---

### 10) Public-service sports FAST / YouTube (e.g. selected PBS/BBC Sport YouTube highlights; not live rights)

| Field | Evidence |
|-------|----------|
| Live value | Often highlights-first; live usually geo-locked to home market |
| BBC Sport live | UK-centric; syndication API is partnership |
| Mode | Mostly `METADATA_AND_DEEP_LINK_ONLY` for live |

**Scores:** Live 2 · In-app 2 · Official 4 · Legal 3 · Territory 2 · Metadata 3 · Schedule 2 · Stability 3 · Effort 2 · Catalog 2  

---

## Recommendation

### Primary second provider: **ScoreBat Video API**

**Why it best supports free legal live in-app watching**

1. Documented **live-streams** endpoint returning **official publisher embed codes** (not hosted pirate files).  
2. Football calendar density → real live matches, not highlights-only.  
3. Fits Hidden Tunes Sports architecture already proven with Olympics: metadata browse + tap-to-resolve → `official_embed` WebView.  
4. Server-side token; no client secrets; SSRF allowlist per embed host still required.  

**Expected playback mode:** `official_embed` (WebView)  
**Expected sports coverage:** Global football (subset per plan)  
**Territory limitations:** Per underlying publisher / YouTube geo; unknown country → conservative  
**Legal/technical uncertainties:** Commercial app redistribution terms; ScoreBat branding/ads on free tier; must refuse any item whose embed host fails allowlist/SSRF; must not extract progressive URLs from embeds  

**Exact next implementation scope (separate approval):**

```text
1. docs/sports/providers/scorebat-audit.md (full terms review)
2. lib/sports/providers/scorebat/* adapter (discoverFixtures/Broadcasts only)
3. Bounded import --provider=scorebat --limit=25 dry-run
4. Wire broadcasts/[id]/play → official_embed only
5. Provider kill switch + staging smoke
6. No production flags
```

### Fallbacks

1. **ICC YouTube** — cricket live bursts; same Olympics-pattern adapter  
2. **BWF TV YouTube** — regular badminton live; same pattern  

### Future / BD track (not preferred now)

- FIFA+ on DAZN (partnership)  
- World Athletics+ player (embedding unclear)  
- FIBA Courtside (embedding unclear)  
- Confederation YouTube portfolios (fragmented audits)  

---

## Comparison table

| Rank | Provider | Live in-app | Classification | Sports | Key risk |
|------|----------|-------------|----------------|--------|----------|
| 1 | ScoreBat | Strong | OFFICIAL_EMBED_ALLOWED* | Football | Commercial terms |
| 2 | ICC YouTube | Medium | OFFICIAL_EMBED_ALLOWED | Cricket | Territory / schedule bursts |
| 3 | BWF TV | Medium | OFFICIAL_EMBED_ALLOWED | Badminton | Event geo |
| 4 | FIBA YT/Courtside | Medium | Mixed | Basketball | Courtside terms |
| 5 | World Athletics | Medium | Mixed | Athletics | WA+ embed unknown |
| 6 | FIFA+/DAZN | High value | PARTNERSHIP_REQUIRED | Football | No public embed API |
| 7 | UCI YT | Low–Med | OFFICIAL_EMBED_ALLOWED | Cycling | Seasonal |
| 8 | World Aquatics YT | Low–Med | OFFICIAL_EMBED_ALLOWED | Aquatic | Seasonal |
| 9 | Confed YT class | Med | Per-audit | Football regional | Fragmentation |
| 10 | PSB/FAST | Low live | Mostly external | Mixed | Geo / syndication |

\*Pending commercial-terms confirmation before code.

---

## Stop rule

This document is **audit only**. Do not implement ScoreBat (or any second provider) until explicit approval after Olympics staging smoke sign-off.
