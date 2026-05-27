/**
 * Hidden Tunes Visual Engine v1 — mood-to-scene, time atmosphere, procedural variation.
 * CSS/React only; no canvas, WebGL, or video.
 */

export type VisualSceneId =
  | 'midnight-drive'
  | 'healing-sunday'
  | 'afro-sunset'
  | 'piano-rain'
  | 'deep-focus'
  | 'slow-love'
  | 'rainy-apartment'
  | 'neon-city'
  | 'ocean-reflection'
  | 'mountain-fog'

export type TimeAtmosphere = 'dawn' | 'day' | 'dusk' | 'night'

/** User-facing day slice for atmosphere (morning / evening / midnight). */
export type DayPeriod = 'morning' | 'day' | 'evening' | 'midnight'

export type MoodThemeId =
  | 'heartbreak'
  | 'healing'
  | 'focus'
  | 'late-night'
  | 'romantic'
  | 'afro-vibes'

export const MOOD_THEME_SCENES: Record<MoodThemeId, VisualSceneId> = {
  heartbreak: 'rainy-apartment',
  healing: 'ocean-reflection',
  focus: 'deep-focus',
  'late-night': 'midnight-drive',
  romantic: 'slow-love',
  'afro-vibes': 'afro-sunset',
}

const MOOD_THEME_LABEL_HINTS: { match: RegExp; theme: MoodThemeId }[] = [
  { match: /heartbreak|heart.?break|ache|collapse|velvet midnight/i, theme: 'heartbreak' },
  { match: /heal|healing|tide|calm|oceanic|restore/i, theme: 'healing' },
  { match: /focus|deep focus|flow|monk|work|clarity/i, theme: 'focus' },
  { match: /midnight|late night|3am|nocturne|drive/i, theme: 'late-night' },
  { match: /romantic|slow love|ember|intimate|rose neon/i, theme: 'romantic' },
  { match: /afro|sunset|golden hour|warm rhythm/i, theme: 'afro-vibes' },
]

export type VisualSceneVariant = 'hero' | 'card' | 'thumb' | 'ambient'

export type VisualScenePreset = {
  id: VisualSceneId
  label: string
  tagline: string
  /** Base gradient stops (CSS colors) */
  colors: [string, string, string]
  glow: string
  accent: string
  /** 0–360 base angle for linear gradient */
  angle: number
  /** Shape tint for layered blobs */
  shapeA: string
  shapeB: string
  particle: string
}

