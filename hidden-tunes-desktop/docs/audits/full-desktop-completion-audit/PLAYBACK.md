# Playback Audit

## Owners

- Provider: `src/context/DesktopPlaybackProvider.tsx`
- Audio: `src/lib/desktopPlayback/HtmlAudioPlaybackService.ts`
- Capabilities: `src/lib/queue/capabilities.ts`
- Smart continuation (WIP untracked): `src/lib/desktopPlayback/smartContinuation.ts`
- Display metadata: `src/lib/playerDisplayMetadata.ts`

## Complete / strong

- Single audio element ownership via provider
- Video/audio mutex (`stopInactiveMedia`) — static verify PASS
- Route-independent media ownership tests PASS (script)
- Family-aware capabilities (radio/TV/sports live: no fake seek duration)
- Queue play/next/previous/shuffle/repeat with family guards
- Progress context split from stable track identity

## Partial / risks

- Uncommitted smart-continuation changes present in dirty tree
- Mute implemented as volume=0 in UI layers (not first-class muted flag)
- Transport controls duplicated across PlayerBar / PersistentPlayer / fullscreen shells
- Rapid family switching race windows possible (static tests only)
- Dev audio harness exists; exclusion verify PASS but must stay out of public catalog

## Family notes

| Family | Seek | Auto-next | Notes |
|--------|------|-----------|-------|
| Music | Yes | Yes (+ smart continuation WIP) | Primary finite path |
| Radio | No | Station switch | duration null; live |
| Podcasts | Yes (episode) | Episode queue | Resolve-on-play |
| Audiobooks | Yes | Chapter aware | Shuffle suppressed |
| Motivationals / Lectures | Depends | Capability gated | Video may use shared video element |
| TV | Live-oriented | Channel switch | Video surface |
| Sports | Limited | Prev/next often disabled | Play only if playable |

## Verdict

Playback architecture is the strongest completed system, but **release is blocked by dirty/untracked playback modules** and incomplete Sports video surface behaviour.
