# Olympics Provider Audit — Hidden Tunes Sports Phase 2A

**Classification: `OFFICIAL_EMBED_ALLOWED`**

**Date:** 2026-07-17  
**Auditor:** Hidden Tunes Sports Phase 2A  
**Provider slug:** `olympics`

---

## Identity

| Field | Value |
|--------|--------|
| Provider name | Olympics (official YouTube channel) |
| Legal entity | International Olympic Committee (IOC) |
| Official domain | `olympics.com` |
| Official YouTube | `https://www.youtube.com/@Olympics` |
| Content owner | IOC / Olympic Movement rights holders |
| Distribution role | Official public digital distribution of Olympic archive content, highlights, and selected free programming via YouTube |
| Countries served | Worldwide metadata; **YouTube enforces per-video geographic restrictions at playback time** |
| Sports covered | Multi-sport Olympic disciplines (athletics, swimming, gymnastics, winter sports, etc.) |

Evidence:

- Official Olympics site: https://www.olympics.com/
- Official YouTube handle `@Olympics`
- YouTube public statements that Olympic highlights/archive appear on the Olympics channel in select territories ([YouTube Blog — Paris 2024](https://blog.youtube/news-and-events/paris-2024-olympics-on-youtube/))

---

## Access

| Field | Value |
|--------|--------|
| Public API/feed | YouTube Data API v3 (Google) — official, documented |
| Official public webpage | olympics.com + YouTube channel pages |
| Authentication | YouTube Data API key (server-side only). No user OAuth required for public channel listing. |
| Rate limits | YouTube Data API quota (default 10,000 units/day). Bounded pilot import ≤100 videos. |
| Pagination | `pageToken` / `maxResults` (≤50 per page) |
| Update frequency | Manual, bounded import only in Phase 2A (no daemon) |
| Stream formats | **Not used.** No HLS/DASH extraction. |
| Metadata formats | YouTube `snippet` / `contentDetails` / `status` JSON |

---

## Playback

| Field | Value |
|--------|--------|
| HLS | Not authorized for Hidden Tunes (no extraction) |
| DASH | Not authorized |
| MP4 | Not authorized |
| YouTube embed | **Yes — official IFrame embed when `embeddable=true`** |
| Official iframe | `https://www.youtube.com/embed/{videoId}` (or youtube-nocookie) |
| Native SDK | Not used in Phase 2A |
| DRM status | YouTube-managed; no DRM bypass |
| Token requirements | None for public embeddable videos |
| Referer requirements | YouTube requires a valid HTTP Referer for embeds ([YouTube Help](https://support.google.com/youtube/answer/171780)) |
| Cookie requirements | Handled by YouTube player; do not scrape cookies |

**Hard rule:** Hidden Tunes must **never** extract progressive/HLS URLs from YouTube pages, DevTools, or unofficial scrapers.

---

## Rights

| Question | Conclusion |
|----------|------------|
| Is embedding allowed? | **Yes, when the video’s YouTube status is embeddable**, under [YouTube Embedded Player / API Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) |
| Is direct playback allowed? | **No** for Hidden Tunes Phase 2A — classify as embed/external only |
| Is redistribution prohibited? | Redistributing raw media files is prohibited. Embedding via official player is the permitted mode. |
| Are deep links required? | Deep link to `youtube.com/watch?v=` is always available as fallback (`external`) |
| Are logos permitted? | Use official artwork/thumbnails returned by YouTube Data API; do not invent IOC branding packs |
| Are event metadata and thumbnails permitted? | Yes via YouTube Data API fields (title, description, thumbnails) |
| Geographic restrictions documented? | Per-video; YouTube blocks at runtime. Represent as `PROVIDER_RUNTIME_CHECK` |
| Are recordings/replays allowed? | Only as published on the official channel; no local recording |

**Rights basis for pilot:**  
`official_youtube_embed` + IOC channel ownership + YouTube embeddable status.

Silence in IOC terms is **not** treated as permission for direct HLS redistribution.

---

## Territory

| Mode | Value |
|------|--------|
| Primary | `PROVIDER_RUNTIME_CHECK` (YouTube geo) |
| Browse metadata | Worldwide metadata may be shown when Sports feature is locally enabled |
| Allowlist | None hard-coded (unknown per video) |
| Denylist | None hard-coded |
| Unknown viewer country | Metadata OK; playback may fail at YouTube — do not claim worldwide free play |

---

## Hidden Tunes suitability

```text
OFFICIAL_EMBED_ALLOWED
```

Not `DIRECT_PLAY_ALLOWED` — no evidence supports in-app HLS/DASH of Olympic media.

Fallback modes:

- `official_embed` (preferred when embeddable)
- `external_only` (watch on YouTube) when embed is disabled or blocked

---

## Phase 2A pilot scope

- 1 provider: `olympics`
- Sports: multi-sport Olympic (mapped primarily to athletics / swimming / winter as tags)
- Inventory: up to 100 official videos/highlights from the Olympics uploads playlist
- Channels: 1 (Olympics YouTube)
- Competitions: ≤5 lightweight taxonomy rows (e.g. Olympic Games, Winter Olympics)
- No continuous workers
- Provider defaults: `enabled=false`, public ingestion off, playback off until explicit admin enablement for local testing

---

## Rejected alternatives (this phase)

| Candidate | Reason |
|-----------|--------|
| Random IPTV “sports” lists | Unauthorized |
| FIFA+ premium live rights | Commercial / partnership likely required for aggregation |
| Scraped broadcaster m3u | Unauthorized |
| Extracting YouTube googlevideo URLs | Violates YouTube ToS; not official |

---

## Go / No-go

**GO for Phase 2A** under `OFFICIAL_EMBED_ALLOWED` only.

Production public enablement remains **out of scope** until separate approval.