export const VISUAL_SCENE_PRESETS: Record<VisualSceneId, VisualScenePreset> = {
  'midnight-drive': {
    id: 'midnight-drive',
    label: 'Midnight Drive',
    tagline: 'Late-night highway glow',
    colors: ['#0c1224', '#1a1f3d', '#0f2847'],
    glow: 'rgba(56, 189, 248, 0.22)',
    accent: '#38bdf8',
    angle: 132,
    shapeA: 'rgba(88, 28, 135, 0.35)',
    shapeB: 'rgba(14, 116, 144, 0.28)',
    particle: 'rgba(56, 189, 248, 0.45)',
  },
  'healing-sunday': {
    id: 'healing-sunday',
    label: 'Healing Sunday',
    tagline: 'Soft morning light',
    colors: ['#1a1528', '#2d2440', '#3d3558'],
    glow: 'rgba(244, 114, 182, 0.18)',
    accent: '#f9a8d4',
    angle: 148,
    shapeA: 'rgba(251, 207, 232, 0.2)',
    shapeB: 'rgba(168, 85, 247, 0.15)',
    particle: 'rgba(251, 207, 232, 0.4)',
  },
  'afro-sunset': {
    id: 'afro-sunset',
    label: 'Afro Sunset',
    tagline: 'Golden hour rhythm',
    colors: ['#1f0f14', '#4a1c2e', '#7c2d12'],
    glow: 'rgba(251, 146, 60, 0.24)',
    accent: '#fb923c',
    angle: 118,
    shapeA: 'rgba(234, 88, 12, 0.32)',
    shapeB: 'rgba(190, 24, 93, 0.22)',
    particle: 'rgba(251, 191, 36, 0.42)',
  },
  'piano-rain': {
    id: 'piano-rain',
    label: 'Piano Rain',
    tagline: 'Melancholy keys',
    colors: ['#0a0e14', '#141c28', '#1e293b'],
    glow: 'rgba(148, 163, 184, 0.2)',
    accent: '#94a3b8',
    angle: 165,
    shapeA: 'rgba(71, 85, 105, 0.35)',
    shapeB: 'rgba(30, 41, 59, 0.5)',
    particle: 'rgba(148, 163, 184, 0.35)',
  },
  'deep-focus': {
    id: 'deep-focus',
    label: 'Deep Focus',
    tagline: 'Clarity without noise',
    colors: ['#050a0c', '#0c1818', '#0f2922'],
    glow: 'rgba(52, 211, 153, 0.16)',
    accent: '#34d399',
    angle: 140,
    shapeA: 'rgba(6, 95, 70, 0.28)',
    shapeB: 'rgba(15, 118, 110, 0.2)',
    particle: 'rgba(52, 211, 153, 0.32)',
  },
  'slow-love': {
    id: 'slow-love',
    label: 'Slow Love',
    tagline: 'Intimate warmth',
    colors: ['#1a0f18', '#3b1530', '#4c1d40'],
    glow: 'rgba(244, 114, 182, 0.22)',
    accent: '#f472b6',
    angle: 125,
    shapeA: 'rgba(190, 24, 93, 0.3)',
    shapeB: 'rgba(136, 19, 55, 0.25)',
    particle: 'rgba(244, 114, 182, 0.38)',
  },
  'rainy-apartment': {
    id: 'rainy-apartment',
    label: 'Rainy Apartment',
    tagline: 'Window light & drizzle',
    colors: ['#0c1018', '#151c2c', '#1a2744'],
    glow: 'rgba(96, 165, 250, 0.14)',
    accent: '#60a5fa',
    angle: 155,
    shapeA: 'rgba(30, 58, 138, 0.25)',
    shapeB: 'rgba(51, 65, 85, 0.35)',
    particle: 'rgba(147, 197, 253, 0.3)',
  },
  'neon-city': {
    id: 'neon-city',
    label: 'Neon City',
    tagline: 'Electric skyline',
    colors: ['#0a0614', '#1e1040', '#2d1068'],
    glow: 'rgba(168, 85, 247, 0.28)',
    accent: '#a855f7',
    angle: 112,
    shapeA: 'rgba(168, 85, 247, 0.35)',
    shapeB: 'rgba(236, 72, 153, 0.22)',
    particle: 'rgba(192, 132, 252, 0.45)',
  },
  'ocean-reflection': {
    id: 'ocean-reflection',
    label: 'Ocean Reflection',
    tagline: 'Tidal calm',
    colors: ['#041218', '#0c2a38', '#134e4a'],
    glow: 'rgba(45, 212, 191, 0.2)',
    accent: '#2dd4bf',
    angle: 138,
    shapeA: 'rgba(13, 148, 136, 0.3)',
    shapeB: 'rgba(14, 116, 144, 0.28)',
    particle: 'rgba(45, 212, 191, 0.35)',
  },
  'mountain-fog': {
    id: 'mountain-fog',
    label: 'Mountain Fog',
    tagline: 'High-altitude hush',
    colors: ['#0e1014', '#1c2228', '#2a3440'],
    glow: 'rgba(203, 213, 225, 0.12)',
    accent: '#cbd5e1',
    angle: 172,
    shapeA: 'rgba(71, 85, 105, 0.28)',
    shapeB: 'rgba(148, 163, 184, 0.18)',
    particle: 'rgba(226, 232, 240, 0.28)',
  },
}

const SCENE_IDS = Object.keys(VISUAL_SCENE_PRESETS) as VisualSceneId[]

const TITLE_SCENE_HINTS: { match: RegExp; scene: VisualSceneId }[] = [
  { match: /midnight|3am|lunar|night|nocturne|dusk/i, scene: 'midnight-drive' },
  { match: /neon|chrome|electric|pulse|city glow/i, scene: 'neon-city' },
  { match: /ocean|tidal|calm|drift/i, scene: 'ocean-reflection' },
  { match: /rain|storm|smoke/i, scene: 'rainy-apartment' },
  { match: /focus|work|flow|monk|quiet mind|deep current/i, scene: 'deep-focus' },
  { match: /love|heart|rose|soft|intimate|velvet|ember|collapse/i, scene: 'slow-love' },
  { match: /golden|sunset|afro|warm|hour/i, scene: 'afro-sunset' },
  { match: /heal|sunday|breath|forest/i, scene: 'healing-sunday' },
  { match: /piano|glass|echo|cathedral/i, scene: 'piano-rain' },
  { match: /mountain|fog|silent/i, scene: 'mountain-fog' },
]

