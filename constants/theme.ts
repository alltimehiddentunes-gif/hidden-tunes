export const COLORS = {
  background: "#04010A",
  backgroundSoft: "#0B0615",
  backgroundDeep: "#000000",

  card: "#12071F",
  cardLight: "#1B0C2E",
  cardGlass: "rgba(255,255,255,0.06)",

  border: "#2B1845",
  borderSoft: "#3B235F",

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
  main: ["#04010A", "#090312", "#000000"] as const,
  soft: ["#1A0633", "#0A0117", "#000000"] as const,

  premium: ["#1A0633", "#0A0117", "#000000"] as const,
  card: ["#1A0830", "#12071F"] as const,
  cardElevated: ["#241040", "#160828", "#0B0414"] as const,
  neon: ["#A855F7", "#EC4899", "#22D3EE"] as const,
  player: ["#22063D", "#10051F", "#000000"] as const,
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
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  premium: {
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  artwork: {
    shadowColor: "#A855F7",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

export const LOGO_SIZES = {
  header: 54,
  headerImage: 46,
  hero: 132,
  heroImage: 118,
  libraryHero: 140,
  libraryHeroImage: 124,
} as const;
