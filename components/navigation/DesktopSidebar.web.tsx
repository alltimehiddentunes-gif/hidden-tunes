import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../../constants/theme";
import {
  DESKTOP_SIDEBAR_NAV_ITEMS,
  type AppNavigationItem,
  type NavigationSection,
} from "./navigationConfig";

const SECTION_LABELS: Record<NavigationSection, string> = {
  primary: "Discover",
  library: "Library",
  media: "Media",
  account: "Account",
  creator: "Creator",
  admin: "Admin",
};

const SECTION_ORDER: NavigationSection[] = [
  "primary",
  "library",
  "media",
  "creator",
  "admin",
  "account",
];

function isActiveRoute(pathname: string, item: AppNavigationItem) {
  return item.matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(route + "/");
  });
}

function DesktopSidebar({
  activeItemId,
  pathname,
}: {
  activeItemId?: string;
  pathname: string;
}) {
  const router = useRouter();
  const sections = useMemo(
    () =>
      SECTION_ORDER.map((section) => ({
        section,
        items: DESKTOP_SIDEBAR_NAV_ITEMS.filter((item) => item.section === section),
      })).filter((group) => group.items.length > 0),
    []
  );

  return (
    <View style={styles.sidebarWrap}>
      <BlurView intensity={30} tint="dark" style={styles.sidebarGlass}>
        <View style={styles.brandBlock}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>HT</Text>
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>Hidden Tunes</Text>
            <Text style={styles.brandSubtitle}>Desktop</Text>
          </View>
        </View>

        <View style={styles.navSections}>
          {sections.map((group) => (
            <View key={group.section} style={styles.section}>
              <Text style={styles.sectionLabel}>{SECTION_LABELS[group.section]}</Text>
              {group.items.map((item) => {
                const active = activeItemId === item.id || isActiveRoute(pathname, item);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.label + " navigation"}
                    onPress={() => router.push(item.route as any)}
                    style={({ pressed }) => [
                      styles.navItem,
                      active && styles.navItemActive,
                      pressed && styles.navItemPressed,
                    ]}
                  >
                    <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                      <Ionicons
                        name={active ? item.activeIcon : item.icon}
                        size={19}
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
        </View>
      </BlurView>
    </View>
  );
}

export default memo(DesktopSidebar);

const styles = StyleSheet.create({
  sidebarWrap: {
    width: 264,
    padding: 16,
    paddingRight: 10,
  },
  sidebarGlass: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(5,5,10,0.68)",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  logoMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.36)",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  brandSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  navSections: {
    flex: 1,
    padding: 10,
    gap: 10,
  },
  section: {
    gap: 4,
  },
  sectionLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  navItem: {
    minHeight: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0)",
  },
  navItemActive: {
    backgroundColor: "rgba(168,85,247,0.14)",
    borderColor: "rgba(192,132,252,0.22)",
  },
  navItemPressed: {
    opacity: 0.78,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "rgba(192,132,252,0.12)",
  },
  navLabel: {
    flex: 1,
    minWidth: 0,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  navLabelActive: {
    color: COLORS.text,
  },
});
