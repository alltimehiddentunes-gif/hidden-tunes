const WEB_SOURCE_MARKERS = ['web', 'webpage', 'iframe', 'embed', 'youtube']

export type TvDesktopAvailability = {
  playable: boolean
  reason: string | null
}

export function resolveTvDesktopAvailability(input: {
  streamProtocol?: string | null
  sourceType?: string | null
  backendPlayable?: boolean
  backendReason?: string | null
}): TvDesktopAvailability {
  if (input.backendPlayable === false) {
    return {
      playable: false,
      reason: input.backendReason?.trim() || 'This source is not available on Desktop.',
    }
  }

  const protocol = input.streamProtocol?.trim().toLowerCase() || ''
  const sourceType = input.sourceType?.trim().toLowerCase() || ''
  const isWebSource = WEB_SOURCE_MARKERS.some((marker) => (
    protocol.includes(marker) || sourceType.includes(marker)
  ))
  if (isWebSource) {
    return {
      playable: false,
      reason: 'This channel uses a web player that is not approved for Hidden Tunes Desktop.',
    }
  }

  if (protocol && !['hls', 'dash', 'direct', 'https', 'http'].includes(protocol)) {
    return {
      playable: false,
      reason: `This channel uses the unsupported Desktop format “${protocol}”.`,
    }
  }

  return { playable: true, reason: null }
}
