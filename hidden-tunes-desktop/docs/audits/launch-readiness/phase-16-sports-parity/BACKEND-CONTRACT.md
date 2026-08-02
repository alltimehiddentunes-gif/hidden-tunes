# Backend contract

`GET /api/sports/fixtures` accepts page, limit, cursor, sport, competition, country, date, status, live, upcoming and finished. Response: `{ success, enabled, items, nextCursor, pagination: { page, limit, hasMore } }`. Parser preserves identity, competition, participants, timing, status, scores, provider, watchability and metadata; it invents no statistics.
