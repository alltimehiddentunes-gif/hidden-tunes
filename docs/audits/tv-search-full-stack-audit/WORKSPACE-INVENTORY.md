# Workspace Inventory — TV Search Full-Stack Audit

Date: 2026-07-30  
Protected mobile workspace: `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142`

## SSD volume

| Field | Value |
| --- | --- |
| Drive | D: |
| Label | llordwills |
| Filesystem | NTFS |
| Size | ~1.86 TB |
| Free | ~1.86 TB |

## Repository inventory

| ID | Path | Drive | Purpose | Git root | Branch | HEAD | Dirty | Likely authority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142` | C: | Protected mobile app | same | `fix/library-content-type-safe` | `8585f82` | yes | **Authoritative mobile source for this audit** |
| D1 | `D:\HiddenTunes\Active\HiddenTunes-Desktop` | D: | SSD desktop monorepo (+ embedded backend) | same | `desktop/integrate-home-music-split` | `3b4a91f` | yes | Desktop + backend *copy*; not proven as live deploy source |
| D1a | `...\hidden-tunes-desktop` | D: | Desktop app | D1 | same | same | yes | Desktop UI only |
| D1b | `...\hidden-tunes-backend\hidden-tunes-admin` | D: | Admin/API source copy | D1 | same | same | yes | Backend source copy |
| L1 | `C:\Users\Wills\Desktop\HiddenTunes` | C: | Historical laptop monorepo | same | `feature/radio-worldwide-40k` | `70f8f95` | yes | **Most likely active backend workspace** (matches production contract) |
| L1a | `...\hidden-tunes-backend\hidden-tunes-admin` | C: | Laptop admin/API | L1 | same | same | yes | Backend source; deploy not verified this session |
| T1 | `C:\Users\Wills\Desktop\HiddenTunes-TV-40K-EXPANSION` | C: | TV expansion workspace | same | `feature/tv-worldwide-40k-expansion` | `19b0209` | ? | Import/expansion — not production UI |
| P1 | `C:\Users\Wills\Desktop\HiddenTunes-CLEAN-1.0.142-PROTECTED` | C: | Protected snapshot | same | `protected-clean-1.0.142-final` | `4838f6d` | ? | Archive/snapshot |
| X1 | Many other `Desktop\HiddenTunes-*` dirs | C: | Backups / pilots / sports / recovery | varies | varies | varies | — | Archive / unsafe to treat as production |

## Mobile runtime facts

| Item | Value |
| --- | --- |
| package.json name | `hidden-tunes-app` |
| package.json version | `1.0.0` |
| app.json version | `1.0.1` |
| iOS buildNumber (app.json) | `1.0.0` (workspace local; production builds previously recorded 1.0.187) |
| Android versionCode (app.json) | `3` (workspace local; production previously recorded 98) |
| Expo | `~56.0.8` |
| React Native | `0.85.3` |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| Package manager | npm |
| HEAD vs prior baseline `c6a61b8` | **Different** (`8585f82`) — branch match preserved; no branch switch |

## Environment files (names only)

Present: `.env`, `.env.example`, `.env.local`

Relevant variable **names** observed in code (values not printed):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (auth client)
- `EXPO_PUBLIC_BUILD_PROFILE`
- `EXPO_PUBLIC_SPORTS_*` (sports pilot flags)
- `EXPO_PUBLIC_ENABLE_MATURE_TV_TEST`
- TV catalogue base URL is **hardcoded** in `services/tvCatalogApi.ts` as `https://admin.hiddentunes.com` (not env-driven)

## Remotes (no credentials)

Mobile + laptop + SSD remotes resolve to:
`https://github.com/alltimehiddentunes-gif/hidden-tunes.git`
