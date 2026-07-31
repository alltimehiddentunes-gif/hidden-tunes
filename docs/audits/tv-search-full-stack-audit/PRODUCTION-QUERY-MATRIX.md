# Production Query Matrix

Live host: `https://admin.hiddentunes.com`  
Client path under test: mobile `/api/tv/videos` (Android platform param)

| Query | Expected channel | Known in eligible catalogue? | API `/videos?q=` | `/api/tv/search` | Mobile before | Mobile after | Failure layer |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `BBC` | BBC* channels | yes (20) | 20 | 20 | would show | shows | none for title search |
| `CNN` | CNN* | yes (16) | 16 | 16 | show | show | none |
| `Al Jazeera` | Al Jazeera* | yes (10) | 10 | 10 | show | show | none |
| `Al-Jazeera` | Al Jazeera* | yes | **0** | 0 | miss | **hit via normalize** | mobile query punctuation (fixed) |
| `ESPN` | ESPN family | partial (2: ESPNews, ESPNU) | 2 | 2 | partial | partial | catalogue/eligibility — no main “ESPN” title |
| `NHK` / `NHK World` | NHK | **no eligible row** | 0 | 0 | miss | miss | database/import or eligibility |
| `Cartoon` / `Cartoon Network` | Cartoon Network | **no** | 0 | 0 | miss | miss | database/import or eligibility |
| `South Africa` | ZA channels | yes via `country=ZA` (19) | **0** | 0 | miss | **hit via country map** | country name vs ISO (fixed on mobile) |
| `ZA` | ZA channels | yes | via region ILIKE / filter | — | if typed | works | — |
| `Nigeria` | NG channels | title hits 2; country=NG larger | 2 | 2 | partial | **merged with NG filter** | country-name coverage |
| `News` | News-titled | yes (**438** across pages) | page1 40 hasMore | similar | page1 only unless load-more | same + truthful empty/error | pagination must be used |
| `Sports` | Sports* | videos 41+/hasMore; search endpoint 31 | broader | narrower | uses videos | uses videos | `/search` narrower than `/videos` |
| `SABC` | SABC* | yes (2) | 2 | 2 | show | show | — |
| `DSTV` / `SuperSport` / `Mzansi Magic` | local brands | **no eligible** | 0 | 0 | miss | miss | database/import or eligibility |
| `Sky Sports` | Sky Sports* | partial (2) | 2 | 2 | show | show | — |
| `France 24` | France 24* | yes (30) | 30 | 30 | show | show | — |
| `Canal+` | Canal+ | yes (1) | 1 | — | show | show | — |

## Notes

- “Exists in catalogue” here means **public eligible API**, not raw `tv_videos` table (service role not used).
- Many expected consumer brands are absent from the **eligible** public set even though browse pagination shows **≥1500** other eligible stations.
