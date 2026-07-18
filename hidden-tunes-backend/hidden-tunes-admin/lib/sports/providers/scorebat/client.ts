/**
 * ScoreBat Video API client — server-side only.
 * Never logs the API token.
 */

import {
  getScoreBatRuntimeConfig,
  hasScoreBatToken,
  SCOREBAT_API_BASE,
  type ScoreBatRuntimeConfig,
} from "./config";
import { SCOREBAT_FIXTURE_MATCHES } from "./fixtures";
import type { ScoreBatFeedResponse, ScoreBatMatch } from "./types";

export type ScoreBatDiscoverResult = {
  supported: boolean;
  source: "live" | "fixtures" | "none";
  endpoint: string;
  items: ScoreBatMatch[];
  durationMs: number;
  error?: string;
  token: "present" | "absent";
};

async function fetchFeed(
  path: string,
  token: string,
  timeoutMs: number
): Promise<{ items: ScoreBatMatch[]; status: number }> {
  const url = new URL(`${SCOREBAT_API_BASE}${path}`);
  url.searchParams.set("token", token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { items: [], status: res.status };
    }
    const json = (await res.json()) as ScoreBatFeedResponse;
    const items = Array.isArray(json.response) ? json.response : [];
    return { items, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded discovery. Prefer live-streams when token present;
 * fall back to free-feed; fixtures when requested / no token.
 */
export async function discoverScoreBatMatches(input: {
  useFixtures?: boolean;
  maxItems?: number;
  timeoutMs?: number;
  /** When true, attempt live API (requires token + discovery enabled). */
  allowLive?: boolean;
  config?: Partial<ScoreBatRuntimeConfig>;
}): Promise<ScoreBatDiscoverResult> {
  const started = Date.now();
  const cfg = getScoreBatRuntimeConfig(input.config);
  const maxItems = input.maxItems ?? cfg.maxItems;
  const timeoutMs = input.timeoutMs ?? cfg.timeoutMs;
  const useFixtures = input.useFixtures ?? cfg.useFixtures;
  const tokenPresent = hasScoreBatToken();

  if (useFixtures || !tokenPresent) {
    return {
      supported: true,
      source: "fixtures",
      endpoint: "fixtures",
      items: SCOREBAT_FIXTURE_MATCHES.slice(0, maxItems),
      durationMs: Date.now() - started,
      token: tokenPresent ? "present" : "absent",
    };
  }

  if (!cfg.discoveryEnabled || cfg.killSwitch || !cfg.enabled) {
    return {
      supported: false,
      source: "none",
      endpoint: "disabled",
      items: [],
      durationMs: Date.now() - started,
      error: "discovery_disabled",
      token: "present",
    };
  }

  if (!input.allowLive) {
    return {
      supported: true,
      source: "fixtures",
      endpoint: "fixtures-gated",
      items: SCOREBAT_FIXTURE_MATCHES.slice(0, maxItems),
      durationMs: Date.now() - started,
      token: "present",
    };
  }

  const token = String(process.env.SCOREBAT_API_TOKEN || "").trim();

  try {
    // Prefer live-streams; on failure try free-feed (may be all free accounts have).
    let endpoint = "/live-streams/";
    let result = await fetchFeed(endpoint, token, timeoutMs);
    if (result.status === 401 || result.status === 403 || result.items.length === 0) {
      endpoint = "/free-feed/";
      result = await fetchFeed(endpoint, token, timeoutMs);
    }
    if (result.status >= 400) {
      return {
        supported: false,
        source: "none",
        endpoint,
        items: [],
        durationMs: Date.now() - started,
        error: `http_${result.status}`,
        token: "present",
      };
    }
    return {
      supported: true,
      source: "live",
      endpoint,
      items: result.items.slice(0, maxItems),
      durationMs: Date.now() - started,
      token: "present",
    };
  } catch (err) {
    return {
      supported: false,
      source: "none",
      endpoint: "error",
      items: [],
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      token: "present",
    };
  }
}
