export const COLORS = {
  background: "#030008",
  backgroundSoft: "#080312",
  backgroundDeep: "#000000",

  card: "rgba(18,7,31,0.58)",
  cardLight: "rgba(35,14,56,0.54)",
  cardGlass: "rgba(255,255,255,0.055)",

  border: "rgba(168,85,247,0.34)",
  borderSoft: "rgba(255,255,255,0.11)",

  primary: "#A855F7",
  primaryDark: "#7E22CE",
  primaryGlow: "#C084FC",

  cyan: "#22D3EE",
  pink: "#EC4899",
  blue: "#3B82F6",

  success: "#22C55E",
  warning: "#FACC15",
  danger: "#EF4444",

  text: "#FFFFFF",
  textMuted: "#C4B5FD",
  textSoft: "#A78BFA",
  textDim: "#7C6F96",

  shadow: "#000000",
};

export const Colors = {
  light: {
    text: "#11181C",
    background: "#FFFFFF",
    tint: COLORS.primary,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: COLORS.primary,
  },
  dark: {
    text: COLORS.text,
    background: COLORS.background,
    tint: COLORS.primary,
    icon: COLORS.textMuted,
    tabIconDefault: COLORS.textMuted,
    tabIconSelected: COLORS.primary,
  },
};

export const GRADIENTS = {
  main: ["#030008", "#090214", "#000000"] as const,
  soft: ["rgba(40,10,72,0.72)", "rgba(8,1,18,0.82)", "#000000"] as const,

  premium: ["rgba(46,12,82,0.7)", "rgba(10,1,23,0.84)", "#000000"] as const,
  card: ["rgba(92,25,145,0.2)", "rgba(18,7,31,0.56)", "rgba(0,0,0,0.26)"] as const,
  cardElevated: ["rgba(78,28,126,0.3)", "rgba(22,8,40,0.58)", "rgba(7,2,14,0.42)"] as const,
  neon: ["#A855F7", "#EC4899", "#22D3EE"] as const,
  player: ["rgba(48,8,82,0.72)", "rgba(16,5,31,0.84)", "#000000"] as const,
  heroAura: ["rgba(168,85,247,0.42)", "rgba(236,72,153,0.22)", "rgba(34,211,238,0.12)"] as const,
};

export const SPACING = {
  hero: 24,
  section: 20,
  card: 12,
  screen: 18,
} as const;

export const TYPOGRAPHY = {
  heroTitle: 18,
  heroSubtitle: 12,
  sectionTitle: 16,
  sectionEyebrow: 10,
  metadata: 14,
  cardTitle: 14,
  cardSubtitle: 11,
} as const;

export const LUXURY_GLOW = {
  pulseDurationMs: 10000,
  opacityMin: 0.12,
  opacityMax: 0.34,
  scaleMin: 0.98,
  scaleMax: 1.04,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  premium: {
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  artwork: {
    shadowColor: "#A855F7",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

export const ARTWORK_FRAME = {
  radiusSm: 14,
  radiusMd: 18,
  radiusLg: 22,
  radiusRound: 999,
  aspectSquare: 1,
} as const;
/** APK home header proportions (music-feed / 2815e04). */
export const HOME_HEADER = {
  contentPaddingTop: 28,
  contentPaddingHorizontal: 18,
  rowMarginBottom: 14,
  brandGap: 9,
  titleSize: 27,
  titleLineHeight: 32,
  markWidth: 74,
  markHeight: 48,
  markRadius: 18,
  imageWidth: 64,
  imageHeight: 42,
  actionSize: 48,
  actionRadius: 24,
} as const;

export const LOGO_SIZES = {
  header: 58,
  headerImage: 50,
  hero: 132,
  heroImage: 118,
  libraryHero: 140,
  libraryHeroImage: 124,
} as const;
