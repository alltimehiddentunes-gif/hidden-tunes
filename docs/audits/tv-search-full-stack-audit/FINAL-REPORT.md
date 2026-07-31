# Final Report — Mobile TV Search Full-Stack Audit

## 1. Workspace proof

### Mobile

| Field | Value |
| --- | --- |
| Path | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` |
| Git root | same |
| Branch | `fix/library-content-type-safe` |
| HEAD | `8585f821fbd51ef9b876cad6144a5fc9e268660b` |
| Prior baseline `c6a61b8` | Not equal (expected; no branch switch) |
| Dirty | Yes (pre-existing PlayerContext / HiddenAudio work preserved + this repair) |
| App version | `1.0.1` (app.json); local iOS buildNumber `1.0.0`, android versionCode `3` |
| API base | `https://admin.hiddentunes.com` |

### SSD

| Field | Value |
| --- | --- |
| Volume | D: `llordwills` NTFS ~1.86TB free |
| Key repo | `D:\HiddenTunes\Active\HiddenTunes-Desktop` @ `desktop/integrate-home-music-split` / `3b4a91f` |

### Laptop backend copies

| Path | Branch/HEAD | Authority |
| --- | --- | --- |
| `C:\Users\Wills\Desktop\HiddenTunes` | `feature/radio-worldwide-40k` / `70f8f95` | Likely active backend source; runtime is admin.hiddentunes.com |
| `HiddenTunes-TV-40K-EXPANSION` | `feature/tv-worldwide-40k-expansion` / `19b0209` | Expansion/import |
| Many other Desktop archives | varies | Archive / unsafe |

## 2. Authoritative backend

**Runtime:** `https://admin.hiddentunes.com` serving Supabase project `kojcyswxfuikxmqntwye`.  
**Source copies:** laptop + SSD `hidden-tunes-admin` (videos route equivalent).  
**Deploy not executed; production data not mutated.**

## 3. Defect reproduction

| Query | Expected | Exists eligible? | API returned | Mobile rendered (before → after) |
| --- | --- | ---: | ---: | --- |
| Al-Jazeera | Al Jazeera* | yes | 0 raw / 10 normalised | miss → **hit** |
| South Africa | ZA set | yes (19 via country) | 0 via q | miss → **hit** |
| BBC | BBC* | yes (20) | 20 | hit → hit |
| News | News* | yes (438 pages) | paginated | page1+load more |
| NHK / Cartoon Network / DSTV | brand | **no** | 0 | miss → miss (DB/eligibility) |

## 4. Exact root cause

Multiple causes:

1. **Mobile request:** country names not mapped to ISO; hyphenated titles not normalised; failures shown as empty.
2. **Backend/DB:** many brands absent from eligible public set; `/api/tv/search` narrower than `/videos?q=` (desktop impact).
3. **Not** local-only filtering, title dedupe, or first-page hard stop on the TV destination.

## 5. Count funnel

See `COUNT-FUNNEL.md` — BBC 20→20; South Africa 0→19 after repair; News 438 across pages; missing brands 0 at API.

## 6. Repositories compared

Mobile (authority for app), SSD desktop (comparison only), laptop backend (contract match), TV-40K expansion (import lineage), archives untouched.

## 7. Files changed

See `FIX-LOG.md`. Mobile-only repair + audit docs + focused test.

## 8. Behaviour after repair

| Behaviour | Status |
| --- | --- |
| Exact / partial title | Works via `/api/tv/videos?q=` |
| Country name | Works via ISO map + `country=` merge |
| Hyphenated titles | Works via normalisation |
| Language/category as free text | Only if present in searchable fields / titles |
| Pagination | Retains query; load more works |
| Retry | Search error Retry re-runs search |
| Clear search | Restores browse |
| Playback owner | Unchanged |

## 9. Validation

- `npx tsx scripts/test-tv-search-coverage.ts` → **PASS**
- `tsc` / `lint` → pre-existing failures; no new source errors attributed to this repair beyond existing script `@types/node` pattern

## 10. Remaining issues

| Bucket | Issue | Needs |
| --- | --- | --- |
| Mobile | Discover TV preview still capped at 8 | Product decision only |
| Backend | `/api/tv/search` field parity | Code + **deploy** |
| Backend | Honest totals instead of sentinel | Code + deploy |
| Database/import | Missing eligible brands (NHK, Cartoon, DSTV, …) | Audit import/health; **approval** before mutation |
| Unrelated | Dirty PlayerContext / iOS interruption work | Separate track |

## 11. Safety confirmation

- branch switch: **No**
- reset / clean / stash: **No**
- commit / push / deploy: **No**
- production data / RLS changed: **No**
- playback owner replaced: **No**
- desktop source modified: **No**
- AfriMeetup touched: **No**

## Verdict

`Hidden Tunes mobile TV search still omits valid channels because one or more mobile, backend, database or deployment defects remain unresolved.`

Mobile request/UX defects for country names, hyphenated titles, and false empty errors are repaired locally. Channels that production never returns in the eligible public catalogue (and backend deploy/data work) remain unresolved.