const MOOD_FALLBACK_SCENE: Record<LegacyMood, VisualSceneId> = {
  violet: 'neon-city',
  cyan: 'midnight-drive',
  rose: 'slow-love',
  mint: 'deep-focus',
}

const DAY_PERIOD_HOME_SCENES: Record<DayPeriod, VisualSceneId[]> = {
  morning: ['healing-sunday', 'ocean-reflection', 'afro-sunset', 'mountain-fog'],
  day: ['deep-focus', 'afro-sunset', 'mountain-fog', 'healing-sunday'],
  evening: ['afro-sunset', 'slow-love', 'neon-city', 'ocean-reflection'],
  midnight: ['midnight-drive', 'neon-city', 'rainy-apartment', 'piano-rain'],
}

const DAY_PERIOD_MOOD_PAGE_SCENES: Record<DayPeriod, VisualSceneId[]> = {
  morning: ['healing-sunday', 'ocean-reflection', 'afro-sunset'],
  day: ['deep-focus', 'ocean-reflection', 'mountain-fog'],
  evening: ['afro-sunset', 'slow-love', 'neon-city'],
  midnight: ['midnight-drive', 'neon-city', 'rainy-apartment'],
}

/** Stable string hash → unsigned int */
export function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function getTimeAtmosphere(date = new Date()): TimeAtmosphere {
  const hour = date.getHours()
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}

export function getDayPeriod(date = new Date()): DayPeriod {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'midnight'
}

export function resolveMoodThemeScene(label: string): VisualSceneId | undefined {
  for (const hint of MOOD_THEME_LABEL_HINTS) {
    if (hint.match.test(label)) return MOOD_THEME_SCENES[hint.theme]
  }
  return undefined
}

type LegacyMood = 'violet' | 'cyan' | 'rose' | 'mint'

export function catalogToneFromSeed(seed: string): LegacyMood {
  const code = seed.charCodeAt(0) + seed.charCodeAt(seed.length - 1 || 0)
  const tones: LegacyMood[] = ['violet', 'cyan', 'rose', 'mint']
  return tones[code % tones.length]
}

export function resolveEntityScene(seed: string, mood?: LegacyMood): VisualSceneId {
  const themed = resolveMoodThemeScene(seed)
  if (themed) return themed
  return resolveVisualScene({ seed, mood: mood ?? catalogToneFromSeed(seed) })
}

export function resolveSongScene(song: { title: string; artist: string }): VisualSceneId {
  return resolveEntityScene(`${song.title}:${song.artist}`)
}

export function resolveAlbumScene(album: { title: string }): VisualSceneId {
  return resolveEntityScene(album.title)
}

export function resolveArtistScene(artist: { name: string }): VisualSceneId {
  return resolveEntityScene(artist.name)
}

export function pickFromSeed<T>(items: readonly T[], seed: string): T {
  if (items.length === 0) throw new Error('pickFromSeed: empty list')
  return items[hashSeed(seed) % items.length]
}

export function resolveVisualScene(options: {
  seed: string
  mood?: LegacyMood
  preferredSceneId?: VisualSceneId
}): VisualSceneId {
  if (options.preferredSceneId) return options.preferredSceneId

  const lower = options.seed.toLowerCase()
  for (const hint of TITLE_SCENE_HINTS) {
    if (hint.match.test(lower)) return hint.scene
  }

  if (options.mood) {
    const moodScene = MOOD_FALLBACK_SCENE[options.mood]
    const offset = hashSeed(options.seed) % SCENE_IDS.length
    const moodIndex = SCENE_IDS.indexOf(moodScene)
    return SCENE_IDS[(moodIndex + offset) % SCENE_IDS.length]
  }

  return pickFromSeed(SCENE_IDS, options.seed)
}

