import type { AudioQualityMode } from '../localPreferences'
import type { AudioVersionTier } from '../audioVersions'

const PREFIX = '[desktop-audio-upgrade]'

export type AudioUpgradeEvent =
  | 'target-selected'
  | 'upgrade-skipped'
  | 'upgrade-scheduled'
  | 'upgrade-blocked-data-saver'
  | 'upgrade-blocked-standard'
  | 'upgrade-deferred-unstable'
  | 'upgrade-cancelled-track-changed'
  | 'upgrade-cancelled-pause'
  | 'upgrade-cancelled-target-changed'
  | 'upgrade-cancelled-session-replaced'
  | 'upgrade-started'
  | 'upgrade-succeeded'
  | 'upgrade-timed-out'
  | 'upgrade-rolled-back'
  | 'upgrade-failed'
  | 'upgrade-cancelled-token'

export type AudioUpgradeLogFields = {
  trackId?: string
  trackTitle?: string
  qualityMode?: AudioQualityMode
  sourceTier?: AudioVersionTier | string
  targetTier?: AudioVersionTier | string
  sourceLabel?: string
  targetLabel?: string
  reason?: string
  positionSeconds?: number
  sessionId?: number
  upgradeToken?: number
  restored?: boolean
  ageMs?: number
  playedSeconds?: number
}

function shouldLog() {
  return import.meta.env.DEV
}

export function labelAudioUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined

  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length >= 2) {
      return segments.slice(-2).join('/')
    }
    if (segments.length === 1) return segments[0]
    return parsed.hostname
  } catch {
    const trimmed = url.trim()
    const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? trimmed
    const segments = withoutQuery.split('/').filter(Boolean)
    return segments.slice(-2).join('/') || 'audio-source'
  }
}

export function logAudioUpgrade(event: AudioUpgradeEvent, fields: AudioUpgradeLogFields = {}) {
  if (!shouldLog()) return
  console.info(PREFIX, event, fields)
}

export type AudioUpgradeDiagnosticsContext = AudioUpgradeLogFields

export function buildUpgradeDiagnosticsContext(input: {
  trackId?: string
  trackTitle?: string
  qualityMode?: AudioQualityMode
  sourceTier?: AudioVersionTier | string
  targetTier?: AudioVersionTier | string
  sourceUrl?: string | null
  targetUrl?: string | null
  positionSeconds?: number
  sessionId?: number
  upgradeToken?: number
  reason?: string
  restored?: boolean
  ageMs?: number
  playedSeconds?: number
}): AudioUpgradeDiagnosticsContext {
  return {
    trackId: input.trackId,
    trackTitle: input.trackTitle,
    qualityMode: input.qualityMode,
    sourceTier: input.sourceTier,
    targetTier: input.targetTier,
    sourceLabel: labelAudioUrl(input.sourceUrl),
    targetLabel: labelAudioUrl(input.targetUrl),
    positionSeconds: input.positionSeconds,
    sessionId: input.sessionId,
    upgradeToken: input.upgradeToken,
    reason: input.reason,
    restored: input.restored,
    ageMs: input.ageMs,
    playedSeconds: input.playedSeconds,
  }
}
