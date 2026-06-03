import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { usePathname, useRouter } from "expo-router";
import { ReactNode, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../constants/theme";
import MiniPlayer from "../MiniPlayer";

type ShellRoute =
  | "/music-feed"
  | "/worlds"
  | "/player"
  | "/playlists"
  | "/youtube-feed"
  | "/profile"
  | "/auth";

const MINI_PLAYER_ROUTES = [
  "/music-feed",
  "/worlds",
  "/queue",
  "/playlists",
  "/recently-played",
  "/radio",
  "/lyrics",
  "/player",
  "/cloud-playlists",
] as const;

const MINI_PLAYER_SPACE = 158;

type NavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  href: ShellRoute;
  matches: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    icon: "home-outline",
    activeIcon: "home",
    href: "/music-feed",
    matches: ["/music-feed"],
  },
  {
    label: "Explore",
    icon: "sparkles-outline",
    activeIcon: "sparkles",
    href: "/worlds",
    matches: ["/worlds"],
  },
  {
    label: "Player",
    icon: "play-circle-outline",
    activeIcon: "play-circle",
    href: "/player",
    matches: ["/player", "/queue", "/lyrics", "/radio"],
  },
  {
    label: "Library",
    icon: "library-outline",
    activeIcon: "library",
    href: "/playlists",
    matches: ["/playlists", "/playlist", "/recently-played", "/cloud-playlists"],
  },
  {
    label: "TV",
    icon: "tv-outline",
    activeIcon: "tv",
    href: "/youtube-feed",
    matches: ["/youtube-feed", "/youtube-player"],
  },
  {
    label: "Profile",
    icon: "person-circle-outline",
    activeIcon: "person-circle",
    href: "/profile",
    matches: ["/profile"],
  },
];

function isActiveRoute(pathname: string, item: NavItem) {
  return item.matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(`${route}/`);
  });
}

function isMiniPlayerRoute(pathname: string) {
  return MINI_PLAYER_ROUTES.some((route) => {
    if (pathname === route) return true;
    return pathname.startsWith(`${route}/`);
  });
}

export default function AppShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 8);
  const showMiniPlayer = isMiniPlayerRoute(pathname);

  const items = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        ...item,
        active: isActiveRoute(pathname, item),
      })),
    [pathname]
  );

  return (
    <View style={[styles.shell, style]}>
      <View
        style={[
          styles.content,
          showMiniPlayer && { paddingBottom: MINI_PLAYER_SPACE + bottomOffset },
        ]}
      >
        {children}
      </View>

      {showMiniPlayer && <MiniPlayer />}

      <View
        pointerEvents="box-none"
        style={[styles.navWrap, { paddingBottom: bottomOffset }]}
      >
        <BlurView intensity={34} tint="dark" style={styles.navBlur}>
          <View style={styles.navBar}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} tab`}
                onPress={() => router.push(item.href as any)}
                style={({ pressed }) => [
                  styles.navItem,
                  item.active && styles.navItemActive,
                  pressed && styles.navItemPressed,
                ]}
              >
                <Ionicons
                  name={item.active ? item.activeIcon : item.icon}
                  size={22}
                  color={item.active ? COLORS.primaryGlow : COLORS.textMuted}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.navText, item.active && styles.navTextActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: COLORS.backgroundDeep,
  },
  content: {
    flex: 1,
  },
  navWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    zIndex: 100,
  },
  navBlur: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,4,24,0.64)",
  },
  navBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  navItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  navItemActive: {
    backgroundColor: "rgba(168,85,247,0.12)",
  },
  navItemPressed: {
    opacity: 0.72,
  },
  navText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: "800",
  },
  navTextActive: {
    color: COLORS.text,
  },
});
