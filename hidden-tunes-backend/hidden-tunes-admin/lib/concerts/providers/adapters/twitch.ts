import type { ConcertProviderAdapter } from "../adapter";

export function extractTwitchTarget(urlOrId: string): {
  kind: "video" | "clip" | "channel";
  id: string;
} | null {
  const raw = String(urlOrId || "").trim();
  if (/^\d{6,}$/.test(raw)) return { kind: "video", id: raw };
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!/twitch\.tv/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "videos" && parts[1]) {
      return { kind: "video", id: parts[1].replace(/^v/, "") };
    }
    if (parts[0] === "clip" && parts[1]) {
      return { kind: "clip", id: parts[1] };
    }
    if (parts[0] === "embed" && url.searchParams.get("channel")) {
      return { kind: "channel", id: String(url.searchParams.get("channel")) };
    }
    if (parts[0] && !["directory", "p", "settings"].includes(parts[0])) {
      return { kind: "channel", id: parts[0] };
    }
  } catch {
    return null;
  }
  return null;
}

export const twitchConcertAdapter: ConcertProviderAdapter = {
  id: "twitch",
  supportsDiscovery: true,
  detect(urlOrId) {
    return Boolean(extractTwitchTarget(urlOrId));
  },
  normalizeContentId(urlOrId) {
    const target = extractTwitchTarget(urlOrId);
    return target ? `${target.kind}:${target.id}` : null;
  },
  resolvePlayback(input) {
    const target =
      extractTwitchTarget(input.contentId || "") ||
      extractTwitchTarget(input.watchUrl || "") ||
      extractTwitchTarget(input.embedUrl || "");
    if (!target) {
      return {
        method: "unsupported",
        embedUrl: null,
        streamUrl: null,
        watchUrl: input.watchUrl || null,
        appCompatible: false,
        reason: "twitch_target_unresolved",
      };
    }
    let embedUrl: string;
    let watchUrl: string;
    if (target.kind === "video") {
      embedUrl = `https://player.twitch.tv/?video=${target.id}&parent=localhost`;
      watchUrl = `https://www.twitch.tv/videos/${target.id}`;
    } else if (target.kind === "clip") {
      embedUrl = `https://clips.twitch.tv/embed?clip=${target.id}&parent=localhost`;
      watchUrl = `https://clips.twitch.tv/${target.id}`;
    } else {
      embedUrl = `https://player.twitch.tv/?channel=${target.id}&parent=localhost`;
      watchUrl = `https://www.twitch.tv/${target.id}`;
    }
    return {
      method: "twitch_embed",
      embedUrl,
      streamUrl: null,
      watchUrl,
      appCompatible: true,
      reason: "twitch_webview_embed",
    };
  },
};
