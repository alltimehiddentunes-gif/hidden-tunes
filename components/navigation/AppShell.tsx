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

const MINI_PLAYER_SPACE = 150;

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
        <BlurView intensity={30} tint="dark" style={styles.navBlur}>
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
                <View style={[styles.iconWrap, item.active && styles.iconWrapActive]}>
                  <Ionicons
                    name={item.active ? item.activeIcon : item.icon}
                    size={21}
                    color={item.active ? COLORS.primaryGlow : COLORS.textMuted}
                  />
                </View>
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
    left: 14,
    right: 14,
    bottom: 0,
    zIndex: 100,
  },
  navBlur: {
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,4,24,0.62)",
  },
  navBar: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  navItem: {
    flex: 1,
    minHeight: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  navItemActive: {
    backgroundColor: "rgba(168,85,247,0.075)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.16)",
  },
  navItemPressed: {
    opacity: 0.76,
  },
  iconWrap: {
    width: 25,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  iconWrapActive: {
    backgroundColor: "rgba(168,85,247,0.09)",
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
