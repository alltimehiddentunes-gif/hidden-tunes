import { memo, useEffect } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import AppShell from "../components/navigation/AppShell";

import {
  COLORS,
  GRADIENTS,
  LOGO_SIZES,
  LUXURY_GLOW,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "../constants/theme";

type LibrarySection = {
  id: string;
  title: string;
  eyebrow: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  accent: string;
};

const LIBRARY_GROUPS: { id: string; label: string; sections: LibrarySection[] }[] = [
  {
    id: "your-music",
    label: "Your Music",
    sections: [
      {
        id: "playlists",
        title: "Playlists",
        eyebrow: "CURATED",
        icon: "musical-notes",
        href: "/playlists",
        accent: COLORS.pink,
      },
      {
        id: "favorites",
        title: "Favorites",
        eyebrow: "SAVED",
        icon: "heart",
        href: "/favorites",
        accent: "#F472B6",
      },
      {
        id: "downloads",
        title: "Downloads",
        eyebrow: "OFFLINE",
        icon: "cloud-download",
        href: "/downloads",
        accent: COLORS.blue,
      },
    ],
  },
  {
    id: "collection",
    label: "Collection",
    sections: [
      {
        id: "albums",
        title: "Albums",
        eyebrow: "RELEASES",
        icon: "albums",
        href: "/music-feed",
        accent: COLORS.primaryGlow,
      },
      {
        id: "artists",
        title: "Artists",
        eyebrow: "CREATORS",
        icon: "people",
        href: "/music-feed",
        accent: COLORS.cyan,
      },
      {
        id: "live-radio",
        title: "Live Radio",
        eyebrow: "STATIONS",
        icon: "radio",
        href: "/stations",
        accent: COLORS.primary,
      },
      {
        id: "podcasts",
        title: "Podcasts",
        eyebrow: "SHOWS",
        icon: "mic",
        href: "/podcasts",
        accent: COLORS.cyan,
      },
    ],
  },
];

const LibraryHeroGlow = memo(function LibraryHeroGlow() {
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const scale = useSharedValue<number>(LUXURY_GLOW.scaleMin);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.opacityMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.opacityMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(LUXURY_GLOW.scaleMax, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(LUXURY_GLOW.scaleMin, {
          duration: LUXURY_GLOW.pulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.heroGlow, animatedStyle]}>
      <LinearGradient colors={GRADIENTS.heroAura} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
});

function LibrarySectionCard({ section }: { section: LibrarySection }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.sectionCard}
      onPress={() => router.push(section.href as any)}
    >
      <LinearGradient colors={GRADIENTS.cardElevated} style={styles.sectionSurface}>
        <LinearGradient
          colors={[`${section.accent}33`, "rgba(255,255,255,0.04)"]}
          style={[styles.sectionArt, { borderColor: `${section.accent}55` }]}
        >
          <View style={styles.sectionIconBadge}>
            <Ionicons name={section.icon} size={24} color={section.accent} />
          </View>
        </LinearGradient>

        <Text style={styles.sectionEyebrow}>{section.eyebrow}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sectionTitle}>
          {section.title}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <LinearGradient colors={GRADIENTS.cardElevated} style={styles.hero}>
            <LibraryHeroGlow />

            <View style={styles.logoFrame}>
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.heroEyebrow}>HIDDEN TUNES</Text>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.heroTitle}>
              Your Library
            </Text>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.heroSubtitle}>
              Albums, artists, playlists, favorites, and downloads in one place.
            </Text>
          </LinearGradient>

          {LIBRARY_GROUPS.map((group) => (
            <View key={group.id} style={styles.groupBlock}>
              <Text style={styles.gridLabel}>{group.label}</Text>
              <View style={styles.grid}>
                {group.sections.map((section) => (
                  <LibrarySectionCard key={section.id} section={section} />
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.recentLink}
            onPress={() => router.push("/recently-played" as any)}
          >
            <Ionicons name="time" size={18} color={COLORS.cyan} />
            <Text style={styles.recentLinkText}>Recently Played</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: SPACING.screen,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  hero: {
    borderRadius: 30,
    padding: 22,
    marginBottom: SPACING.section,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...SHADOWS.premium,
  },
  heroGlow: {
    position: "absolute",
    top: -30,
    left: -20,
    right: -20,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
  },
  logoFrame: {
    width: LOGO_SIZES.libraryHero,
    height: LOGO_SIZES.libraryHero,
    borderRadius: LOGO_SIZES.libraryHero / 2,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
    ...SHADOWS.artwork,
  },
  logoImage: {
    width: LOGO_SIZES.libraryHeroImage,
    height: LOGO_SIZES.libraryHeroImage,
  },
  heroEyebrow: {
    color: COLORS.cyan,
    fontSize: TYPOGRAPHY.sectionEyebrow,
    fontWeight: "900",
    letterSpacing: 1.8,
    textAlign: "center",
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 26,
  },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.heroSubtitle,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
    lineHeight: TYPOGRAPHY.heroSubtitle + 5,
    paddingHorizontal: 8,
  },
  gridLabel: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.metadata,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  groupBlock: {
    marginBottom: SPACING.section - 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  sectionCard: {
    width: "48%",
    minWidth: 150,
    flexGrow: 1,
    ...SHADOWS.card,
  },
  sectionSurface: {
    borderRadius: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    minHeight: 164,
  },
  sectionArt: {
    height: 96,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionEyebrow: {
    color: COLORS.textSoft,
    fontSize: TYPOGRAPHY.sectionEyebrow,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: "900",
    marginTop: 6,
    lineHeight: TYPOGRAPHY.cardTitle + 4,
  },
  recentLink: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  recentLinkText: {
    flex: 1,
    color: COLORS.text,
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: "800",
  },
});
