import { emitSportsDiagnostic } from './diagnostics'
import { hydrateSportsPlaybackSession } from './sportsCatalogApi'
import type {
  ResolvedSportsPlayableStream,
  SportsPlaySession,
  SportsUnavailableReason,
} from './types'

export type ResolvePlayableStreamResult =
  | { ok: true; stream: ResolvedSportsPlayableStream }
  | { ok: false; kind: 'unavailable' | 'unsupported' | 'external' | 'subscription_required' | 'cancelled'; userMessage: string }

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

function unavailableMessage(reason: SportsUnavailableReason, fallback?: string | null): string {
  switch (reason) {
    case 'finished':
      return 'This event has finished.'
    case 'not_started':
      return 'This event is not currently available to play.'
    case 'expired':
      return 'The stream is no longer active.'
    case 'geo_blocked':
      return 'This event is not currently available to play.'
    case 'provider_disabled':
      return 'This event is not currently available to play.'
    case 'no_broadcast':
      return 'This event is not currently available to play.'
    case 'validation_failed':
    default:
      return fallback?.trim() || 'This event is not currently available to play.'
  }
}

function classifyHttpsMediaUrl(url: string): 'hls' | 'dash' | 'direct' | null {
  const trimmed = url.trim()
  if (!trimmed.toLowerCase().startsWith('https://')) return null
  const lower = trimmed.toLowerCase()
  // Reject obvious embed / player page patterns without media extension.
  if (
    /youtube\.com\/embed|player\.|\/embed\/|iframe|webview/i.test(lower)
    && !/\.m3u8(\?|$)/i.test(lower)
    && !/\.mpd(\?|$)/i.test(lower)
  ) {
    return null
  }
  if (/\.m3u8(\?|$)/i.test(lower) || /[?&]format=m3u8\b/i.test(lower)) return 'hls'
  if (/\.mpd(\?|$)/i.test(lower)) return 'dash'
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return 'direct'
  // Allow trusted https media endpoints that omit extensions (CDN manifests).
  if (/\/(manifest|playlist|master|index)(\.|\/|\?|$)/i.test(lower)) return 'hls'
  return 'direct'
}

function pickCandidateUrls(session: Extract<SportsPlaySession, { status: 'ready' }>, hydrated: Awaited<ReturnType<typeof hydrateSportsPlaybackSession>>) {
  const candidates: string[] = []
  const push = (value: string | null | undefined) => {
    const trimmed = String(value || '').trim()
    if (trimmed) candidates.push(trimmed)
  }
  push(session.manifestUrl)
  push(session.streamUrl)
  push(session.mediaUrl)
  push(hydrated?.manifestUrl)
  push(hydrated?.streamUrl)
  push(hydrated?.mediaUrl)

  const kind = String(hydrated?.playbackKind || session.playbackKind || '').toLowerCase()
  // Only consider embedUrl when it is actually an https media URL (HLS/DASH/direct).
  if (kind === 'hls' || kind === 'dash' || kind === 'direct') {
    push(session.embedUrl)
    push(hydrated?.embedUrl)
  } else {
    const embed = String(session.embedUrl || hydrated?.embedUrl || '').trim()
    if (embed && classifyHttpsMediaUrl(embed)) {
      push(embed)
    }
  }
  return candidates
}

/**
 * Turn a play session into a video-element-safe https stream.
 * Rejects embed/iframe/webview-only sources and non-https protocols.
 * Never returns full sensitive URLs in diagnostic payloads (hostname only).
 */
export async function resolvePlayableStream(
  session: SportsPlaySession,
  signal?: AbortSignal,
): Promise<ResolvePlayableStreamResult> {
  if (signal?.aborted) {
    return { ok: false, kind: 'cancelled', userMessage: 'Playback request was cancelled.' }
  }

  if (session.status === 'unavailable') {
    return {
      ok: false,
      kind: 'unavailable',
      userMessage: unavailableMessage(session.reason, session.message),
    }
  }

  if (session.status === 'external') {
    return {
      ok: false,
      kind: 'external',
      userMessage: 'This event opens with an external provider and is not playable in the app.',
    }
  }

  if (session.status === 'subscription_required') {
    return {
      ok: false,
      kind: 'subscription_required',
      userMessage: 'A subscription is required to watch this event.',
    }
  }

  // ready
  let hydrated: Awaited<ReturnType<typeof hydrateSportsPlaybackSession>> = null
  const needsHydrate =
    !session.manifestUrl
    && !session.streamUrl
    && !session.mediaUrl
    && Boolean(session.playbackToken)

  if (needsHydrate) {
    hydrated = await hydrateSportsPlaybackSession(session.playbackToken, signal)
    if (signal?.aborted) {
      return { ok: false, kind: 'cancelled', userMessage: 'Playback request was cancelled.' }
    }
  }

  const kind = String(hydrated?.playbackKind || session.playbackKind || '').toLowerCase()
  if (kind === 'embed' || kind === 'iframe' || kind === 'webview') {
    const candidates = pickCandidateUrls(session, hydrated)
    const media = candidates.map(classifyHttpsMediaUrl).find((entry) => entry)
    if (!media) {
      emitSportsDiagnostic('sports_play_resolution_failed', {
        fixtureId: session.fixtureId,
        reason: 'unsupported_embed',
        playbackKind: kind,
      })
      return {
        ok: false,
        kind: 'unsupported',
        userMessage: 'This stream format is not supported.',
      }
    }
  }

  for (const candidate of pickCandidateUrls(session, hydrated)) {
    if (/^(http:|blob:|file:|about:|data:)/i.test(candidate) && !/^https:/i.test(candidate)) {
      emitSportsDiagnostic('sports_play_resolution_failed', {
        fixtureId: session.fixtureId,
        reason: 'non_https',
        host: hostnameOf(candidate),
      })
      return {
        ok: false,
        kind: 'unsupported',
        userMessage: 'This stream format is not supported.',
      }
    }

    const protocol = classifyHttpsMediaUrl(candidate)
    if (!protocol) continue

    const host = hostnameOf(candidate)
    emitSportsDiagnostic('sports_play_resolution_succeeded', {
      fixtureId: session.fixtureId,
      protocol,
      host,
    })

    return {
      ok: true,
      stream: {
        streamUrl: candidate,
        protocol,
        title: hydrated?.title || session.title || 'Match',
        providerLabel: hydrated?.providerLabel || session.providerLabel || null,
        expiresAt: hydrated?.expiresAt || session.expiresAt || null,
        hostname: host,
      },
    }
  }

  emitSportsDiagnostic('sports_play_resolution_failed', {
    fixtureId: session.fixtureId,
    reason: 'no_https_media',
    playbackKind: kind || null,
  })

  return {
    ok: false,
    kind: 'unsupported',
    userMessage: 'This stream format is not supported.',
  }
}
