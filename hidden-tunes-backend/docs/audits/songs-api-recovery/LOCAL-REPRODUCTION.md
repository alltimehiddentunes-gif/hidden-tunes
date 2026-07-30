# Local Reproduction

## Setup

```text
cwd: C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend
command: PORT=4010 node server.js
```

Uses local `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (not printed).

## Startup

| Metric | Result |
| --- | --- |
| Startup | Success |
| `/health` | 200 `{"success":true,"status":"ok"}` |
| `/ready` | 200 `{"success":true,"status":"ready",...}` |
| Working set | ~80 MB |

## Search matrix

| Query | Status | Count | Sample |
| --- | --- | --- | --- |
| Afrobeats | 200 | 20 | July 7 Slow Motion… / Moelogo Soft Life… / Mr Eazi Personal Baby… |
| Afrobeat | 200 | 20 | Same ranking family as Afrobeats |
| Burna Boy | 200 | 20 | Burna Boy Money Play… / It's Plenty… / Gbona… |
| Shatta Wale | 200 | 9 | See Something… / More Loving… |
| Black Sherif | 200 | 7 | Black Sherif Popstar… |
| (no q) | 200 | 5 | catalogue page |
| `zzzxnonexistent999` | 200 | 0 | genuine empty |

## Conclusion

Application + Supabase path are healthy locally. Production failure is **not** reproducible as an app bug — it is Render **suspend**.
