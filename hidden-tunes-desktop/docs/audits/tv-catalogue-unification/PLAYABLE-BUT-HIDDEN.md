# Playable-but-Hidden

## Funnel (read-only production DB)

| Stage | Count |
| --- | ---: |
| All rows | 17 795 |
| `playback_status=playable` | 16 319 |
| Approved+active+playable+not quarantined/disabled | 16 319 |
| Public eligible (fresh ≤7d + HTTPS + platform) | **5 908** |
| **Playable-but-stale-hidden** | **10 370** |

## Definition

Rows that satisfy playable/active/HTTPS/platform flags but fail `last_health_checked_at >= now()-7d`, therefore absent from public browse **and** search.

## Examples

| Channel | Found where | Plays flags | Production record | Searchable public | Fix |
| --- | --- | ---: | ---: | ---: | --- |
| NHK World-Japan* | `tv_videos` | yes | yes (multiple ids) | **No** | Approved `tv:health` revalidation — do not re-import duplicates |
| Cartoon Network Arabic | `tv_videos` | yes | yes (Shahid) | No | Legality review + optional revalidation; likely remain excluded |
| CNN International | `tv_videos` | yes | yes | No | Rights + revalidation |
| Al Jazeera (stale twins) | `tv_videos` | mixed | yes | partial (fresh only) | Revalidate stale twins; do not duplicate |
| WildEarth stale US/null | `tv_videos` | yes | yes | No (fresh ZA yes) | Revalidate; keep distinct region rows |

## Rule

**Do not import a second copy** of these channels. Attach/revalidate the **existing** `id`s.