export function getTimeAwareHomeScene(date = new Date()): VisualSceneId {
  const period = getDayPeriod(date)
  const pool = DAY_PERIOD_HOME_SCENES[period]
  const dayBucket = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${period}`
  return pickFromSeed(pool, dayBucket)
}

export function getMoodRoomsPageScene(date = new Date()): VisualSceneId {
  const period = getDayPeriod(date)
  const pool = DAY_PERIOD_MOOD_PAGE_SCENES[period]
  const dayBucket = `mood-page-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${period}`
  return pickFromSeed(pool, dayBucket)
}

export type SceneVariation = {
  /** 0–3 subtle layout variant */
  variant: number
  glowX: number
  glowY: number
  shapeScale: number
  particlePhase: number
  glowOpacity: number
  shapeOpacity: number
  driftDurationA: number
  driftDurationB: number
}

export function getSceneVariation(seed: string): SceneVariation {
  const h = hashSeed(seed)
  return {
    variant: h % 4,
    glowX: 38 + (h % 24),
    glowY: 12 + ((h >> 4) % 28),
    shapeScale: 0.92 + ((h >> 8) % 12) / 100,
    particlePhase: (h % 360) / 360,
    glowOpacity: 0.74 + ((h >> 6) % 10) / 100,
    shapeOpacity: 0.38 + ((h >> 10) % 8) / 100,
    driftDurationA: 26 + ((h >> 12) % 10),
    driftDurationB: 30 + ((h >> 14) % 12),
  }
}

export type AtmosphereTint = {
  brightness: number
  saturation: number
  overlay: string
}

export function getAtmosphereTint(atmosphere: TimeAtmosphere): AtmosphereTint {
  switch (atmosphere) {
    case 'dawn':
      return { brightness: 1.06, saturation: 0.92, overlay: 'rgba(251, 207, 232, 0.06)' }
    case 'day':
      return { brightness: 1.02, saturation: 1, overlay: 'rgba(255, 255, 255, 0.03)' }
    case 'dusk':
      return { brightness: 0.96, saturation: 1.05, overlay: 'rgba(251, 146, 60, 0.07)' }
    case 'night':
      return { brightness: 0.9, saturation: 0.95, overlay: 'rgba(0, 0, 0, 0.12)' }
    default:
      return { brightness: 1, saturation: 1, overlay: 'transparent' }
  }
}

export function getDayPeriodTint(period: DayPeriod): AtmosphereTint {
  switch (period) {
    case 'morning':
      return { brightness: 1.1, saturation: 0.93, overlay: 'rgba(255, 237, 213, 0.09)' }
    case 'day':
      return { brightness: 1.02, saturation: 1, overlay: 'rgba(255, 255, 255, 0.03)' }
    case 'evening':
      return { brightness: 0.94, saturation: 1.08, overlay: 'rgba(251, 146, 60, 0.11)' }
    case 'midnight':
      return { brightness: 0.86, saturation: 1.04, overlay: 'rgba(0, 0, 0, 0.2)' }
    default:
      return { brightness: 1, saturation: 1, overlay: 'transparent' }
  }
}

export type VisualSceneCssOptions = {
  atmosphere?: TimeAtmosphere
  timeAware?: boolean
}

export function getVisualSceneCssVars(
  sceneId: VisualSceneId,
  seed: string,
  options?: VisualSceneCssOptions,
): Record<string, string | number> {
  const preset = VISUAL_SCENE_PRESETS[sceneId]
  const variation = getSceneVariation(`${sceneId}:${seed}`)
  const timeAware = options?.timeAware ?? true
  const period = getDayPeriod()
  const tint = timeAware
    ? getDayPeriodTint(period)
    : getAtmosphereTint(options?.atmosphere ?? getTimeAtmosphere())

  return {
    '--vs-c1': preset.colors[0],
    '--vs-c2': preset.colors[1],
    '--vs-c3': preset.colors[2],
    '--vs-angle': `${preset.angle + variation.variant * 3}deg`,
    '--vs-glow': preset.glow,
    '--vs-accent': preset.accent,
    '--vs-shape-a': preset.shapeA,
    '--vs-shape-b': preset.shapeB,
    '--vs-particle': preset.particle,
    '--vs-glow-x': `${variation.glowX}%`,
    '--vs-glow-y': `${variation.glowY}%`,
    '--vs-shape-scale': variation.shapeScale,
    '--vs-brightness': tint.brightness,
    '--vs-saturation': tint.saturation,
    '--vs-overlay': tint.overlay,
    '--vs-variant': variation.variant,
    '--vs-particle-phase': variation.particlePhase,
    '--vs-glow-opacity': variation.glowOpacity,
    '--vs-shape-opacity': variation.shapeOpacity,
    '--vs-drift-a': `${variation.driftDurationA}s`,
    '--vs-drift-b': `${variation.driftDurationB}s`,
    '--vs-day-period': period,
  }
}

export function getParticleCount(variant: VisualSceneVariant, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  if (variant === 'thumb') return 2
  if (variant === 'card') return 3
  if (variant === 'hero') return 5
  return 2
}
