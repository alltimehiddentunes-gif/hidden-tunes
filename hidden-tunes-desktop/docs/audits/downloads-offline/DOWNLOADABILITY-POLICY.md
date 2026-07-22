# Downloadability Policy

| Class | Meaning |
| ----- | ------- |
| `downloadable` | Finite offline file may be persisted after resolve + validation |
| `stream_only` | Live / continuous / container — never download |
| `unsupported` | No product contract |
| `unknown` | Deferred |

## Family policy

| Family | Class | Notes |
| ------ | ----- | ----- |
| `song` | downloadable | Only with stable HTTPS candidate URL on approved hosts |
| `podcast_episode` | downloadable | Resolve `/api/podcasts/episodes/{id}/play` |
| `audiobook_chapter` | downloadable | Resolve chapter play; no whole-book bulk |
| `motivational` | downloadable | Reject embed/stream media types |
| `lecture` | downloadable | Reject embed/stream media types |
| `radio` | stream_only | No capture / no Download UI |
| `tv` | stream_only | No HLS/live recording |
| `podcast_show` | stream_only | Episodes only |
| `sports` | unsupported | Until explicit finite contract |
| `audiobook` (book) | stream_only | Chapters only |
| VOD HLS | unsupported | Deferred — no first-party HLS downloader |

## Protocols

- Production: **HTTPS** only, approved host suffixes
- Test harness only: `HT_DOWNLOADS_TEST_ALLOW_HTTP=1` permits `http://127.0.0.1` / `localhost`
