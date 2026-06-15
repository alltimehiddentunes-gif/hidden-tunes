#!/usr/bin/env python3
"""Phase 44O — shuffle/repeat + footer transport wiring in DesktopPlaybackProvider."""
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
if 'export type RepeatMode' not in types:
    types = types.replace(
        'export type QueueSeedMetadata = {',
        "export type RepeatMode = 'off' | 'all' | 'one'\n\nexport type QueueSeedMetadata = {",
    )
    types = types.replace(
        '  audioQualityMode: AudioQualityMode\n}',
        '  audioQualityMode: AudioQualityMode\n  shuffleEnabled: boolean\n  repeatMode: RepeatMode\n}',
        1,
    )
    types = types.replace(
        '  clearUpcomingQueue: () => void\n  pause: () => void',
        '  clearUpcomingQueue: () => void\n  toggleShuffle: () => void\n  toggleRepeat: () => void\n  pause: () => void',
    )
    write(TYPES, types)

provider = read(PROVIDER)

if 'function shuffleSongs' not in provider:
    provider = provider.replace(
        'function contextToSeedType(context: QueueContext): QueueSeedType {',
        """function shuffleSongs(queue: ApiSong[]) {
  const array = [...queue]
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = array[i]
    array[i] = array[j]
    array[j] = swap
  }
  return array
}

function shuffleQueueFromIndex(queue: ApiSong[], startIndex: number) {
  if (queue.length <= 1 || startIndex < 0 || startIndex >= queue.length) return queue
  const current = queue[startIndex]
  const others = queue.filter((_, index) => index !== startIndex)
  return [current, ...shuffleSongs(others)]
}

function contextToSeedType(context: QueueContext): QueueSeedType {""",
    )

if 'unshuffledQueueRef' not in provider:
    provider = provider.replace(
        '  const upgradeSessionIdRef = useRef(0)',
        """  const upgradeSessionIdRef = useRef(0)
  const unshuffledQueueRef = useRef<ApiSong[]>([])
  const shuffleEnabledRef = useRef(false)
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('off')""",
    )

if 'const [shuffleEnabled' not in provider:
    provider = provider.replace(
        '  const [audioQualityMode, setAudioQualityMode] = usePersistedPreference(',
        """  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [audioQualityMode, setAudioQualityMode] = usePersistedPreference(""",
    )

if 'shuffleEnabledRef.current = shuffleEnabled' not in provider:
    provider = provider.replace(
        '  useEffect(() => {\n    audioQualityModeRef.current = audioQualityMode\n  }, [audioQualityMode])',
        """  useEffect(() => {
    shuffleEnabledRef.current = shuffleEnabled
  }, [shuffleEnabled])

  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  useEffect(() => {
    audioQualityModeRef.current = audioQualityMode
  }, [audioQualityMode])""",
    )

on_ended_old = """    const onEnded = () => {
      cancelUpgradeSession('upgrade-cancelled-track-changed', 'track-ended')
      const queue = queueRef.current
      const nextIndex = queueIndexRef.current + 1

      if (nextIndex < queue.length) {"""

on_ended_new = """    const onEnded = () => {
      cancelUpgradeSession('upgrade-cancelled-track-changed', 'track-ended')
      const queue = queueRef.current
      const currentIndexValue = queueIndexRef.current

      if (repeatModeRef.current === 'one' && currentIndexValue >= 0 && queue[currentIndexValue]) {
        playSongRef.current(queue[currentIndexValue])
        return
      }

      const nextIndex = currentIndexValue + 1

      if (nextIndex < queue.length) {"""

if on_ended_old not in provider:
    raise SystemExit('onEnded block not found')
provider = provider.replace(on_ended_old, on_ended_new)

on_ended_tail_old = """      setIsPlaying(false)
      setPositionSeconds(0)
    }
    const onError = () => {"""

on_ended_tail_new = """      if (repeatModeRef.current === 'all' && queue.length > 0) {
        queueIndexRef.current = 0
        setCurrentIndex(0)
        playSongRef.current(queue[0])
        return
      }

      setIsPlaying(false)
      setPositionSeconds(0)
    }
    const onError = () => {"""

if on_ended_tail_old not in provider:
    raise SystemExit('onEnded tail block not found')
provider = provider.replace(on_ended_tail_old, on_ended_tail_new)

play_queue_old = """      const playableQueue = queue.filter(Boolean)
      if (playableQueue.length === 0) return

      const safeIndex = Math.min(
        playableQueue.length - 1,
        Math.max(0, Number.isFinite(startIndex) ? startIndex : 0),
      )

      const nextSeedType = seedMetadata?.seedType ?? contextToSeedType(context)"""

play_queue_new = """      const playableQueue = queue.filter(Boolean)
      if (playableQueue.length === 0) return

      const safeIndex = Math.min(
        playableQueue.length - 1,
        Math.max(0, Number.isFinite(startIndex) ? startIndex : 0),
      )

      unshuffledQueueRef.current = playableQueue
      let resolvedQueue = playableQueue
      let resolvedIndex = safeIndex
      if (shuffleEnabledRef.current && playableQueue.length > 1) {
        resolvedQueue = shuffleQueueFromIndex(playableQueue, safeIndex)
        resolvedIndex = 0
      }

      const nextSeedType = seedMetadata?.seedType ?? contextToSeedType(context)"""

