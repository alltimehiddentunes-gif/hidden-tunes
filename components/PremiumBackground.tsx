import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";


export type PremiumBackgroundVariant =
  | "home"
  | "explore"
  | "player"
  | "library"
  | "profile"
  | "entity";

type VariantPalette = {
  base: readonly [string, string, string];
  diagonal: readonly [string, string, string];
  glass: readonly [string, string];
  hazeA: string;
  hazeB: string;
  line: string;
};

const PALETTES: Record<PremiumBackgroundVariant, VariantPalette> = {
  home: {
    base: ["#030008", "#090214", "#000000"],
    diagonal: ["rgba(168,85,247,0.2)", "rgba(34,211,238,0.09)", "rgba(0,0,0,0)"],
    glass: ["rgba(255,255,255,0.055)", "rgba(255,255,255,0)"],
    hazeA: "rgba(168,85,247,0.24)",
    hazeB: "rgba(34,211,238,0.14)",
    line: "rgba(192,132,252,0.14)",
  },
  explore: {
    base: ["#02040B", "#07101D", "#000000"],
    diagonal: ["rgba(34,211,238,0.18)", "rgba(168,85,247,0.1)", "rgba(0,0,0,0)"],
    glass: ["rgba(34,211,238,0.07)", "rgba(255,255,255,0)"],
    hazeA: "rgba(34,211,238,0.16)",
    hazeB: "rgba(236,72,153,0.1)",
    line: "rgba(34,211,238,0.14)",
  },
  player: {
    base: ["#030008", "#12031F", "#000000"],
    diagonal: ["rgba(168,85,247,0.16)", "rgba(34,211,238,0.08)", "rgba(0,0,0,0)"],
    glass: ["rgba(255,255,255,0.055)", "rgba(255,255,255,0)"],
    hazeA: "rgba(168,85,247,0.2)",
    hazeB: "rgba(34,211,238,0.12)",
    line: "rgba(192,132,252,0.13)",
  },
  library: {
    base: ["#03020A", "#0A0718", "#000000"],
    diagonal: ["rgba(168,85,247,0.14)", "rgba(59,130,246,0.12)", "rgba(0,0,0,0)"],
    glass: ["rgba(196,181,253,0.07)", "rgba(255,255,255,0)"],
    hazeA: "rgba(59,130,246,0.13)",
    hazeB: "rgba(168,85,247,0.13)",
    line: "rgba(167,139,250,0.14)",
  },
  profile: {
    base: ["#030108", "#100416", "#000000"],
    diagonal: ["rgba(236,72,153,0.13)", "rgba(34,211,238,0.09)", "rgba(0,0,0,0)"],
    glass: ["rgba(255,255,255,0.07)", "rgba(255,255,255,0)"],
    hazeA: "rgba(236,72,153,0.12)",
    hazeB: "rgba(34,211,238,0.11)",
    line: "rgba(255,255,255,0.12)",
  },
  entity: {
    base: ["#020008", "#0B0416", "#000000"],
    diagonal: ["rgba(168,85,247,0.16)", "rgba(34,211,238,0.1)", "rgba(0,0,0,0)"],
    glass: ["rgba(255,255,255,0.075)", "rgba(255,255,255,0)"],
    hazeA: "rgba(168,85,247,0.15)",
    hazeB: "rgba(34,211,238,0.1)",
    line: "rgba(192,132,252,0.13)",
  },
};

function PremiumBackground({
  variant = "home",
}: {
  variant?: PremiumBackgroundVariant;
}) {
  const palette = PALETTES[variant] || PALETTES.home;

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient colors={palette.base} style={StyleSheet.absoluteFill} />

      <LinearGradient
        colors={palette.diagonal}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.diagonalPlane, styles.diagonalPlanePrimary]}
      />
      <LinearGradient
        colors={[palette.diagonal[1], "rgba(255,255,255,0.025)", "rgba(0,0,0,0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.diagonalPlane, styles.diagonalPlaneSecondary]}
      />

      <View style={[styles.edgeHaze, styles.edgeHazeTop, { backgroundColor: palette.hazeA }]} />
      <View style={[styles.edgeHaze, styles.edgeHazeBottom, { backgroundColor: palette.hazeB }]} />

      <LinearGradient
        colors={palette.glass}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.glassPlane, styles.glassPlaneTop]}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0)", palette.glass[0], "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.glassPlane, styles.glassPlaneLower]}
      />

      <View style={[styles.reflectionLine, styles.reflectionLineTop, { backgroundColor: palette.line }]} />
      <View style={[styles.reflectionLine, styles.reflectionLineLower, { backgroundColor: palette.line }]} />

      <LinearGradient
        colors={["rgba(0,0,0,0.26)", "rgba(0,0,0,0)", "rgba(0,0,0,0.52)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.vignette} />
    </View>
  );
}

export default memo(PremiumBackground);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    overflow: "hidden",
  },
  diagonalPlane: {
    position: "absolute",
    left: -90,
    right: -90,
    height: 260,
    opacity: 0.86,
  },
  diagonalPlanePrimary: {
    top: 68,
    transform: [{ rotate: "-13deg" }],
  },
  diagonalPlaneSecondary: {
    top: 310,
    height: 210,
    opacity: 0.55,
    transform: [{ rotate: "17deg" }],
  },
  edgeHaze: {
    position: "absolute",
    width: 440,
    height: 280,
    borderRadius: 220,
    opacity: 0.34,
    transform: [{ scaleX: 1.35 }],
  },
  edgeHazeTop: {
    top: -130,
    right: -190,
  },
  edgeHazeBottom: {
    bottom: 92,
    left: -220,
  },
  glassPlane: {
    position: "absolute",
    left: -80,
    right: -80,
    height: 118,
    opacity: 0.62,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
  },
  glassPlaneTop: {
    top: 148,
    transform: [{ rotate: "-9deg" }],
  },
  glassPlaneLower: {
    bottom: 162,
    opacity: 0.46,
    transform: [{ rotate: "12deg" }],
  },
  reflectionLine: {
    position: "absolute",
    left: -40,
    right: -40,
    height: 1,
    opacity: 0.48,
  },
  reflectionLineTop: {
    top: 232,
    transform: [{ rotate: "-9deg" }],
  },
  reflectionLineLower: {
    bottom: 248,
    opacity: 0.32,
    transform: [{ rotate: "12deg" }],
  },
  vignette: {
    ...StyleSheet.flatten(StyleSheet.absoluteFill),
    borderWidth: 18,
    borderColor: "rgba(0,0,0,0.2)",
  },
});
