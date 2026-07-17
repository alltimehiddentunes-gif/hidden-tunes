import { supabaseAdmin } from "@/lib/supabaseAdmin";

import {
  SPORTS_FEATURE_FLAG_DEFAULTS,
  type SportsFeatureFlagKey,
} from "./constants";

const flagCache = new Map<string, { value: boolean; expiresAt: number }>();
const FLAG_TTL_MS = 30_000;

export async function isSportsFeatureEnabled(
  key: SportsFeatureFlagKey
): Promise<boolean> {
  const cached = flagCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("sports_feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) {
      const fallback = SPORTS_FEATURE_FLAG_DEFAULTS[key];
      flagCache.set(key, { value: fallback, expiresAt: now + FLAG_TTL_MS });
      return fallback;
    }

    const value = Boolean(data.enabled);
    flagCache.set(key, { value, expiresAt: now + FLAG_TTL_MS });
    return value;
  } catch {
    return SPORTS_FEATURE_FLAG_DEFAULTS[key];
  }
}

export function clearSportsFeatureFlagCache() {
  flagCache.clear();
}

/** Env override for local tests without DB. */
export function isSportsFeatureEnabledSync(
  key: SportsFeatureFlagKey
): boolean {
  const envKey = `SPORTS_FF_${key.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;
  return SPORTS_FEATURE_FLAG_DEFAULTS[key];
}
