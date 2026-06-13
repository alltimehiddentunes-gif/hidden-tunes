import { usePathname } from "expo-router";
import { ReactNode, useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

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

export default function AppShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pathname = usePathname();
  const backgroundVariant = getBackgroundVariant(pathname);
  const activeItem = useMemo(
    () => DESKTOP_SIDEBAR_NAV_ITEMS.find((item) => isActiveRoute(pathname, item.matches)),
    [pathname]
  );

  return (
    <View style={[styles.shell, style]}>
      <PremiumBackground variant={backgroundVariant} />
      <View style={styles.desktopFrame}>
        <DesktopSidebar activeItemId={activeItem?.id} pathname={pathname} />
        <View style={styles.mainColumn}>
          <DesktopTopbar activeItem={activeItem} pathname={pathname} />
          <View style={styles.content}>{children}</View>
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
    overflow: "hidden",
  },
});
