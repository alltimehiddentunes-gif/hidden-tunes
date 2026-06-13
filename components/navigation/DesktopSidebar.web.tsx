import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { memo, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import {
  DESKTOP_SIDEBAR_NAV_ITEMS,
  NAVIGATION_SECTION_LABELS,
  NAVIGATION_SECTION_ORDER,
  type AppNavigationItem,
  type NavigationSection,
} from "./navigationConfig";

type DesktopBreakpoint = "compact" | "standard" | "wide";

function isActiveRoute(pathname: string, item: AppNavigationItem) {
  return item.matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(route + "/");
  });
}

function sidebarWidthForBreakpoint(breakpoint: DesktopBreakpoint) {
  if (breakpoint === "wide") return 284;
  if (breakpoint === "standard") return 272;
  return 248;
}

function DesktopSidebar({
  activeItemId,
  pathname,
  breakpoint = "standard",
}: {
  activeItemId?: string;
  pathname: string;
  breakpoint?: DesktopBreakpoint;
}) {
  const router = useRouter();
  const sidebarWidth = sidebarWidthForBreakpoint(breakpoint);
  const sections = useMemo(
    () =>
      NAVIGATION_SECTION_ORDER.map((section) => ({
        section,
        items: DESKTOP_SIDEBAR_NAV_ITEMS.filter((item) => item.section === section),
      })).filter((group) => group.items.length > 0),
    []
  );

  return (
    <View style={[styles.sidebarWrap, { width: sidebarWidth }]}>
      <BlurView intensity={34} tint="dark" style={styles.sidebarGlass}>
        <View style={styles.brandBlock}>
          <View style={styles.logoRing}>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>HT</Text>
            </View>
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>Hidden Tunes</Text>
            <Text style={styles.brandSubtitle}>Premium desktop shell</Text>
          </View>
        </View>

        <ScrollView
          style={styles.navScroll}
          contentContainerStyle={styles.navSections}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((group, groupIndex) => (
            <View key={group.section} style={styles.sectionGroup}>
              {groupIndex > 0 ? <View style={styles.sectionDivider} /> : null}
              <Text style={styles.sectionLabel}>
                {NAVIGATION_SECTION_LABELS[group.section as NavigationSection]}
              </Text>
              {group.items.map((item) => {
                const active = activeItemId === item.id || isActiveRoute(pathname, item);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.label + " navigation"}
                    accessibilityState={{ selected: active }}
                    onPress={() => router.push(item.route as any)}
                    style={({ pressed }) => [
                      styles.navItem,
                      active && styles.navItemActive,
                      pressed && styles.navItemPressed,
                    ]}
                  >
                    {active ? <View style={styles.activeRail} /> : null}
                    <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                      <Ionicons
                        name={active ? item.activeIcon : item.icon}
                        size={18}
                        color={active ? COLORS.primaryGlow : COLORS.textMuted}
                      />
                    </View>
                    <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </BlurView>
    </View>
  );
}

export default memo(DesktopSidebar);

const styles = StyleSheet.create({
  sidebarWrap: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 8,
    flexShrink: 0,
  },
  sidebarGlass: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,6,12,0.72)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  logoRing: {
    padding: 2,
    borderRadius: 18,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,10,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.42)",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  navScroll: {
    flex: 1,
  },
  navSections: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  sectionGroup: {
    gap: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 6,
  },
  navItem: {
    minHeight: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0)",
    position: "relative",
    overflow: "hidden",
  },
  navItemActive: {
    backgroundColor: "rgba(168,85,247,0.16)",
    borderColor: "rgba(192,132,252,0.28)",
    boxShadow: "0 8px 22px rgba(124,58,237,0.14)",
  },
  navItemPressed: {
    opacity: 0.8,
  },
  activeRail: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 999,
    backgroundColor: COLORS.primaryGlow,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "rgba(192,132,252,0.14)",
  },
  navLabel: {
    flex: 1,
    minWidth: 0,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  navLabelActive: {
    color: COLORS.text,
    fontWeight: "900",
  },
});
