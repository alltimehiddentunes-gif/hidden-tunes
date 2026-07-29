# Home Albums Worth Staying With — playback fix

Workspace: HiddenTunes-desktop-integration
Branch: desktop/integrate-home-music-split
No commit/push/deploy.

## Fix
Primary album card click now plays in place (home context + album queue seed). Details is secondary. Generic Singles/Album titles render artist-forward.

## Validation
Parity/album/auto-next/mutex tests PASS. Electron runtime blocked by empty catalog + disk-full host.

## Verdict
B. PARTIAL — DATA OR QUEUE BLOCKERS REMAIN
