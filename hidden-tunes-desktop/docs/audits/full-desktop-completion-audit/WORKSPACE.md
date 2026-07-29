# Workspace Proof (Desktop SSD Audit — refreshed 2026-07-29)

## Scope separation

| Product | Status for this audit |
|---------|----------------------|
| **Desktop** | Unfinished — full completion audit target |
| **Mobile** | Working well overall; known exceptions Sports + CarPlay blank — **excluded from desktop scores** |

## Locked workspace

| Field | Value |
|-------|-------|
| SSD | D: · llordwills · SanDisk Extreme Pro 55AF · NTFS |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Desktop app | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `1114cf2d79f51f6fc6f8f527db8adc35a54da18f` |
| Dirty | Yes (~78 porcelain entries; production WIP) |
| Electron | `...\node_modules\electron\dist\electron.exe` v42.2.0 |
| `node_modules` | Real directory (not junction) |
| Vite | `http://localhost:5173/` |
| Runtime ownership | Confirmed 2026-07-29 — Electron cmdline from SSD path |

## Candidates compared

| Candidate | Verdict |
|-----------|---------|
| `D:\...\HiddenTunes-Desktop` | **ACTIVE** — correct branch, ahead HEAD, real nm |
| `D:\...\HiddenTunes-CLEAN-1.0.142` | Mobile; desktop nm missing |
| `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration` | Rejected — OS drive, older HEAD `99b3e24` |

See also `SSD.md`.
