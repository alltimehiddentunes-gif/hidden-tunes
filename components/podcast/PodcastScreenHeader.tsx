import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/theme";
import { navigatePodcastBack } from "../../utils/podcastNavigation";

type PodcastScreenHeaderProps = {
  title: string;
  subtitle?: string;
  kicker?: string;
  fallbackRoute?: "/podcasts" | "/library";
  children?: ReactNode;
};

export default function PodcastScreenHeader({
  title,
  subtitle,
  kicker = "HIDDEN TUNES",
  fallbackRoute = "/podcasts",
  children,
}: PodcastScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => navigatePodcastBack(fallbackRoute)}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.copy}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  backButton: {
    padding: 4,
    marginTop: 8,
  },
  copy: {
    flex: 1,
  },
  kicker: {
    color: COLORS.primaryGlow,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
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
    marginTop: 4,
    lineHeight: 18,
  },
});
