import React, { memo, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { COLORS } from "../constants/theme";
import { useLocalization, type TranslationKey } from "../localization";
import { openMoodCatalog } from "../utils/catalogNavigation";
import { EMOTIONAL_DISCOVERY_SHORTCUTS } from "../utils/emotionalDiscoveryShortcuts";

const MOOD_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  heartbreak: "home.emotionalWorlds.moods.heartbreak",
  healing: "home.emotionalWorlds.moods.healing",
  "late-night": "home.emotionalWorlds.moods.lateNight",
  focus: "home.emotionalWorlds.moods.focus",
  "party-energy": "home.emotionalWorlds.moods.partyEnergy",
  romantic: "home.emotionalWorlds.moods.romantic",
  nostalgic: "home.emotionalWorlds.moods.nostalgic",
  calm: "home.emotionalWorlds.moods.calm",
  "deep-feelings": "home.emotionalWorlds.moods.deepFeelings",
  "hidden-gems": "home.emotionalWorlds.moods.hiddenGems",
};

type EmotionalDiscoveryChipsProps = {
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  showGatewayRows?: boolean;
};

export const EmotionalDiscoveryChips = memo(function EmotionalDiscoveryChips({
  title,
  subtitle,
  style,
  showGatewayRows = true,
}: EmotionalDiscoveryChipsProps) {
  const { t } = useLocalization();

  const emotionalUi = useMemo(
    () => ({
      title: t("home.emotionalWorlds.title"),
      subtitle: t("home.emotionalWorlds.subtitle"),
      podcastsTitle: t("home.emotionalWorlds.podcastsTitle"),
      podcastsSubtitle: t("home.emotionalWorlds.podcastsSubtitle"),
      liveRadioTitle: t("home.emotionalWorlds.liveRadioTitle"),
      liveRadioSubtitle: t("home.emotionalWorlds.liveRadioSubtitle"),
      accessibilityPodcasts: t("home.emotionalWorlds.accessibilityPodcasts"),
      accessibilityLiveRadio: t("home.emotionalWorlds.accessibilityLiveRadio"),
      moodTitle: (id: string, fallback: string) => {
        const key = MOOD_TRANSLATION_KEYS[id];
        return key ? t(key) : fallback;
      },
    }),
    [t]
  );

  const resolvedTitle = title ?? emotionalUi.title;
  const resolvedSubtitle = subtitle ?? emotionalUi.subtitle;

  return (
    <View style={[styles.wrap, style]}>
      {resolvedTitle || resolvedSubtitle ? (
        <View style={styles.header}>
          {resolvedTitle ? <Text style={styles.title}>{resolvedTitle}</Text> : null}
          {resolvedSubtitle ? (
            <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
          ) : null}
        </View>
      ) : null}

      {showGatewayRows ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={emotionalUi.accessibilityPodcasts}
            style={({ pressed }) => [styles.liveRadioCard, pressed && styles.liveRadioCardPressed]}
            onPress={() => router.push("/podcasts" as any)}
          >
            <View style={styles.liveRadioIcon}>
              <Ionicons name="mic" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.liveRadioCopy}>
              <Text style={styles.liveRadioTitle}>{emotionalUi.podcastsTitle}</Text>
              <Text style={styles.liveRadioSubtitle}>{emotionalUi.podcastsSubtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={emotionalUi.accessibilityLiveRadio}
            style={({ pressed }) => [styles.liveRadioCard, pressed && styles.liveRadioCardPressed]}
            onPress={() => router.push("/stations" as any)}
          >
            <View style={styles.liveRadioIcon}>
              <Ionicons name="radio" size={18} color={COLORS.cyan} />
            </View>
            <View style={styles.liveRadioCopy}>
              <Text style={styles.liveRadioTitle}>{emotionalUi.liveRadioTitle}</Text>
              <Text style={styles.liveRadioSubtitle}>{emotionalUi.liveRadioSubtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </Pressable>
        </>
      ) : null}

      <View style={styles.chipWrap}>
        {EMOTIONAL_DISCOVERY_SHORTCUTS.map((item) => {
          const moodLabel = emotionalUi.moodTitle(item.id, item.title);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={moodLabel}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={() => openMoodCatalog(item.title, item.query)}
            >
              <Ionicons name={item.icon} size={13} color={COLORS.primary} />
              <Text style={styles.chipText}>{moodLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

export const SubtleTvEntryLink = memo(function SubtleTvEntryLink({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useLocalization();

  const tvUi = useMemo(
    () => ({
      openTv: t("home.emotionalWorlds.openTv"),
      tvLink: t("home.emotionalWorlds.tvLink"),
    }),
    [t]
  );

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tvUi.openTv}
      style={({ pressed }) => [styles.tvLink, pressed && styles.tvLinkPressed, style]}
      onPress={() => router.push("/youtube-feed" as any)}
    >
      <Ionicons name="tv-outline" size={14} color={COLORS.textMuted} />
      <Text style={styles.tvLinkText}>{tvUi.tvLink}</Text>
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  liveRadioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  liveRadioCardPressed: {
    backgroundColor: "rgba(34,211,238,0.1)",
    borderColor: "rgba(34,211,238,0.32)",
  },
  liveRadioIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,211,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.24)",
  },
  liveRadioCopy: {
    flex: 1,
    gap: 2,
  },
  liveRadioTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  liveRadioSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  chipPressed: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(168,85,247,0.35)",
  },
  chipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  tvLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  tvLinkPressed: {
    opacity: 0.72,
  },
  tvLinkText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
});
