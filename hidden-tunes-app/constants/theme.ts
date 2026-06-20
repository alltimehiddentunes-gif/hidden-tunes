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

export const SHADOWS = {
  premium: {
    shadowColor: COLORS.primaryGlow,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

export const GRADIENTS = {
  main: ["#04010A", "#090312", "#000000"] as const,
  soft: ["#1A0633", "#0A0117", "#000000"] as const,

  premium: ["#1A0633", "#0A0117", "#000000"] as const,
  card: ["#1A0830", "#12071F"] as const,
  neon: ["#A855F7", "#EC4899", "#22D3EE"] as const,
  player: ["#22063D", "#10051F", "#000000"] as const,
};