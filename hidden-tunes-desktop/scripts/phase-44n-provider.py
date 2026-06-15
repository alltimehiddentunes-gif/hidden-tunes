#!/usr/bin/env python3
"""Phase 44N — playback provider queue clear + jump wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TYPES = ROOT / 'src/lib/desktopPlayback/types.ts'
PROVIDER = ROOT / 'src/context/DesktopPlaybackProvider.tsx'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n').replace('\r', '\n')


def write(path: Path, text: str) -> None:
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    path.write_bytes(text.replace('\n', newline).encode('utf-8'))


types = read(TYPES)
old_actions = """  getUpcomingTracks: () => ApiSong[]
  pause: () => void"""

new_actions = """  getUpcomingTracks: () => ApiSong[]
  playQueueAtIndex: (index: number) => void
  clearUpcomingQueue: () => void
  pause: () => void"""

if old_actions not in types:
    raise SystemExit('DesktopPlaybackActions block not found in types.ts')
types = types.replace(old_actions, new_actions)
write(TYPES, types)

provider = read(PROVIDER)
insert_after = """  const getUpcomingTracks = useCallback(() => {
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex <= 0) return []
    return queueRef.current.slice(nextIndex)
  }, [])

  const pause = useCallback(() => {"""

insert_new = """  const getUpcomingTracks = useCallback(() => {
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex <= 0) return []
    return queueRef.current.slice(nextIndex)
  }, [])

  const playQueueAtIndex = useCallback(
    (index: number) => {
      const queue = queueRef.current
      if (index < 0 || index >= queue.length) return
      applyQueueState(queue, index)
      extendQueueIfNeeded(queue, index)
      playSong(queue[index])
    },
    [applyQueueState, extendQueueIfNeeded, playSong],
  )

  const clearUpcomingQueue = useCallback(() => {
    const queue = queueRef.current
    const index = queueIndexRef.current
    if (index < 0 || index >= queue.length - 1) return

    const trimmed = queue.slice(0, index + 1)
    queueRef.current = trimmed
    queueSeedTracksRef.current = trimmed
    queueSeedTypeRef.current = 'manual'
    setCurrentQueue(trimmed)
    setQueueContext('manual')
    setQueueSeedType('manual')
  }, [])

  const pause = useCallback(() => {"""

if insert_after not in provider:
    raise SystemExit('getUpcomingTracks block not found in DesktopPlaybackProvider.tsx')
provider = provider.replace(insert_after, insert_new)

provider = provider.replace(
    """      getUpcomingTracks,
      pause,""",
    """      getUpcomingTracks,
      playQueueAtIndex,
      clearUpcomingQueue,
      pause,""",
    2,
)

write(PROVIDER, provider)
print('Phase 44N provider patch applied')
