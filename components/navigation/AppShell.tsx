import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { usePathname, useRootNavigationState } from "expo-router";
import {
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
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
import {
  getActivePlaybackOwnerSnapshot,
  subscribeActivePlaybackOwner,
  type PlaybackOwnerId,
} from "../../services/playback/PlaybackHandoffCoordinator";
import {
  getNowPlayingSongIdSnapshot,
  subscribeNowPlaying,
} from "../../utils/nowPlayingStore";
import { navigatePrimaryDestination } from "../../utils/primaryNavigation";
import { markMetroRender } from "../../utils/metroRenderProbe";
import { recordIos217AppShellRenderReasons } from "../../utils/ios217HomeFabricAb";
import {
  countIos217Fabric,
  sampleIos217OffscreenMountedScreens,
} from "../../utils/ios217FabricWorkload";
import { useLocalization } from "../../localization";
import { getNavigationLabelKey } from "../../localization/navigationLabels";
import {
  markDestinationFirstFrame,
  markTabNavigationDispatch,
  markTabPressHandler,
  markTabTouchDown,
} from "../../utils/tapResponseDiagnostics";

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

/** TV / video / sports own the surface — music MiniPlayer must stay hidden. */
function isForeignPlaybackOwner(owner: PlaybackOwnerId | null): boolean {
  return owner === "tv" || owner === "video" || owner === "sports";
}

/**
 * Product MiniPlayer gate.
 * Require a loaded songId on a mini route.
 * Allow null owner (claim race) and shared-audio; only exclude foreign owners.
 * Ownership MUST be read via useSyncExternalStore — a one-shot getActivePlaybackOwner()
 * left MiniPlayer permanently absent when owner flipped after the songId notification.
 */
function shouldShowMiniPlayer(
  pathname: string,
  songId: string,
  owner: PlaybackOwnerId | null
): boolean {
  return (
    isMiniPlayerRoute(pathname) &&
    Boolean(songId) &&
    !isForeignPlaybackOwner(owner)
  );
}

function isActiveRoute(pathname: string, item: AppNavigationItem) {
  return item.matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(`${route}/`);
  });
}

