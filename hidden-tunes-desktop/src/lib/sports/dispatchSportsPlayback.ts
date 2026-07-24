import type { ApiSong } from '../api'
import type { QueueContext, QueueSeedMetadata } from '../desktopPlayback/types'
import { emitSportsDiagnostic } from './diagnostics'
import { resolvePlayableStream } from './resolvePlayableStream'
import { resolveSportsPlay } from './sportsCatalogApi'
import { sportsFixtureToApiSong } from './sportsPlaybackAdapter'
import type { DesktopSportsFixture, SportsPlaybackDispatchResult } from './types'

type PlayQueueFn = (
  queue: ApiSong[],
  startIndex: number,
  context: QueueContext,
  queueTitle?: string,
  seedMetadata?: QueueSeedMetadata,
) => void

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: string }).name || '')
  if (name === 'AbortError') return true
  const message = String((error as { message?: string }).message || '')
  return /aborted|AbortError|The operation was aborted/i.test(message)
}

/**
 * Resolve Sports play, then transfer ownership via playQueue.
 * Does NOT record history on resolve failure — history belongs to successful playback start.
 */
export async function dispatchSportsPlayback(options: {
  fixture: DesktopSportsFixture
  playQueue: PlayQueueFn
  signal?: AbortSignal
  queueTitle?: string
}): Promise<SportsPlaybackDispatchResult> {
  const fixtureId = options.fixture.id
  if (!fixtureId) {
    return {
      status: 'error',
      fixtureId: '',
      userMessage: 'This event is not currently available to play.',
    }
  }

  if (options.signal?.aborted) {
    return { status: 'cancelled', fixtureId }
  }

  try {
    const session = await resolveSportsPlay(fixtureId, options.signal)
    if (options.signal?.aborted) {
      return { status: 'cancelled', fixtureId }
    }

    const resolved = await resolvePlayableStream(session, options.signal)
    if (!resolved.ok) {
      if (resolved.kind === 'cancelled') {
        return { status: 'cancelled', fixtureId }
      }
      if (resolved.kind === 'unsupported') {
        emitSportsDiagnostic('sports_playability_conflict', {
          fixtureId,
          browsePlayable: options.fixture.isPlayable,
          reason: 'unsupported',
        })
        return { status: 'unsupported', fixtureId, userMessage: resolved.userMessage }
      }
      if (options.fixture.isPlayable) {
        emitSportsDiagnostic('sports_playability_conflict', {
          fixtureId,
          browsePlayable: true,
          reason: resolved.kind,
        })
      }
      return { status: 'unavailable', fixtureId, userMessage: resolved.userMessage }
    }

    const song = sportsFixtureToApiSong(options.fixture, resolved.stream.streamUrl)
    const title =
      options.queueTitle
      || options.fixture.title
      || (options.fixture.homeTeam && options.fixture.awayTeam
        ? `${options.fixture.homeTeam} vs ${options.fixture.awayTeam}`
        : 'Sports')

    // Sports uses the video owner — queue context 'sports' (caller wires video path).
    options.playQueue([song], 0, 'sports', title, {
      seedType: 'manual',
      seedId: fixtureId,
      seedTracks: [song],
    })

    emitSportsDiagnostic('sports_playback_started', {
      fixtureId,
      host: resolved.stream.hostname,
      protocol: resolved.stream.protocol,
    })

    return { status: 'success', fixtureId }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      return { status: 'cancelled', fixtureId }
    }
    return {
      status: 'error',
      fixtureId,
      userMessage: 'This event is not currently available to play.',
    }
  }
}
