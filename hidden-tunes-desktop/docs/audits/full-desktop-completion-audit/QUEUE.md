# Queue Audit

## Owners

- Live: `DesktopPlaybackProvider`
- Types/ops: `src/lib/queue/*`
- Intelligence: `queueIntelligence.ts` + `smartContinuation.ts` (WIP)
- Panel: `PlayerQueuePanel` (`PlayerShellPanels.tsx`)

## Shape

- Live session: `ApiSong[]`
- Persistable: `DesktopQueueItem` (excludes TV/Sports)
- Max items bounded (500)

## Behaviour

- Shuffle/repeat owned by provider; suppressed for audiobook/motivational/lecture/tv/sports/radio contexts on playQueue
- Cross-family single session queue with capability gating
- Persistence strips non-persistable families

## Gaps

- `QueueUpNextPanel` stub returns null
- Dual live vs persist representations need careful bridging
- Uncommitted smart continuation changes alter auto-next behaviour vs committed HEAD
- Mixing live video + audio items in one queue increases UX complexity

## Verdict

Queue foundation is mostly complete and contract-tested (PASS). Smart-continuation WIP must be finished or reverted before release.