if play_queue_old not in provider:
    raise SystemExit('playQueue block not found')
provider = provider.replace(play_queue_old, play_queue_new)

provider = provider.replace(
    '      applyQueueState(playableQueue, safeIndex)\n'
    '      currentTrackRef.current = playableQueue[safeIndex]\n'
    '      setCurrentTrack(playableQueue[safeIndex])',
    '      applyQueueState(resolvedQueue, resolvedIndex)\n'
    '      currentTrackRef.current = resolvedQueue[resolvedIndex]\n'
    '      setCurrentTrack(resolvedQueue[resolvedIndex])',
)

provider = provider.replace(
    '      queueSeedTracksRef.current = seedMetadata?.seedTracks ?? playableQueue',
    '      queueSeedTracksRef.current = seedMetadata?.seedTracks ?? resolvedQueue',
)

provider = provider.replace(
    '      extendQueueIfNeeded(playableQueue, safeIndex)\n'
    '      playSong(playableQueue[safeIndex])',
    '      extendQueueIfNeeded(resolvedQueue, resolvedIndex)\n'
    '      playSong(resolvedQueue[resolvedIndex])',
)

next_old = """  const next = useCallback(() => {
    const queue = queueRef.current
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex >= queue.length) return

    applyQueueState(queue, nextIndex)
    const extendedQueue = extendQueueIfNeeded(queue, nextIndex)
    playSong(extendedQueue[nextIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])"""

next_new = """  const next = useCallback(() => {
    const queue = queueRef.current
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex >= queue.length) {
      if (repeatModeRef.current === 'all' && queue.length > 0) {
        applyQueueState(queue, 0)
        playSong(queue[0])
      }
      return
    }

    applyQueueState(queue, nextIndex)
    const extendedQueue = extendQueueIfNeeded(queue, nextIndex)
    playSong(extendedQueue[nextIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])"""

if next_old not in provider:
    raise SystemExit('next block not found')
provider = provider.replace(next_old, next_new)

prev_old = """  const previous = useCallback(() => {
    const queue = queueRef.current
    const previousIndex = queueIndexRef.current - 1
    if (previousIndex < 0 || previousIndex >= queue.length) return

    applyQueueState(queue, previousIndex)
    extendQueueIfNeeded(queue, previousIndex)
    playSong(queue[previousIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])"""

prev_new = """  const previous = useCallback(() => {
    const queue = queueRef.current
    const previousIndex = queueIndexRef.current - 1
    if (previousIndex < 0) {
      if (repeatModeRef.current === 'all' && queue.length > 1) {
        const lastIndex = queue.length - 1
        applyQueueState(queue, lastIndex)
        extendQueueIfNeeded(queue, lastIndex)
        playSong(queue[lastIndex])
      }
      return
    }
    if (previousIndex >= queue.length) return

    applyQueueState(queue, previousIndex)
    extendQueueIfNeeded(queue, previousIndex)
    playSong(queue[previousIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])"""

if prev_old not in provider:
    raise SystemExit('previous block not found')
provider = provider.replace(prev_old, prev_new)

toggle_block = """  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((enabled) => {
      const next = !enabled
      const queue = queueRef.current
      const index = queueIndexRef.current
      if (next && queue.length > 1 && index >= 0) {
        const upcoming = queue.slice(index + 1)
        if (upcoming.length > 1) {
          const reshuffled = [...queue.slice(0, index + 1), ...shuffleSongs(upcoming)]
          queueRef.current = reshuffled
          setCurrentQueue(reshuffled)
        }
      } else if (!next && unshuffledQueueRef.current.length > 0) {
        const currentId = queue[index]?.id
        const restored = unshuffledQueueRef.current
        const restoredIndex = currentId
          ? restored.findIndex((song) => song.id === currentId)
          : index
        if (restoredIndex >= 0) {
          queueRef.current = restored
          queueIndexRef.current = restoredIndex
          setCurrentQueue(restored)
          setCurrentIndex(restoredIndex)
        }
      }
      return next
    })
  }, [])

  const toggleRepeat = useCallback(() => {
    setRepeatMode((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))
  }, [])

  const pause = useCallback(() => {"""

if 'const toggleShuffle = useCallback' not in provider:
    provider = provider.replace('  const pause = useCallback(() => {', toggle_block)

provider = provider.replace(
    """      audioQualityMode,
      playTrack,""",
    """      audioQualityMode,
      shuffleEnabled,
      repeatMode,
      playTrack,""",
)

provider = provider.replace(
    """      clearUpcomingQueue,
      pause,""",
    """      clearUpcomingQueue,
      toggleShuffle,
      toggleRepeat,
      pause,""",
)

provider = provider.replace(
    """      audioQualityMode,
      playTrack,
      playQueue,""",
    """      audioQualityMode,
      shuffleEnabled,
      repeatMode,
      playTrack,
      playQueue,""",
)

provider = provider.replace(
    """      clearUpcomingQueue,
      pause,
      resume,""",
    """      clearUpcomingQueue,
      toggleShuffle,
      toggleRepeat,
      pause,
      resume,""",
)

write(PROVIDER, provider)
print('Phase 44O provider patch applied')
