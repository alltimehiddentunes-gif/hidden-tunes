# Backend contract

Production endpoint: `GET /api/tv/channels`, with `platform=desktop`, `page`, and `limit`. Canonical geographic filtering is `country=<ISO alpha-2>`. `q` is text search. Filters can be combined as `country=GH&q=sports`. Pagination supplies total and `hasMore`.
