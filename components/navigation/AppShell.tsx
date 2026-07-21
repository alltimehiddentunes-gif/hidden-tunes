import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { usePathname } from "expo-router";
import { ReactNode, useMemo, useRef, useSyncExternalStore } from "react";
import {
  Platform,
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
import PremiumBackground, { type PremiumBackgroundVariant } from "../PremiumBackground";
import {
  getMobileShellContentPaddingBottom,
  MOBILE_BOTTOM_NAV_ITEMS,
  type AppNavigationItem,
} from "./navigationConfig";
import { createKeyedTapGuard } from "../../utils/tapGuard";
import { getActivePlaybackOwner } from "../../services/playback/PlaybackHandoffCoordinator";
import {
  getNowPlayingSnapshot,
  subscribeNowPlaying,
} from "../../utils/nowPlayingStore";
import { navigatePrimaryDestination } from "../../utils/primaryNavigation";
import { useLocalization } from "../../localization";
import { getNavigationLabelKey } from "../../localization/navigationLabels";

const MINI_PLAYER_ROUTES = [
  "/music-feed",
  "/worlds",
  "/queue",
  "/library",
  "/more",
  "/favorites",
  "/playlists",
  "/recently-played",
  "/radio",
  "/podcasts",
  "/lyrics",
  "/player",
  "/cloud-playlists",
  "/motivation",
] as const;

function isActiveRoute(pathname: string, item: AppNavigationItem) {
  return item.matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(`${route}/`);
  });
}

function getBackgroundVariant(pathname: string): PremiumBackgroundVariant {
  if (pathname === "/music-feed") return "home";
  if (pathname.startsWith("/worlds")) return "explore";
  if (pathname.startsWith("/player") || pathname.startsWith("/queue") || pathname.startsWith("/lyrics") || pathname.startsWith("/radio")) return "player";
  if (
    pathname.startsWith("/library") ||
    pathname.startsWith("/favorites") ||
    pathname.startsWith("/playlists") ||
    pathname.startsWith("/playlist") ||
    pathname.startsWith("/recently-played") ||
    pathname.startsWith("/cloud-playlists") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith("/album") ||
    pathname.startsWith("/artist") ||
    pathname.startsWith("/genre")
  ) {
    return "library";
  }
  if (pathname.startsWith("/profile") || pathname.startsWith("/auth")) return "profile";
  return "entity";
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
  const pathname = usePathname();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const navTapGuardRef = useRef(createKeyedTapGuard(360));
  const nowPlaying = useSyncExternalStore(
    subscribeNowPlaying,
    getNowPlayingSnapshot,
    getNowPlayingSnapshot
  );
  const bottomOffset = Math.max(insets.bottom, 8);
  const showMiniPlayer =
    isMiniPlayerRoute(pathname) &&
    Boolean(nowPlaying.currentSongId) &&
    // TV/video/sports own audible media — MiniPlayer must not imply audio owns it.
    getActivePlaybackOwner() === "shared-audio";
  const shellContentPaddingBottom = getMobileShellContentPaddingBottom(
    insets.bottom,
    showMiniPlayer
  );
  const backgroundVariant = getBackgroundVariant(pathname);

  const items = useMemo(
    () =>
      MOBILE_BOTTOM_NAV_ITEMS.map((item) => ({
        ...item,
        label: t(getNavigationLabelKey(item.id)),
        active: isActiveRoute(pathname, item),
      })),
    [pathname, t]
  );

  return (
    <View style={[styles.shell, Platform.OS === "web" ? styles.webShell : null, style]}>
      <PremiumBackground variant={backgroundVariant} />
      <View
        style={[
          styles.content,
          { paddingBottom: shellContentPaddingBottom },
        ]}
      >
        {children}
      </View>

      {showMiniPlayer ? (
        <View pointerEvents="box-none" style={styles.miniPlayerLayer}>
          <MiniPlayer />
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.navWrap, { paddingBottom: bottomOffset }]}
      >
        <BlurView intensity={30} tint="dark" style={styles.navBlur}>
          <View style={styles.navBar}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} tab`}
                onPress={() => {
                  if (item.active) return;
                  if (!navTapGuardRef.current(item.route)) return;
                  navigatePrimaryDestination(item.route, {
                    from: pathname,
                    source: "AppShell.bottomNav",
                  });
                }}
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
  webShell: {
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
  miniPlayerLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 95,
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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(5,5,8,0.72)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