function getBackgroundVariant(pathname: string): PremiumBackgroundVariant {
  if (pathname === "/music-feed") return "home";
  if (pathname.startsWith("/worlds")) return "explore";
  if (
    pathname.startsWith("/player") ||
    pathname.startsWith("/queue") ||
    pathname.startsWith("/lyrics") ||
    pathname.startsWith("/radio")
  ) {
    return "player";
  }
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

const BottomTabButton = memo(function BottomTabButton({
  item,
  onNavigate,
}: {
  item: AppNavigationItem & { label: string; active: boolean };
  onNavigate: (item: AppNavigationItem & { label: string; active: boolean }) => void;
}) {
  const handlePressIn = useCallback(
    (event: { timeStamp?: number }) => {
      markTabTouchDown(item.route, event.timeStamp);
    },
    [item.route]
  );

  const handlePress = useCallback(() => {
    onNavigate(item);
  }, [item, onNavigate]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.label} tab`}
      onPressIn={handlePressIn}
      onPress={handlePress}
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
      <Text numberOfLines={1} style={[styles.navText, item.active && styles.navTextActive]}>
        {item.label}
      </Text>
    </Pressable>
  );
});

/**
 * Chrome owns its own subscriptions. Memoized with zero props so a parent Home
 * re-render does not remount/rebuild background, blur nav, or MiniPlayer host.
 */
const AppShellChrome = memo(function AppShellChrome() {
  markMetroRender("appShell");
  const pathname = usePathname();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const navTapGuardRef = useRef(createKeyedTapGuard(360));
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const currentSongId = useSyncExternalStore(
    subscribeNowPlaying,
    getNowPlayingSongIdSnapshot,
    getNowPlayingSongIdSnapshot
  );
  const activePlaybackOwner = useSyncExternalStore(
    subscribeActivePlaybackOwner,
    getActivePlaybackOwnerSnapshot,
    getActivePlaybackOwnerSnapshot
  );

  const bottomOffset = Math.max(insets.bottom, 8);
  const showMiniPlayer = shouldShowMiniPlayer(
    pathname,
    currentSongId,
    activePlaybackOwner
  );

  const backgroundVariant = getBackgroundVariant(pathname);
  const rootNavState = useRootNavigationState();
  const navigationRouteCount = Array.isArray(rootNavState?.routes)
    ? rootNavState.routes.length
    : 0;

  const semanticRef = useRef<{
    pathname: string;
    backgroundVariant: PremiumBackgroundVariant;
  } | null>(null);
  {
    countIos217Fabric("pathnameNotifications");
    countIos217Fabric("backgroundVariantNotifications");
    const reasons: string[] = [];
    const prev = semanticRef.current;
    if (prev) {
      if (prev.pathname !== pathname) {
        reasons.push("pathname");
        countIos217Fabric("pathnameActualChanges");
      }
      if (prev.backgroundVariant !== backgroundVariant) {
        reasons.push("backgroundVariant");
        countIos217Fabric("backgroundVariantActualChanges");
      }
    } else {
      // First mount — not a churn event.
    }
    recordIos217AppShellRenderReasons(reasons);
    semanticRef.current = { pathname, backgroundVariant };
  }

  const items = useMemo(
    () =>
      MOBILE_BOTTOM_NAV_ITEMS.map((item) => ({
        ...item,
        label: t(getNavigationLabelKey(item.id)),
        active: isActiveRoute(pathname, item),
      })),
    [pathname, t]
  );

  const handleNavigate = useCallback(
    (item: AppNavigationItem & { label: string; active: boolean }) => {
      markTabPressHandler(item.route);
      if (item.active) return;
      if (!navTapGuardRef.current(item.route)) return;
      markTabNavigationDispatch(item.route);
      navigatePrimaryDestination(item.route, {
        from: pathnameRef.current,
        source: "AppShell.bottomNav",
      });
    },
    []
  );

  useEffect(() => {
    if (pathname === "/music-feed") {
      (globalThis as typeof globalThis & { __htStartIos217OnHome?: () => void })
        .__htStartIos217OnHome?.();
      sampleIos217OffscreenMountedScreens(Math.max(0, navigationRouteCount - 1));
    }
    const frame = requestAnimationFrame(() => {
      markDestinationFirstFrame(pathname);
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationRouteCount, pathname]);

  return (
    <>
      <PremiumBackground variant={backgroundVariant} />

      {showMiniPlayer ? (
        <View pointerEvents="box-none" style={styles.miniPlayerLayer}>
          <MiniPlayer />
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.navWrap, { paddingBottom: bottomOffset }]}>
        <BlurView intensity={30} tint="dark" style={styles.navBlur}>
          <View style={styles.navBar}>
            {items.map((item) => (
              <BottomTabButton key={item.id} item={item} onNavigate={handleNavigate} />
            ))}
          </View>
        </BlurView>
      </View>
    </>
  );
});

export default function AppShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const currentSongId = useSyncExternalStore(
    subscribeNowPlaying,
    getNowPlayingSongIdSnapshot,
    getNowPlayingSongIdSnapshot
  );
  const activePlaybackOwner = useSyncExternalStore(
    subscribeActivePlaybackOwner,
    getActivePlaybackOwnerSnapshot,
    getActivePlaybackOwnerSnapshot
  );
  const showMiniPlayer = shouldShowMiniPlayer(
    pathname,
    currentSongId,
    activePlaybackOwner
  );

  // Sticky bottom inset: once MiniPlayer space is reserved for this route+song,
  // keep the same padding while the song remains loaded. Progress ticks never
  // change this value — only songId / route / foreign-owner transitions do.
  // That prevents Home FlatList from relayouting on playhead updates.
  const reservedMiniSpaceRef = useRef(false);
  const previousPaddingFlagRef = useRef(false);
  if (!isMiniPlayerRoute(pathname) || isForeignPlaybackOwner(activePlaybackOwner)) {
    reservedMiniSpaceRef.current = false;
  } else if (showMiniPlayer) {
    reservedMiniSpaceRef.current = true;
  } else if (!currentSongId) {
    reservedMiniSpaceRef.current = false;
  }
  const reserveMiniSpace = reservedMiniSpaceRef.current || showMiniPlayer;
  if (previousPaddingFlagRef.current !== reserveMiniSpace) {
    previousPaddingFlagRef.current = reserveMiniSpace;
    countIos217Fabric("miniShellPaddingChanges");
  }
  const shellContentPaddingBottom = getMobileShellContentPaddingBottom(
    insets.bottom,
    reserveMiniSpace
  );

  return (
    <View style={[styles.shell, Platform.OS === "web" ? styles.webShell : null, style]}>
      <AppShellChrome />
      <View style={[styles.content, { paddingBottom: shellContentPaddingBottom }]}>
        {children}
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
