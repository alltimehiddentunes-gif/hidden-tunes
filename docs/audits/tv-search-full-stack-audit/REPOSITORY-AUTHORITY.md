# Repository Authority

## Production TV API (proven)

| Signal | Evidence |
| --- | --- |
| Public host | `https://admin.hiddentunes.com` |
| Mobile client | `TV_CATALOG_BASE_URL` hardcoded in `services/tvCatalogApi.ts` |
| Live probes | HTTP 200 for `/api/tv/videos`, `/api/tv/search`, `/api/tv/categories` |
| Supabase project | `kojcyswxfuikxmqntwye` referenced in laptop backend sports/production apply reports matching VPS `.env.production` |
| Response shape | `{ success, videos[], pagination { page, limit, total, totalPages, hasMore }, platform? }` |

## Classification

| Copy | Class | Notes |
| --- | --- | --- |
| Production deployment at `admin.hiddentunes.com` | **Authoritative production runtime** | Behaviour proven by live read-only requests |
| `C:\Users\Wills\Desktop\HiddenTunes` (`feature/radio-worldwide-40k`) | **Active development / likely deploy source** | Contains `Fix complete paginated TV catalog search` (`f928b0a`); `/api/tv/videos` contract matches production (`limit+1` hasMore, multi-field `q`) |
| SSD `HiddenTunes-Desktop` admin copy | **Active development source (desktop branch)** | Same videos route content (FC: no diff vs laptop route); different monorepo HEAD/branch |
| `HiddenTunes-TV-40K-EXPANSION` | **Import / expansion workspace** | Not the mobile client; useful for catalogue growth history only |
| Other Desktop `HiddenTunes-*` trees | **Archive / snapshot / pilot** | Do not deploy from these |

## Authority verdict

1. **Runtime authority** for TV search behaviour is the live API at `admin.hiddentunes.com` + Supabase project `kojcyswxfuikxmqntwye`.
2. **Mobile source authority** for this repair is `HiddenTunes-CLEAN-1.0.142` on `fix/library-content-type-safe`.
3. **Backend source authority** for local comparison is the laptop admin tree under `C:\Users\Wills\Desktop\HiddenTunes`, with the SSD admin tree as a parallel copy.
4. **Deploy ownership of the VPS build was not re-proven in this session** (no SSH/deploy logs executed). Therefore **no backend deploy** and **no production data mutation** were performed.

## Stop conditions respected

Backend code was **not** modified. Mobile-only safe repairs that do not require deployment were applied after production behaviour was proven.
