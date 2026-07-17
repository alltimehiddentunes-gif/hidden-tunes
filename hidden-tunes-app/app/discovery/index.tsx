import { useCallback, useRef } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { HomePremiumShortcut } from "../../components/home/HomePremiumShortcut";
import {
  LECTURES_HREF,
  MOTIVATION_HREF,
  MORE_HUB_SHORTCUTS,
} from "../../constants/discoveryShortcuts";
import { COLORS } from "../../constants/theme";
import {
  createTapGuardState,
  shouldIgnoreDuplicateTap,
} from "../../utils/tapPressGuard";

function isValidInternalHref(href?: string | null): href is `/${string}` {
  return typeof href === "string" && href.startsWith("/") && href.length > 1;
}

export default function DiscoveryHubScreen() {
  const tapGuardRef = useRef(createTapGuardState());

  const openShortcut = useCallback((key: string, href?: string) => {
    // Motivationals / Lectures must always resolve to the real Expo Router screens.
    const target =
      key === "more-motivation"
        ? MOTIVATION_HREF
        : key === "more-lectures"
          ? LECTURES_HREF
          : href;

    if (!isValidInternalHref(target)) {
      console.warn("[More navigation] Blocked invalid shortcut route", {
        key,
        href,
        target,
      });
      return;
    }

    if (shouldIgnoreDuplicateTap(tapGuardRef.current, `more:${key}:${target}`)) {
      return;
    }

    router.push({ pathname: target } as never);
  }, []);

  return (
    <LinearGradient colors={["#120818", "#050308"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.kicker}>HIDDEN TUNES</Text>
          <Text style={styles.title}>Discovery Hub</Text>
          <Text style={styles.subtitle}>
            TV, learning, motivation, and music tools
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {MORE_HUB_SHORTCUTS.map((shortcut) => (
            <HomePremiumShortcut
              key={shortcut.key}
              layout="half"
              icon={shortcut.icon}
              title={shortcut.title}
              color={shortcut.color}
              onPress={() => openShortcut(shortcut.key, shortcut.href)}
            />
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  headerText: { flex: 1 },
  kicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginTop: 8,
  },
});
