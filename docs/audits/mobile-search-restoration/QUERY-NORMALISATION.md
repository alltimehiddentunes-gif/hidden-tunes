# Query Normalisation

Boundary helper: `utils/globalSearchQuery.ts`

| Input | Backend query |
| --- | --- |
| `Afrobeat` | `Afrobeats` |
| `afrobeats` | `Afrobeats` |
| `Afrobeats latest` | `Afrobeats latest` (phrase preserved) |
| `Al-Jazeera` | `Al Jazeera` |
| `R&B` | `R&B` (exact token preserved) |
| `South Africa` | `South Africa` (music free-text; TV country ISO handled in TV helpers) |

Normalisation applies only at the search request boundary. Catalogue titles are not rewritten.
