import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { installedIosOperationalIdentity, isIos216PolicyTarget, isIosCurrentNativeIdentity, ios216RequestHeaders } from "./iosOperationalIdentity";
import { IosOperationalPolicyClient, IosOperationalUnavailableError, type IosOperationalAccess, type IosOperationalRef, type IosOperationalSection } from "./iosOperationalPolicyCore";

export type { IosOperationalRef, IosOperationalSection, IosOperationalAccess, IosOperationalSnapshot, IosOperationalPlayback, IosOperationalDelivery } from "./iosOperationalPolicyCore";
const POLICY_STORAGE_KEY = "@hidden_tunes_ios_operational_policy_IOS_216_v1";
function readNativePolicyIdentity() {
  try { return Platform.OS === "ios" ? requireOptionalNativeModule("ExponentConstants") : null; }
  catch { return null; }
}
export const IOS_OPERATIONAL_IDENTITY = installedIosOperationalIdentity(Platform.OS, readNativePolicyIdentity());
/** Existing callers use this capability guard, scoped to qualified installed binaries. */
export const IOS_OPERATIONAL_PLATFORM = isIosCurrentNativeIdentity(IOS_OPERATIONAL_IDENTITY);
export const iosOperationalRequestHeaders = () => ios216RequestHeaders(IOS_OPERATIONAL_IDENTITY);
export { isIos216PolicyTarget };
const client = new IosOperationalPolicyClient({
  platform: Platform.OS, identity: IOS_OPERATIONAL_IDENTITY, now: Date.now,
  read: () => AsyncStorage.getItem(POLICY_STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(POLICY_STORAGE_KEY, value),
  request: async (path, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const trace = (globalThis as any).__htTrace as ((event: string, details?: Record<string, unknown>) => void) | undefined;
    const stage = path.startsWith("/api/ios/playback/") ? "playback" : path.startsWith("/api/ios/policy") ? "policy" : "resolve";
    trace?.(`ios_${stage}_request_start`);
    try {
      const response = await fetch(`https://admin.hiddentunes.com${path}`, { ...init, headers: { Accept: "application/json", ...init?.headers, ...iosOperationalRequestHeaders() }, signal: controller.signal, cache: "no-store" });
      trace?.(`ios_${stage}_request_end`, { status: response.status });
      return response;
    } catch (error) {
      trace?.(`ios_${stage}_request_error`, { status: error instanceof Error ? error.name : "unknown" });
      throw error;
    } finally { clearTimeout(timeout); }
  },
});
export const getIosOperationalPolicySnapshot = client.getSnapshot;
export const subscribeIosOperationalPolicy = client.subscribe;
export const refreshIosOperationalPolicy = client.refresh;
export const iosOperationalSectionEnabled = client.sectionEnabled;
export const iosOperationalControlEnabled = client.controlEnabled;
export const isIosOperationalItemVisible = client.itemVisible;
export const filterIosOperationalItems = client.filter;
export const resolveIosOperationalPlayback = client.playback;
export const assertIosOperationalContentAllowed = client.assertAllowed;
const pendingVisibility = new Map<string, IosOperationalRef>();
let visibilityScheduled = false;
/** Coalesce mounted cards into bounded resolve batches, including restored cached arrays. */
export function requestIosOperationalItemVisibility(ref: IosOperationalRef | null) {
  if (!IOS_OPERATIONAL_PLATFORM || !ref || client.getSnapshot().status !== "active" || client.itemVisible(ref)) return;
  pendingVisibility.set(`${ref.type}:${ref.id}`, ref);
  if (visibilityScheduled) return;
  visibilityScheduled = true;
  void Promise.resolve().then(async () => {
    visibilityScheduled = false;
    const refs = [...pendingVisibility.values()]; pendingVisibility.clear();
    for (const podcast of [false, true]) {
      const group = refs.filter((item) => item.type.startsWith("podcast") === podcast);
      if (group.length) await client.filter(group, (item) => item, await iosOperationalMatureAccess(group[0]));
    }
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Map existing canonical adapter identifiers. Source labels alone never authorize an item. */
export function iosOperationalSongRef(song: { id?: unknown; source?: unknown; providerRawId?: unknown; episodeId?: unknown; iosPolicyType?: unknown } | null | undefined): IosOperationalRef | null {
  if (!song) return null;
  const id = String(song.id || "");
  const prefixes: [string, string][] = [["radio-", "radio"], ["podcast-", "podcast_episode"], ["audiobook-chapter-", "audiobook_chapter"], ["lecture-session-", "lecture_file"], ["motivation-item-", "motivational"]];
  for (const [prefix, type] of prefixes) if (id.startsWith(prefix)) {
    const canonical = id.slice(prefix.length);
    return UUID.test(canonical) ? { type: type === "radio" ? (song.iosPolicyType === "radio" || song.iosPolicyType === "radio_browser_station" ? song.iosPolicyType : "radio_legacy_station") : type, id: canonical.toLowerCase() } : null;
  }
  if (UUID.test(id)) return { type: "music", id: id.toLowerCase() };
  for (const provider of ["audius", "archive", "jamendo", "fma", "musopen"]) {
    if (String(song.source) === provider || id.startsWith(`${provider}-`)) {
      const rawId = String(song.providerRawId || (id.startsWith(`${provider}-`) ? id.slice(provider.length + 1) : ""));
      if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(rawId)) return { type: `external_music_${provider}`, id: rawId };
    }
  }
  return null;
}
export async function iosOperationalMatureAccess(ref: IosOperationalRef | null): Promise<IosOperationalAccess> {
  if (!IOS_OPERATIONAL_PLATFORM) return {};
  if (ref?.type.startsWith("podcast")) {
    const { shouldIncludeMaturePodcasts } = await import("../utils/maturePodcastSettings");
    return { matureEnabled: shouldIncludeMaturePodcasts() };
  }
  const { shouldIncludeMatureInApi } = await import("../utils/matureContentSettings");
  return { matureEnabled: shouldIncludeMatureInApi() };
}
export async function authorizeIosOperationalSong<T extends { id?: unknown; source?: unknown; providerRawId?: unknown; streamUrl?: unknown; url?: unknown; audioUrl?: unknown; audio_url?: unknown }>(song: T): Promise<T> {
  if (!IOS_OPERATIONAL_PLATFORM) return song;
  const trace = (globalThis as any).__htTrace as ((event: string, details?: Record<string, unknown>) => void) | undefined;
  const ref = iosOperationalSongRef(song);
  trace?.("ios_authorize_start", { songId: String(song.id || ""), status: client.getSnapshot().status });
  let playback: Awaited<ReturnType<typeof resolveIosOperationalPlayback>>;
  try {
    const access = await iosOperationalMatureAccess(ref);
    trace?.("ios_authorize_access_ready", { songId: String(song.id || ""), status: client.getSnapshot().status });
    playback = await resolveIosOperationalPlayback(ref, access);
    trace?.("ios_authorize_resolved", { songId: String(song.id || ""), status: playback.enforced ? "enforced" : "legacy" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace?.("ios_authorize_error", { songId: String(song.id || ""), status: message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 90) });
    throw error;
  }
  if (!playback.enforced) return song;
  if (playback.delivery !== "direct" && playback.delivery !== "controlled_media") throw new IosOperationalUnavailableError();
  return { ...song, streamUrl: playback.playbackUrl, url: playback.playbackUrl, audioUrl: playback.playbackUrl, audio_url: playback.playbackUrl };
}
export async function assertIosOperationalSongAllowed(song: Parameters<typeof iosOperationalSongRef>[0]) {
  if (!IOS_OPERATIONAL_PLATFORM) return;
  const ref = iosOperationalSongRef(song);
  await refreshIosOperationalPolicy();
  await assertIosOperationalContentAllowed(ref, await iosOperationalMatureAccess(ref));
}

/** Existing owners subscribe without remounting or changing queue membership. */
export function monitorIosOperationalPlayback(check: () => void | Promise<void>) {
  if (!IOS_OPERATIONAL_PLATFORM) return () => {};
  let alive = true;
  let inFlight = false;
  const run = async () => {
    if (!alive || inFlight) return;
    inFlight = true;
    try { await refreshIosOperationalPolicy(true); if (alive) await check(); } catch { /* Owner check handles denial. */ }
    finally { inFlight = false; }
  };
  const timer = setInterval(() => { void run(); }, 15000);
  const state = AppState.addEventListener("change", (next) => { if (next === "active") void run(); });
  void run();
  return () => { alive = false; clearInterval(timer); state.remove(); };
}

export function iosOperationalRouteSection(route: string): IosOperationalSection | null {
  const path = route.split("?")[0];
  if (/^\/(stations|radio)(\/|$)/.test(path)) return "radio";
  if (/^\/(youtube-feed|tv-player|youtube-player)(\/|$)/.test(path)) return "tv";
  if (/^\/podcasts(\/|$)/.test(path)) return "podcasts";
  if (/^\/audiobooks(\/|$)/.test(path)) return "audiobooks";
  if (/^\/lectures(\/|$)/.test(path)) return "lectures";
  if (/^\/motivation(\/|$)/.test(path)) return "motivationals";
  if (/^\/sports(\/|$)/.test(path)) return "sports";
  if (/^\/(music-feed|worlds|album|artist|explore)(\/|$)/.test(path)) return "music";
  return null;
}
export { IosOperationalUnavailableError };
