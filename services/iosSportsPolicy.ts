import { IOS_OPERATIONAL_PLATFORM, refreshIosOperationalPolicy, iosOperationalControlEnabled, getIosOperationalPolicySnapshot, iosOperationalRequestHeaders, isIos216PolicyTarget } from "./iosOperationalPolicy";

export async function assertIosSportsAvailability(video = false) {
  if (!IOS_OPERATIONAL_PLATFORM) return;
  const policy = await refreshIosOperationalPolicy();
  if (policy.status === "legacy") return;
  if (policy.status !== "active" || !iosOperationalControlEnabled(`source:sports:${video ? "sports-video" : "sports-data"}`)) throw new Error("This Sports content is unavailable on iOS.");
}

/** Sports metadata and broadcast/video are independent switches. Keep the existing DTO. */
export function filterIosSportsPayload<T>(value: T): T {
  if (!IOS_OPERATIONAL_PLATFORM || getIosOperationalPolicySnapshot().status === "legacy" || iosOperationalControlEnabled("source:sports:sports-video")) return value;
  const videoKeys = new Set(["videos", "broadcasts", "highlights", "replays", "watchOptions", "watch_options"]);
  function visit(input: unknown): unknown {
    if (Array.isArray(input)) return input.filter((item) => !(item && typeof item === "object" && ["videos", "highlights", "replays", "broadcasts"].includes(String(item.type || item.id)))).map(visit);
    if (!input || typeof input !== "object") return input;
    const result = Object.fromEntries(Object.entries(input).map(([key, child]) => [key, videoKeys.has(key) ? (Array.isArray(child) ? [] : null) : visit(child)]));
    if ("watchability" in result) result.watchability = { ...(result.watchability && typeof result.watchability === "object" ? result.watchability : {}), playable: false, state: "unavailable", access: null };
    if (["live_in_app", "live_external", "live_subscription", "replay_available", "highlights_available"].includes(String(result.availabilityState))) result.availabilityState = "live_unavailable";
    if ("watchAction" in result) result.watchAction = "unavailable";
    if ("watchLabel" in result) result.watchLabel = "Stream unavailable";
    return result;
  }
  return visit(value) as T;
}

/** Used only at existing Sports playback fetch boundaries; other platforms keep the exact request. */
export async function fetchIosSportsPlayback(url: string, init: RequestInit): Promise<Response> {
  if (!IOS_OPERATIONAL_PLATFORM) return fetch(url, init);
  const policy = await refreshIosOperationalPolicy(true);
  if (policy.status === "legacy") return fetch(url, init);
  await assertIosSportsAvailability(true);
  const parsed = new URL(url);
  const play = parsed.pathname.match(/^\/api\/sports\/(fixtures|broadcasts|videos|channels)\/([^/]+)\/play$/);
  const session = parsed.pathname.match(/^\/api\/sports\/playback-sessions\/([^/]+)$/);
  if (parsed.origin !== "https://admin.hiddentunes.com" || (!play && !session)) throw new Error("Invalid iOS Sports playback route");
  const type = { fixtures: "sports_fixture", broadcasts: "sports_broadcast", videos: "sports_video", channels: "sports_channel" };
  parsed.pathname = play ? `/api/ios/sports/play/${type[play[1] as keyof typeof type]}/${play[2]}` : `/api/ios/sports/sessions/${session![1]}`;
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  if (body) delete body.platform;
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(iosOperationalRequestHeaders())) headers.set(key, value);
  const response = await fetch(parsed.toString(), { ...init, headers, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  if (!response.ok) return response;
  const check = await response.clone().json();
  const current = await refreshIosOperationalPolicy(true);
  if (current.status !== "active" || !isIos216PolicyTarget(check.iosOperational?.policyTarget) || check.iosOperational?.enforcementEnabled !== true || check.iosOperational?.revision !== current.revision || !iosOperationalControlEnabled("source:sports:sports-video")) throw new Error("Sports availability changed during playback authorization");
  return response;
}
