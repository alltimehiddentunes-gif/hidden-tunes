import { memo, useCallback, useEffect, useMemo } from "react";
import {
  FlatList,
  Image,
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

import {
  COLORS,
  GRADIENTS,
  LOGO_SIZES,
  LUXURY_GLOW,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "../constants/theme";
import AppShell from "../components/navigation/AppShell";
import { useAppActiveState } from "../utils/performanceMode";
import { logPerformanceOffscreenWorkPaused } from "../utils/performanceLogs";
import { HOME_MORE_HUB_SHORTCUTS } from "../constants/homeMoreHub";
import {
  sportsEnabled,
  sportsFullUiEnabled,
  sportsMobilePilotEnabled,
  sportsUseDevFixtures,
} from "../constants/sportsFlags";
import { useLocalization } from "../localization";
import type { TranslationKey } from "../localization";

/**
 * Sports Preview entry in More → Discovery.
 * Never added to HOME_MORE_HUB_SHORTCUTS — only shown when the pilot flags
 * are explicitly enabled (Metro .env and Preview eas.json env).
 * Fixture flag controls data only — not whether this navigation card appears.
 * Must NOT require __DEV__: Preview/standalone builds set __DEV__=false.
 */
function isSportsPreviewVisible(): boolean {
  return sportsEnabled && sportsMobilePilotEnabled && sportsFullUiEnabled;
}

type LibrarySection = {
  id: string;
  title: string;
  eyebrow: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  accent: string;
};

type LibraryGroup = {
  id: string;
  label: string;
  sections: LibrarySection[];
};

const HUB_TRANSLATION_KEYS: Record<
  string,
  { title: TranslationKey; subtitle: TranslationKey }
> = {
  "more-tv": { title: "library.hub.tv", subtitle: "library.hub.tvSubtitle" },
  "more-worlds": {
    title: "library.hub.feelings",
    subtitle: "library.hub.feelingsSubtitle",
  },
  "more-motivation": {
    title: "library.hub.motivationals",
    subtitle: "library.hub.motivationalsSubtitle",
  },
  "more-lectures": {
    title: "library.hub.lectures",
    subtitle: "library.hub.lecturesSubtitle",
  },
  "more-search": {
    title: "library.hub.search",
    subtitle: "library.hub.searchSubtitle",
  },
  "more-queue": {
    title: "library.hub.queue",
    subtitle: "library.hub.queueSubtitle",
  },
  "more-library": {
    title: "library.hub.library",
    subtitle: "library.hub.librarySubtitle",
  },
  "more-playlists": {
    title: "library.hub.playlists",
    subtitle: "library.hub.playlistsSubtitle",
  },
};

const LibraryHeroGlow = memo(function LibraryHeroGlow() {
  const appActive = useAppActiveState();
  const opacity = useSharedValue<number>(LUXURY_GLOW.opacityMin);
  const scale = useSharedValue<number>(LUXURY_GLOW.scaleMin);

  useEffect(() => {
    if (!appActive) {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = withTiming(LUXURY_GLOW.opacityMin, { duration: 220 });
      scale.value = withTiming(LUXURY_GLOW.scaleMin, { duration: 220 });
      logPerformanceOffscreenWorkPaused("library_hero_glow", { reason: "app_inactive" });
      return;
    }

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
  }, [appActive, opacity, scale]);

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

const LibrarySectionCard = memo(function LibrarySectionCard({ section }: { section: LibrarySection }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.sectionCard}
      onPress={() => router.push(section.href as any)}
      accessibilityRole="button"
      accessibilityLabel={section.title}
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
});

function LibraryHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <LinearGradient colors={GRADIENTS.cardElevated} style={styles.hero}>
      <LibraryHeroGlow />

      <View style={styles.logoFrame}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.heroTitle}>
        {title}
      </Text>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.heroSubtitle}>
        {subtitle}
      </Text>
    </LinearGradient>
  );
}

