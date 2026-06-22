import { usePathname } from "expo-router";
import { ReactNode, useMemo } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { COLORS } from "../../constants/theme";
import PremiumBackground, { type PremiumBackgroundVariant } from "../PremiumBackground";
import DesktopSidebar from "./DesktopSidebar.web";
import DesktopTopbar from "./DesktopTopbar.web";
import { DESKTOP_SIDEBAR_NAV_ITEMS } from "./navigationConfig";

function isActiveRoute(pathname: string, matches: string[]) {
  return matches.some((route) => {
    if (pathname === route) return true;
    return route !== "/" && pathname.startsWith(route + "/");
  });
}

function getBackgroundVariant(pathname: string): PremiumBackgroundVariant {
  if (pathname === "/music-feed") return "home";
  if (pathname.startsWith("/worlds") || pathname.startsWith("/search")) return "explore";
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

type DesktopBreakpoint = "compact" | "standard" | "wide";

function getDesktopBreakpoint(width: number): DesktopBreakpoint {
  if (width >= 1440) return "wide";
  if (width >= 1280) return "standard";
  return "compact";
}

export default function AppShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const breakpoint = getDesktopBreakpoint(width);
  const backgroundVariant = getBackgroundVariant(pathname);
  const activeItem = useMemo(
    () => DESKTOP_SIDEBAR_NAV_ITEMS.find((item) => isActiveRoute(pathname, item.matches)),
    [pathname]
  );

  const contentPadding = breakpoint === "wide" ? 28 : breakpoint === "standard" ? 24 : 18;
  const contentMaxWidth = breakpoint === "wide" ? 1480 : breakpoint === "standard" ? 1320 : 1120;

  return (
    <View style={[styles.shell, style]}>
      <PremiumBackground variant={backgroundVariant} />
      <View style={styles.desktopFrame}>
        <DesktopSidebar activeItemId={activeItem?.id} pathname={pathname} breakpoint={breakpoint} />
        <View style={styles.mainColumn}>
          <DesktopTopbar activeItem={activeItem} pathname={pathname} breakpoint={breakpoint} />
          <View
            style={[
              styles.content,
              {
                paddingHorizontal: contentPadding,
                paddingBottom: contentPadding,
              },
            ]}
          >
            <View style={[styles.contentInner, { maxWidth: contentMaxWidth }]}>
              {children}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minHeight: "100%",
    overflow: "hidden",
    backgroundColor: COLORS.backgroundDeep,
  },
  desktopFrame: {
    flex: 1,
    minHeight: "100%",
    width: "100%",
    maxWidth: "100%",
    flexDirection: "row",
    overflow: "hidden",
    zIndex: 1,
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: "scroll",
    paddingTop: 4,
  },
  contentInner: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "center",
    minWidth: 0,
    overflow: "hidden",
  },
});
