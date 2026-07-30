# Workspace Proof — Songs API Recovery

## Authoritative repository

| Field | Value |
| --- | --- |
| Absolute path | `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend` |
| Git root | `C:\Users\Wills\Desktop\HiddenTunes` (monorepo) |
| Branch | `feature/radio-worldwide-40k` |
| HEAD (audit start) | `868db2ccd03fbed946c7cc7692572059912fbb82` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Package name | `hidden-tunes-backend` |
| Start command | `npm start` → `node server.js` |
| Render service name | `hidden-tunes-api` (from `render.yaml`) |
| Public search route | `GET /api/songs?q=` |
| Production URL | `https://hidden-tunes-api.onrender.com` |

## Evidence this is the public music API

- `render.yaml` declares service `hidden-tunes-api` with `npm start`
- `server.js` mounts `app.use("/api/songs", songsRouter)`
- Mobile `services/hiddenTunesApi.ts` targets `https://hidden-tunes-api.onrender.com`
- Local reproduction of the same `/api/songs?q=` path returns Afrobeats/artist hits

## Explicit non-authority

- `hidden-tunes-admin` (Next.js on admin.hiddentunes.com) is **not** the public songs search API
- Mobile Search must remain pointed at Render until an intentional migration is designed

## Dirty state note

Monorepo working tree contains unrelated radio/TV/admin WIP. Songs API recovery changes are limited to:

- `hidden-tunes-backend/server.js`
- `hidden-tunes-backend/routes/songs.js`
- `hidden-tunes-backend/docs/audits/songs-api-recovery/*`
