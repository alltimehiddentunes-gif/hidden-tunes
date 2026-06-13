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
  audioVersions?: SongAudioVersions
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
  const versions = songOrMetadata.audioVersions

  const candidates: Array<{ tier: AudioVersionTier; url?: string | null }> = [
    { tier: 'ultraLight', url: versions?.ultraLight?.url },
    { tier: 'previewUrl', url: songOrMetadata.previewUrl },
    { tier: 'standard', url: versions?.standard?.url },
    { tier: 'legacyAudioUrl', url: songOrMetadata.audioUrl },
    { tier: 'highQuality', url: versions?.highQuality?.url },
    { tier: 'lossless', url: versions?.lossless?.url },
  ]

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const url = asHttpUrl(candidate.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    return { url, tier: candidate.tier }
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
