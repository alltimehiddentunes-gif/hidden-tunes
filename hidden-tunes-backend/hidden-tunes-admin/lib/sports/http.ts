import { NextResponse } from "next/server";

import { parsePositiveInt } from "@/lib/tvCatalog";

import {
  SPORTS_DEFAULT_PAGE_LIMIT,
  SPORTS_MAX_PAGE_LIMIT,
  SPORTS_SAFE_FALLBACK_COUNTRY,
} from "./constants";
import type { SportsPlatform } from "./types";
import { SPORTS_PLATFORMS } from "./types";

export function jsonSportsOk(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ success: true, ...body }, init);
}

export function jsonSportsError(
  error: string,
  status: number,
  details?: unknown,
  code?: string
) {
  return NextResponse.json(
    {
      success: false,
      error,
      code: code || null,
      details: details ?? null,
    },
    { status }
  );
}

export function parseSportsPageLimit(request: Request): {
  page: number;
  limit: number;
  from: number;
  to: number;
} {
  const url = new URL(request.url);
  const page = Math.max(
    1,
    parsePositiveInt(url.searchParams.get("page"), 1, 10_000)
  );
  const limit = Math.min(
    SPORTS_MAX_PAGE_LIMIT,
    Math.max(
      1,
      parsePositiveInt(
        url.searchParams.get("limit"),
        SPORTS_DEFAULT_PAGE_LIMIT,
        SPORTS_MAX_PAGE_LIMIT
      )
    )
  );
  const from = (page - 1) * limit;
  const to = from + limit; // one extra for hasMore
  return { page, limit, from, to };
}

export function parseSportsPlatform(
  request: Request,
  bodyPlatform?: unknown
): SportsPlatform {
  const header = String(
    request.headers.get("x-ht-platform") ||
      request.headers.get("x-client-platform") ||
      ""
  )
    .trim()
    .toLowerCase();
  const fromBody = String(bodyPlatform || "").trim().toLowerCase();
  const candidate = fromBody || header;
  if ((SPORTS_PLATFORMS as readonly string[]).includes(candidate)) {
    return candidate as SportsPlatform;
  }
  return "web";
}

export function parseSportsCountry(
  request: Request,
  bodyCountry?: unknown,
  preferredCountry?: string | null
): string {
  const fromBody = String(bodyCountry || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(fromBody)) return fromBody;

  const url = new URL(request.url);
  const fromQuery = String(url.searchParams.get("country") || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(fromQuery)) return fromQuery;

  const preferred = String(preferredCountry || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(preferred)) return preferred;

  const storefront = String(
    request.headers.get("x-ht-storefront-country") || ""
  )
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(storefront)) return storefront;

  const cf = String(request.headers.get("cf-ipcountry") || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(cf) && cf !== "XX" && cf !== "T1") return cf;

  return SPORTS_SAFE_FALLBACK_COUNTRY;
}

export function cleanSportsText(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function redactSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^(https?:\/\/|rtmp:\/\/|data:)/i.test(value) && value.length > 40) {
      return "[REDACTED_URL]";
    }
    if (/bearer\s+/i.test(value) || /api[_-]?key/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        /url|token|secret|password|license|manifest|source_url|encrypted/i.test(k)
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}
