import type { ReactNode } from "react";
import { useGlobalSearchParams, usePathname, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIosOperationalPolicy, useIosOperationalItemVisibility } from "../hooks/useIosOperationalPolicy";
import { IOS_OPERATIONAL_PLATFORM, iosOperationalRouteSection, type IosOperationalRef } from "../services/iosOperationalPolicy";

function detailRef(path: string): IosOperationalRef | null {
  const routes: [RegExp, string][] = [[/^\/podcasts\/show\/([^/]+)$/, "podcast_show"], [/^\/podcasts\/episode\/([^/]+)$/, "podcast_episode"], [/^\/audiobooks\/([^/]+)$/, "audiobook"], [/^\/lectures\/([^/]+)$/, "lecture"], [/^\/sports\/(?:fixture|player)\/([^/]+)$/, "sports_fixture"]];
  for (const [pattern, type] of routes) { const match = path.match(pattern); if (match) return { type, id: decodeURIComponent(match[1]) }; }
  return null;
}
function IosRouteMask({ children }: { children: ReactNode }) {
  const path = usePathname();
  const params = useGlobalSearchParams<{ id?: string; channelId?: string }>();
  const policy = useIosOperationalPolicy();
  const section = iosOperationalRouteSection(path);
  const tvId = params.id || params.channelId;
  const ref = detailRef(path) || ((path === "/tv-player" || path === "/youtube-player") && tvId ? { type: "tv", id: String(tvId) } : null);
  const visible = useIosOperationalItemVisibility(ref);
  // Home keeps non-music shortcuts; artist identity/follow state remain independent of track availability.
  const keepContainer = path === "/music-feed" || /^\/artist(?:\/|$)/.test(path);
  const blocked = (!keepContainer && !!section && !policy.sectionEnabled(section)) || (path === "/podcasts/mature" && !policy.sectionEnabled("mature")) || (!!ref && !visible);
  return <View style={styles.fill}>
    <View style={[styles.fill, blocked && styles.hidden]} pointerEvents={blocked ? "none" : "auto"} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}>{children}</View>
    {blocked ? <View style={styles.mask} accessibilityViewIsModal>
      <Text style={styles.title}>{policy.status === "loading" ? "Checking availability…" : "This content is unavailable"}</Text>
      <Text style={styles.copy}>Your account and saved library remain available.</Text>
      <Pressable style={styles.button} onPress={() => router.replace("/more" as never)} accessibilityRole="button"><Text style={styles.buttonText}>More</Text></Pressable>
      <Pressable style={styles.button} onPress={() => router.push("/profile" as never)} accessibilityRole="button"><Text style={styles.buttonText}>Account and settings</Text></Pressable>
    </View> : null}
  </View>;
}
/** Adds no navigation screens and never unmounts the existing stack on policy changes. */
export default function IosOperationalRouteBoundary({ children }: { children: ReactNode }) {
  return IOS_OPERATIONAL_PLATFORM ? <IosRouteMask>{children}</IosRouteMask> : children;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 }, mask: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#08080c", justifyContent: "center", alignItems: "center", padding: 28 }, title: { color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center" }, copy: { color: "#b3b3be", textAlign: "center", marginVertical: 18 }, button: { padding: 16 }, buttonText: { color: "#a6e8ff", fontSize: 16 } });
