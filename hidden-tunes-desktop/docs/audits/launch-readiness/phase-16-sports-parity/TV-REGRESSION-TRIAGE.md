# TV regression triage

| Source | Clean 927c4d11 (twice) | Phase 16 | Classification |
|---|---|---|---|
| Vyas | PASS | PASS | healthy |
| 1-2-3.tv | FAIL unsupported | FAIL same | pre-existing source health |
| Ahsan TV | PASS | PASS | healthy |
| 100% Comedy | not sampled | PASS | healthy additional source |

`1-2-3.tv` ID `c61d8018-13db-4583-8b49-4cdb915975b0`, DE, selects `hls_stream` URL `https://123tv-mx1.flex-cdn.net/index.m3u8`. Master returns HTTP 200, `application/x-mpegURL`, CORS `*`, no redirect, but advertises insecure placeholder children under `customized-cdn.net/invalidurlstream…`. Failure occurs at media decode/attach. Catalogue last marked playable on 2026-07-25.

No Phase 16 path touches TV resolution or ownership. The gate now blocks on two controlled Mux HLS architecture fixtures and reports production streams as separate health probes. Both controlled fixtures and three current live sources pass; stale 1-2-3.tv remains visible and non-blocking.
