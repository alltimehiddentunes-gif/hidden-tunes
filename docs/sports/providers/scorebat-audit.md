# ScoreBat Video API — Provider Audit (Phase 3A)

**Date:** 2026-07-17  
**Provider key:** `scorebat`  
**Classification:** `OFFICIAL_EMBED_ALLOWED` (publisher embeds via documented Video API)  
**Status:** Flag-gated pilot — not publicly activated

---

## API version

- **Video API v3** — `https://www.scorebat.com/video-api/v3/`
- Docs: https://www.scorebat.com/video-api/docs/

## Authentication

- Query parameter: `token=[SCOREBAT_API_TOKEN]`
- Token obtained from ScoreBat dashboard Access tab
- **Server-side only** — never ship to clients, Git, fixtures, or logs

## Endpoints

| Endpoint | Path | Notes |
|----------|------|-------|
| Free Feed | `/free-feed/` | Limited leagues / older highlights; free plan |
| Featured Feed | `/featured-feed/` | Paid — curated recent/important matches |
| Competition | `/competition/{slug}/` | Paid — e.g. `england-premier-league` |
| Team | `/team/{slug}/` | Paid — e.g. `arsenal` |
| Live Streams | `/live-streams/` | Matches with official embeddable live streams (~5 min before KO) |
| Updated Endpoints | `/updated-endpoints/` | Detect which feeds changed |

## Response shape (sanitized)

```json
{
  "response": [
    {
      "title": "Chelsea - Manchester United",
      "competition": "ENGLAND: Premier League",
      "date": "2029-05-18T15:00:00+0000",
      "thumbnail": "https://…",
      "homeTeam": { "name": "Chelsea", "slug": "chelsea", "id": 229 },
      "awayTeam": { "name": "Manchester United", "slug": "manchester-united", "id": 243 },
      "videos": [
        { "id": "…", "title": "Highlights", "embed": "<iframe …>" }
      ]
    }
  ]
}
```

## Free-feed limitations

- Subset of leagues / often older games
- Preview of full API — **does not prove broad live inventory**
- Ads / ScoreBat branding may appear on free plan
- Exceeding paid quota drops account to Free plan until next period

## Quota / credits (documented)

- Each Video API call = **5** monthly requests
- Each video view / widget display = **1** request
- Starter 5k / Standard 20k / Advanced 100k (plan-dependent)

## Live-video availability

- Live Streams endpoint returns only matches with **official embeddable** streams
- Opportunistic — not every fixture has a live stream
- Items appear ~5 minutes before kickoff
- Includes live + recently ended (replay where available)

## Embedding

- Response includes HTML `embed` iframe pointing at ScoreBat / publisher players
- Mobile: extract iframe `src` into WebView
- Autoplay: optional `&autoplay=1` on embed URL (Hidden Tunes pilot keeps user-gesture)

## Branding

- Free plan: ScoreBat logos / ads may appear
- Paid Starter+: ads removed; higher tiers remove branding

## Rate / update frequency

- No hard published RPS in docs; treat conservatively
- Pilot poll defaults: discovery disabled; when enabled ~120s for live window
- Do **not** poll from `/api/sports/home`

## Commercial / trial

- Free feed usable for testing without purchase
- Production live coverage requires paid plan + commercial terms confirmation
- **This phase does not purchase or upgrade a plan**

## Hidden Tunes integration rules

- Playback mode: embed / webview only — never extract HLS/DASH
- Browse APIs: no embed HTML, no API token, no raw stream URLs
- Kill switches: `SPORTS_SCOREBAT_*` env + provider row kill_switch
- Dry-run default for import CLI
