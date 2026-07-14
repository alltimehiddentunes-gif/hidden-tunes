import type { TvGrowthCandidate } from "@/lib/tvStationHealth";
import { validatePublicTvUrl } from "@/lib/tvStationHealth";

export type PreProbeRejectReason =
  | "missing_url"
  | "invalid_url"
  | "http_not_allowed"
  | "unsupported"
  | "web_page"
  | "auth_required"
  | "offline"
  | "missing_identity";

const AUTH_HINTS = /login|signin|sign-in|auth|token=|password|subscribe|paywall/i;
const PAGE_HINTS = /\.html?(?:\?|$)|\/watch\/$|\/channel\/$|\/live\/$/i;

export function preProbeRejectReason(candidate: TvGrowthCandidate): PreProbeRejectReason | null {
  const rawUrl = String(candidate.source_url || "").trim();
  if (!rawUrl) return "missing_url";

  const urlCheck = validatePublicTvUrl(rawUrl);
  if (!urlCheck.ok) return "invalid_url";

  const parsed = new URL(urlCheck.url);
  if (parsed.protocol !== "https:") return "http_not_allowed";

  if (AUTH_HINTS.test(rawUrl)) return "auth_required";
  if (PAGE_HINTS.test(rawUrl) && !/\.m3u8|\.mpd|manifest|playlist/i.test(rawUrl)) {
    return "web_page";
  }

  const title = String(candidate.title || "").trim();
  if (!title) return "missing_identity";

  const blockedProtocols = ["rtmp:", "rtmps:", "rtsp:"];
  if (blockedProtocols.includes(parsed.protocol)) return "unsupported";

  return null;
}

export function filterCandidatesPreProbe(candidates: TvGrowthCandidate[]) {
  const accepted: TvGrowthCandidate[] = [];
  let rejected = 0;
  const reasons: Record<string, number> = {};

  for (const candidate of candidates) {
    const reason = preProbeRejectReason(candidate);
    if (reason) {
      rejected += 1;
      reasons[reason] = (reasons[reason] || 0) + 1;
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, rejected, reasons };
}
