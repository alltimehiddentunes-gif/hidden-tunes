import { createHash } from "node:crypto";

import type { ContentEngineType } from "@/lib/contentEngine/types";
import { validateSafeHttpUrl } from "@/lib/contentEngine/urlSafety";

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

export function normalizeContentTitle(value: unknown, maxLength = 300) {
  const text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return text || null;
}

export function normalizeContentUrl(value: unknown, maxLength = 2000) {
  const safeUrl = validateSafeHttpUrl(value, maxLength);
  if (!safeUrl) return null;

  try {
    const url = new URL(safeUrl);
    url.hash = "";
    url.username = "";
    url.password = "";

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function buildStableSourceKey(
  contentType: ContentEngineType,
  parts: Record<string, unknown>
) {
  const normalizedEntries = Object.entries(parts)
    .map(([key, value]) => {
      if (typeof value === "string" && value.includes("://")) {
        return [key, normalizeContentUrl(value) || String(value).trim()] as const;
      }

      if (typeof value === "string") {
        return [key, normalizeContentTitle(value, 500) || String(value).trim()] as const;
      }

      return [key, value] as const;
    })
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  const payload = JSON.stringify({
    contentType,
    parts: Object.fromEntries(normalizedEntries),
  });

  return createHash("sha256").update(payload).digest("hex");
}

export function buildUrlDedupeKey(value: unknown) {
  const normalized = normalizeContentUrl(value);
  return normalized ? `url:${normalized}` : null;
}

export function buildTitleDedupeKey(value: unknown) {
  const normalized = normalizeContentTitle(value);
  return normalized ? `title:${normalized.toLowerCase()}` : null;
}

export function buildCompositeDedupeKey(
  contentType: ContentEngineType,
  parts: Record<string, unknown>
) {
  return `${contentType}:${buildStableSourceKey(contentType, parts)}`;
}
