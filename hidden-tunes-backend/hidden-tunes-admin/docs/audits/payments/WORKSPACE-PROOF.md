# Hidden Tunes Payments — Workspace Proof (Phase A)

**Date:** 2026-07-30  
**Phase:** A — Audit and architecture only  
**AfriMeetup touched:** No

---

## Desktop

| Field | Value |
| --- | --- |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Remote | `https://github.com/alltimehiddentunes-gif/hidden-tunes.git` |
| Package | `hidden-tunes-desktop` (Electron + Vite + React 19) |
| Dirty | Yes — launch-readiness work preserved; **not** part of this Phase A commit |
| Nested backend | Present under `hidden-tunes-backend/` but shares desktop Git root |

## Mobile (protected)

| Field | Value |
| --- | --- |
| Path | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` |
| Git root | `C:/Users/Wills/Desktop/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `8585f821fbd51ef9b876cad6144a5fc9e268660b` |
| Trusted baseline | `c6a61b8be9ac58049ff7daa61e06f6581c51d171` (`c6a61b8`) |
| Note | Current HEAD is **newer** than trusted release baseline |
| Remote | same `hidden-tunes.git` |
| Stack | Expo SDK ~56, `expo-dev-client`, custom native audio plugins |
| Dirty | Yes — unrelated sports/TV audit artefacts; not committed in Phase A |

## Backend (authoritative)

| Field | Value |
| --- | --- |
| Admin path | `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin` |
| Git root | `C:/Users/Wills/Desktop/HiddenTunes` |
| Branch | `feature/radio-worldwide-40k` |
| HEAD (Phase A start) | `5c02a8f22dee30805c71ff8d9da792b3149d5fe7` |
| Remote | same `hidden-tunes.git` |
| Stack | Next.js 16 App Router, Supabase Auth + Postgres |
| Production API | `https://admin.hiddentunes.com` |
| Supabase project | `kojcyswxfuikxmqntwye` |
| Dirty | Yes — unrelated catalogue/API dirty files; Phase A commits **docs only** |

## Web checkout app

No dedicated `hidden-tunes-web` / `website` workspace found.  
Web checkout for Phase C/D will live as routes/pages on `hidden-tunes-admin` (or a future dedicated site) behind `admin.hiddentunes.com` / approved HTTPS origins.

## Package managers

| Repo | Manager |
| --- | --- |
| Desktop | npm |
| Mobile | npm (+ EAS) |
| Backend admin | npm |

All expected workspaces and branches match. No silent branch switches performed.