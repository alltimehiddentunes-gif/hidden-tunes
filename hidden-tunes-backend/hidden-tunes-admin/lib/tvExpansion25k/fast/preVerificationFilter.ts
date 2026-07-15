import type { TvGrowthCandidate } from "@/lib/tvStationHealth";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

export type PreVerificationRejectReason =
  | "missing_url"
  | "invalid_url_syntax"
  | "unsupported_protocol"
  | "placeholder_domain"
  | "example_domain"
  | "known_dead_marker"
  | "login_url"
  | "payment_url"
  | "drm_scheme"
  | "audio_only_file"
  | "static_media_file"
  | "missing_identity";

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "test",
  "invalid",
]);

const DEAD_MARKERS = /\/(?:offline|removed|deleted|disabled|dead|placeholder)(?:\/|$|\?)/i;
const LOGIN_MARKERS = /\/(?:login|signin|sign-in|auth|oauth)(?:\/|$|\?)/i;
const PAYMENT_MARKERS = /\/(?:subscribe|paywall|checkout|billing)(?:\/|$|\?)/i;
const DRM_MARKERS = /widevine|fairplay|playready|clearkey|\/drm(?:\/|$|\?)/i;
const AUDIO_EXTENSIONS = /\.(?:mp3|aac|opus|flac|wav|ogg|m4a)(?:\?|$)/i;
const STATIC_VIDEO_EXTENSIONS = /\.(?:mp4|mkv|avi|mov|wmv|webm|ts)(?:\?|$)/i;

export function preVerificationRejectReason(
  candidate: TvGrowthCandidate
): PreVerificationRejectReason | null {
  const rawUrl = String(candidate.source_url || "").trim();
  if (!rawUrl) return "missing_url";

  const urlCheck = validatePublicTvUrl(rawUrl);
  if (!urlCheck.ok) return "invalid_url_syntax";

  let parsed: URL;
  try {
    parsed = new URL(urlCheck.url);
  } catch {
    return "invalid_url_syntax";
  }

  if (!["https:", "http:"].includes(parsed.protocol)) return "unsupported_protocol";
  if (parsed.protocol === "http:") return "unsupported_protocol";

  const host = parsed.hostname.toLowerCase();
  if (PLACEHOLDER_HOSTS.has(host) || host.endsWith(".example.com")) return "placeholder_domain";
  if (host === "example.org" || host.endsWith(".example.org")) return "example_domain";
  if (host === "example.net" || host.endsWith(".example.net")) return "example_domain";

  if (LOGIN_MARKERS.test(parsed.pathname) || LOGIN_MARKERS.test(rawUrl)) return "login_url";
  if (PAYMENT_MARKERS.test(parsed.pathname) || PAYMENT_MARKERS.test(rawUrl)) return "payment_url";
  if (DRM_MARKERS.test(rawUrl)) return "drm_scheme";
  if (DEAD_MARKERS.test(parsed.pathname)) return "known_dead_marker";

  const path = parsed.pathname.toLowerCase();
  if (AUDIO_EXTENSIONS.test(path) && !/\.m3u8|manifest|playlist/i.test(path)) {
    return "audio_only_file";
  }
  if (STATIC_VIDEO_EXTENSIONS.test(path) && !/\.m3u8|manifest|playlist/i.test(path)) {
    return "static_media_file";
  }

  if (!String(candidate.title || "").trim()) return "missing_identity";

  return null;
}

export function filterCandidatesPreVerification(candidates: TvGrowthCandidate[]) {
  const accepted: TvGrowthCandidate[] = [];
  let rejected = 0;
  const reasons: Record<string, number> = {};

  for (const candidate of candidates) {
    const reason = preVerificationRejectReason(candidate);
    if (reason) {
      rejected += 1;
      reasons[reason] = (reasons[reason] || 0) + 1;
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, rejected, reasons };
}
