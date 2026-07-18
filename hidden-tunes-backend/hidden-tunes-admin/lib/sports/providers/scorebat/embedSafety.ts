/**
 * ScoreBat embed HTML / URL safety validation.
 */

import { SCOREBAT_ALLOWED_EMBED_HOSTS } from "./config";

const ALLOWED = new Set(
  SCOREBAT_ALLOWED_EMBED_HOSTS.map((h) => h.toLowerCase())
);

export type EmbedValidationResult =
  | { ok: true; embedUrl: string; host: string }
  | { ok: false; reason: string };

/** Extract first iframe src from ScoreBat embed HTML. */
export function extractEmbedSrc(embedHtml: string): string | null {
  const raw = String(embedHtml || "");
  if (!raw.trim()) return null;
  // Reject obvious script injection before parsing.
  if (/<script/i.test(raw) || /javascript:/i.test(raw)) return null;
  if (/\son\w+\s*=/i.test(raw)) return null;

  const match =
    raw.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
    raw.match(/src=["'](https?:\/\/[^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

export function isAllowedScoreBatEmbedHost(host: string): boolean {
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!h) return false;
  if (ALLOWED.has(h)) return true;
  // Allow subdomains of scorebat.com / youtube.com only.
  if (h.endsWith(".scorebat.com") || h === "scorebat.com") return true;
  if (h.endsWith(".youtube.com") || h === "youtube.com") return true;
  if (h.endsWith(".youtube-nocookie.com")) return true;
  return false;
}

export function validateScoreBatEmbed(
  embedOrUrl: string
): EmbedValidationResult {
  const trimmed = String(embedOrUrl || "").trim();
  if (!trimmed) return { ok: false, reason: "empty_embed" };

  let urlStr = trimmed;
  if (/<iframe/i.test(trimmed) || /<script/i.test(trimmed)) {
    const src = extractEmbedSrc(trimmed);
    if (!src) return { ok: false, reason: "no_iframe_src" };
    urlStr = src;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "non_https" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "url_credentials" };
  }
  if (!isAllowedScoreBatEmbedHost(parsed.hostname)) {
    return { ok: false, reason: "unexpected_origin" };
  }

  // Strip autoplay for pilot safety (user gesture required).
  parsed.searchParams.delete("autoplay");

  return {
    ok: true,
    embedUrl: parsed.toString(),
    host: parsed.hostname.toLowerCase(),
  };
}

export function rejectUnsafeEmbedPayload(value: unknown): string[] {
  const json = JSON.stringify(value ?? {});
  const issues: string[] = [];
  if (/SCOREBAT_API_TOKEN|token=[A-Za-z0-9_-]{20,}/i.test(json)) {
    issues.push("token_leak");
  }
  if (/<iframe/i.test(json) && /home|sections|matchcard/i.test(json) === false) {
    // Heuristic for accidental raw embed in browse payloads — callers check keys.
  }
  if (/javascript:/i.test(json)) issues.push("javascript_url");
  return issues;
}
