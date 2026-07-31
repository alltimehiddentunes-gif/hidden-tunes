# Backend Comparison

## Laptop vs SSD admin `videos` route

- Paths compared:
  - `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin\app\api\tv\videos\route.ts`
  - `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-backend\hidden-tunes-admin\app\api\tv\videos\route.ts`
- `fc.exe`: **no differences encountered**
- Both implement multi-field `q` OR + `limit+1` hasMore pagination

## `tvSearch.ts` (`/api/tv/search`)

- Laptop hash prefix `6D84BC42…`
- SSD hash prefix `9F70F2ED…` (file content differs elsewhere, but search OR remains `title` + `channel_name` only on both)
- Production `/api/tv/search` behaviour matches the narrow field set

## Historical commit

`f928b0a Fix complete paginated TV catalog search` (2026-07-19) on laptop branch — ancestor of current laptop HEAD — introduced the complete paginated `q` coverage on `/api/tv/videos`.

## Desktop mobile contract difference

| Client | Endpoint |
| --- | --- |
| Mobile TV destination | `/api/tv/videos?q=` (broader) |
| Desktop TV destination | `/api/tv/search?q=` (narrower) |

Desktop was **not** modified in this mobile audit.

## Other copies

| Path | Role |
| --- | --- |
| `HiddenTunes-TV-40K-EXPANSION` | Expansion/import lineage |
| Multiple `HiddenTunes-*` backups | Archives — not used for edits |
