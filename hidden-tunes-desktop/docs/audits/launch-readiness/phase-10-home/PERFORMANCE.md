# Performance

| Concern | Mitigation |
|---------|------------|
| Section builders | `useMemo` per rail |
| All Songs | Windowed `HOME_CATALOG_PAGE_SIZE` |
| Images | Lazy below fold; `priority` only hero/first NEW |
| Progress ticks | Home does not subscribe to time updates |
| Empty rails | Not rendered |
| Emotional Worlds | Lane songIds resolved from indexes |

No full-catalogue filter in renderer for genres (server intent via search genre:).
