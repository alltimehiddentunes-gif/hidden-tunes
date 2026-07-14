import type { AudioQualityMode } from './localPreferences'

export type AudioVersionSource = {
  url?: string
  codec?: string
  bitrateKbps?: number
  fileSizeBytes?: number
  durationSeconds?: number
  offlineEligible?: boolean
}

export type SongAudioVersions = {
  ultraLight?: AudioVersionSource
  standard?: AudioVersionSource
  highQuality?: AudioVersionSource
  lossless?: AudioVersionSource
}

export type AudioVersionTier =
  | 'ultraLight'
  | 'previewUrl'
  | 'standard'
  | 'legacyAudioUrl'
  | 'highQuality'
  | 'lossless'

export type InstantPlayableSelection = {
  url: string
  tier: AudioVersionTier
}

export type PlayableUrlInput = {
  previewUrl?: string | null
  audioUrl?: string | null
  highQualityUrl?: string | null
  audioVersions?: SongAudioVersions
}

type AudioVersionCandidate = {
  tier: AudioVersionTier
  url?: string | null
}

const AUDIO_QUALITY_FALLBACKS: Record<AudioQualityMode, AudioVersionTier[]> = {
  auto: [
    'ultraLight',
    'previewUrl',
    'standard',
    'legacyAudioUrl',
    'highQuality',
    'lossless',
  ],
  'data-saver': ['ultraLight', 'previewUrl', 'standard', 'legacyAudioUrl'],
  standard: ['standard', 'ultraLight', 'previewUrl', 'legacyAudioUrl', 'highQuality'],
  'high-quality': [
    'highQuality',
    'standard',
    'legacyAudioUrl',
    'ultraLight',
    'previewUrl',
    'lossless',
  ],
}

function asHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.startsWith('http') ? trimmed : null
}

function versionWithUrl(
  url: string | null | undefined,
  durationSeconds?: number | null,
  offlineEligible?: boolean,
): AudioVersionSource | undefined {
  const normalized = asHttpUrl(url)
  if (!normalized) return undefined
  return {
    url: normalized,
    durationSeconds: durationSeconds ?? undefined,
    offlineEligible,
  }
}

export function buildAudioVersionsFromLegacy(fields: {
  previewUrl?: string | null
  streamUrl?: string | null
  audioUrl?: string | null
  url?: string | null
  highQualityUrl?: string | null
  losslessUrl?: string | null
  durationSeconds?: number | null
}): SongAudioVersions | undefined {
  const durationSeconds = fields.durationSeconds ?? undefined
  const versions: SongAudioVersions = {}

  const ultraLight =
    versionWithUrl(fields.previewUrl, durationSeconds, true) ??
    versionWithUrl(fields.previewUrl, durationSeconds)
  if (ultraLight) versions.ultraLight = ultraLight

  const standard = versionWithUrl(
    fields.streamUrl ?? fields.audioUrl ?? fields.url,
    durationSeconds,
  )
  if (standard) versions.standard = standard

  const highQuality = versionWithUrl(fields.highQualityUrl, durationSeconds)
  if (highQuality && highQuality.url !== standard?.url) {
    versions.highQuality = highQuality
  }

  const lossless = versionWithUrl(fields.losslessUrl, durationSeconds)
  if (lossless) versions.lossless = lossless

  return Object.keys(versions).length > 0 ? versions : undefined
}

export function mergeAudioVersions(
  existing?: SongAudioVersions,
  incoming?: SongAudioVersions,
): SongAudioVersions | undefined {
  if (!existing && !incoming) return undefined
  return {
    ultraLight: incoming?.ultraLight ?? existing?.ultraLight,
    standard: incoming?.standard ?? existing?.standard,
    highQuality: incoming?.highQuality ?? existing?.highQuality,
    lossless: incoming?.lossless ?? existing?.lossless,
  }
}

export function selectInstantPlayableUrl(
  songOrMetadata: PlayableUrlInput,
): InstantPlayableSelection | null {
  return selectPlayableUrlForQualityMode(songOrMetadata, 'auto')
}

export function selectPlayableUrlForQualityMode(
  songOrMetadata: PlayableUrlInput,
  qualityMode: AudioQualityMode,
): InstantPlayableSelection | null {
  const versions = songOrMetadata.audioVersions

  const candidatesByTier: Record<AudioVersionTier, AudioVersionCandidate> = {
    ultraLight: { tier: 'ultraLight', url: versions?.ultraLight?.url },
    previewUrl: { tier: 'previewUrl', url: songOrMetadata.previewUrl },
    standard: { tier: 'standard', url: versions?.standard?.url },
    legacyAudioUrl: { tier: 'legacyAudioUrl', url: songOrMetadata.audioUrl },
    highQuality: { tier: 'highQuality', url: versions?.highQuality?.url },
    lossless: { tier: 'lossless', url: versions?.lossless?.url },
  }

  const seen = new Set<string>()
  for (const tier of AUDIO_QUALITY_FALLBACKS[qualityMode]) {
    const candidate = candidatesByTier[tier]
    const url = asHttpUrl(candidate.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    return { url, tier: candidate.tier }
  }

  return null
}

function firstHttpUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const url = asHttpUrl(value)
    if (url) return url
  }
  return null
}

export function resolveUpgradeTargetForQualityMode(
  songOrMetadata: PlayableUrlInput,
  currentSelection: InstantPlayableSelection | null,
  qualityMode: AudioQualityMode,
): InstantPlayableSelection | null {
  if (!currentSelection) return null

  if (qualityMode === 'data-saver' || qualityMode === 'standard') {
    return null
  }

  if (qualityMode === 'auto') {
    const versionStandardUrl = asHttpUrl(songOrMetadata.audioVersions?.standard?.url)
    const legacyStandardUrl = asHttpUrl(songOrMetadata.audioUrl)
    const standardUrl = versionStandardUrl ?? legacyStandardUrl

    if (standardUrl && standardUrl !== currentSelection.url) {
      return {
        url: standardUrl,
        tier: standardUrl === versionStandardUrl ? 'standard' : 'legacyAudioUrl',
      }
    }

    const highQualityUrl = firstHttpUrl(
      songOrMetadata.audioVersions?.highQuality?.url,
      songOrMetadata.highQualityUrl,
    )
    if (highQualityUrl && highQualityUrl !== currentSelection.url) {
      return { url: highQualityUrl, tier: 'highQuality' }
    }

    return null
  }

  const highQualityUrl = firstHttpUrl(
    songOrMetadata.audioVersions?.highQuality?.url,
    songOrMetadata.highQualityUrl,
  )

  if (
    qualityMode === 'high-quality' &&
    highQualityUrl &&
    highQualityUrl !== currentSelection.url &&
    currentSelection.tier !== 'highQuality'
  ) {
    return { url: highQualityUrl, tier: 'highQuality' }
  }

  return null
}

export function audioVersionAvailability(versions?: SongAudioVersions) {
  return {
    hasUltraLight: Boolean(versions?.ultraLight?.url),
    hasStandard: Boolean(versions?.standard?.url),
    hasHighQuality: Boolean(versions?.highQuality?.url),
    hasLossless: Boolean(versions?.lossless?.url),
  }
}
