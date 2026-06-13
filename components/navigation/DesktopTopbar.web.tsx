import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import {
  NAVIGATION_SECTION_LABELS,
  type AppNavigationItem,
  type NavigationSection,
} from "./navigationConfig";

type DesktopBreakpoint = "compact" | "standard" | "wide";

function fallbackTitle(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Hidden Tunes";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DesktopTopbar({
  activeItem,
  pathname,
  breakpoint = "standard",
}: {
  activeItem?: AppNavigationItem;
  pathname: string;
  breakpoint?: DesktopBreakpoint;
}) {
  const router = useRouter();
  const title = useMemo(() => activeItem?.label || fallbackTitle(pathname), [activeItem?.label, pathname]);
  const sectionLabel = activeItem
    ? NAVIGATION_SECTION_LABELS[activeItem.section as NavigationSection]
    : "Desktop";
  const profileActive = pathname.startsWith("/profile") || pathname.startsWith("/auth");
  const searchActive = pathname.startsWith("/search");
  const compactActions = breakpoint === "compact";

  return (
    <View style={styles.topbarWrap}>
      <BlurView intensity={26} tint="dark" style={styles.topbarGlass}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>{sectionLabel}</Text>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text numberOfLines={1} style={styles.routeHint}>{pathname}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open search"
            onPress={() => router.push("/search" as any)}
            style={({ pressed }) => [
              styles.actionButton,
              searchActive && styles.actionButtonActive,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons name="search" size={18} color={searchActive ? COLORS.primaryGlow : COLORS.cyan} />
            {compactActions ? null : <Text style={[styles.actionText, searchActive && styles.actionTextActive]}>Search</Text>}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/profile" as any)}
            style={({ pressed }) => [
              styles.iconButton,
              profileActive && styles.iconButtonActive,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons
              name={profileActive ? "person-circle" : "person-circle-outline"}
              size={24}
              color={profileActive ? COLORS.primaryGlow : COLORS.textMuted}
            />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

export default memo(DesktopTopbar);

const styles = StyleSheet.create({
  topbarWrap: {
    paddingTop: 14,
    paddingRight: 14,
    paddingLeft: 4,
    paddingBottom: 8,
    flexShrink: 0,
  },
  topbarGlass: {
    minHeight: 72,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(6,6,12,0.58)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    gap: 16,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  routeHint: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
    opacity: 0.72,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  actionButton: {
    height: 40,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  actionButtonActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(192,132,252,0.28)",
  },
  actionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  actionTextActive: {
    color: COLORS.primaryGlow,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  iconButtonActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(192,132,252,0.28)",
  },
  actionPressed: {
    opacity: 0.76,
  },
});