function LibraryRecentLink({ label }: { label: string }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.recentLink}
      onPress={() => router.push("/recently-played" as any)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="time" size={18} color={COLORS.cyan} />
      <Text style={styles.recentLinkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const { t } = useLocalization();

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[Sports Preview flags]", {
      sportsEnabled,
      sportsMobilePilotEnabled,
      sportsFullUiEnabled,
      sportsUseDevFixtures,
      showSportsPreview: isSportsPreviewVisible(),
    });
  }, []);

  const libraryGroups = useMemo<LibraryGroup[]>(
    () => [
      {
        id: "more",
        label: t("library.more"),
        sections: [
          ...HOME_MORE_HUB_SHORTCUTS.map((shortcut) => {
            const keys = HUB_TRANSLATION_KEYS[shortcut.key];
            return {
              id: shortcut.key,
              title: keys ? t(keys.title) : shortcut.title,
              eyebrow: keys ? t(keys.subtitle) : shortcut.subtitle,
              icon: shortcut.icon,
              href: shortcut.route,
              accent: shortcut.color,
            };
          }),
          ...(isSportsPreviewVisible()
            ? [
                {
                  id: "sports-preview",
                  title: "Sports Preview",
                  eyebrow: "Live Sports pilot",
                  icon: "football-outline" as keyof typeof Ionicons.glyphMap,
                  href: "/sports",
                  accent: COLORS.cyan,
                },
              ]
            : []),
        ],
      },
      {
        id: "your-music",
        label: t("library.yourMusic"),
        sections: [
          {
            id: "favorites",
            title: t("library.favorites"),
            eyebrow: t("library.favoritesEyebrow"),
            icon: "heart",
            href: "/favorites",
            accent: "#F472B6",
          },
          {
            id: "downloads",
            title: t("library.downloads"),
            eyebrow: t("library.downloadsEyebrow"),
            icon: "cloud-download",
            href: "/downloads",
            accent: COLORS.blue,
          },
        ],
      },
      {
        id: "collection",
        label: t("library.collection"),
        sections: [
          {
            id: "podcasts",
            title: t("library.podcasts"),
            eyebrow: t("library.podcastsEyebrow"),
            icon: "mic",
            href: "/podcasts",
            accent: COLORS.cyan,
          },
          {
            id: "personal-radio",
            title: t("library.personalRadio"),
            eyebrow: t("library.personalRadioEyebrow"),
            icon: "infinite-outline",
            href: "/radio",
            accent: COLORS.pink,
          },
          {
            id: "live-radio",
            title: t("library.liveRadio"),
            eyebrow: t("library.liveRadioEyebrow"),
            icon: "radio",
            href: "/stations",
            accent: COLORS.primary,
          },
          {
            id: "albums",
            title: t("library.albums"),
            eyebrow: t("library.albumsEyebrow"),
            icon: "albums",
            href: "/music-feed",
            accent: COLORS.primaryGlow,
          },
          {
            id: "artists",
            title: t("library.artists"),
            eyebrow: t("library.artistsEyebrow"),
            icon: "people",
            href: "/music-feed",
            accent: COLORS.cyan,
          },
        ],
      },
    ],
    [t]
  );

  const heroCopy = useMemo(
    () => ({
      eyebrow: t("library.heroEyebrow"),
      title: t("library.heroTitle"),
      subtitle: t("library.heroSubtitle"),
    }),
    [t]
  );

  const recentLinkLabel = t("library.recentlyPlayedLink");

  const renderGroup = useCallback(
    ({ item: group }: { item: LibraryGroup }) => (
      <View style={styles.groupBlock}>
        <Text style={styles.gridLabel}>{group.label}</Text>
        <View style={styles.grid}>
          {group.sections.map((section) => (
            <LibrarySectionCard key={section.id} section={section} />
          ))}
        </View>
      </View>
    ),
    []
  );

  const keyExtractor = useCallback((group: LibraryGroup) => group.id, []);

  const listHeader = useMemo(
    () => (
      <LibraryHero
        eyebrow={heroCopy.eyebrow}
        title={heroCopy.title}
        subtitle={heroCopy.subtitle}
      />
    ),
    [heroCopy.eyebrow, heroCopy.subtitle, heroCopy.title]
  );

  const listFooter = useMemo(
    () => <LibraryRecentLink label={recentLinkLabel} />,
    [recentLinkLabel]
  );

  return (
    <AppShell>
      <LinearGradient colors={GRADIENTS.main} style={styles.container}>
        <FlatList
          data={libraryGroups}
          keyExtractor={keyExtractor}
          renderItem={renderGroup}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
        />
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
