# Root Cause

## Exact loss layers (proven)

### 1. Country-name free-text never matches ISO `region` (mobile + backend contract)

- Production stores country as ISO codes (`ZA`, `US`, …).
- `q=South Africa` → **0**; `country=ZA` → **19**.
- Mobile previously sent only `q=`, so country-name searches looked empty despite eligible channels existing.

### 2. Hyphenated / punctuated titles fail ILIKE unless normalised (mobile request shaping)

- `q=Al-Jazeera` → **0**; normalised `Al Jazeera` → **10**.
- Loss happened **before** the parser — wrong request string.

### 3. Many expected brands are absent from the eligible public API (backend/DB)

- `NHK`, `Cartoon Network`, `DSTV`, `SuperSport`, `Mzansi Magic`, `BBC One`, `CNN International` return **0** from both `/api/tv/videos?q=` and `/api/tv/search`.
- These are **not** dropped by mobile normaliser/filter on a non-empty payload — the API never returns them.
- Likely causes: never imported, failed health, or excluded by public eligibility. **No DB mutation authorised.**

### 4. False “no results” on transport failure (mobile UX)

- `fetchTvSearchPage` treated failed catalogue responses as empty success lists.
- UI showed “No TV matches” instead of an error + Retry.

### 5. Not the primary causes (ruled out for TV destination)

| Hypothesis | Result |
| --- | --- |
| Local-only search of loaded cards | False — always hits `/api/tv/videos` |
| First-page-only hard stop | False — hasMore + load more works (`News` → 438) |
| Title-based dedupe collapsing regions | False — id dedupe only |
| Mobile playable filter removing API hits | False on BBC sample (0 drops) |
| Wrong param name (`search` vs `q`) | False — sends `q` |
| Empty-array cache poisoning | False — caches only non-empty search pages |

## Multiple causes verdict

Missing channels are explained by **multiple layers**:

1. Mobile request shaping (country names, hyphen normalisation, error UX) — **repaired locally**
2. Backend/DB eligibility / import gaps for specific brands — **unresolved without deploy/data work**
3. Narrower `/api/tv/search` (affects desktop more than mobile) — **documented, not deployed**
