export const RADIO_RELAY_TOKEN_TTL_SEC = 120;
export const RADIO_RELAY_MAX_REDIRECTS = 3;
export const RADIO_RELAY_CONNECT_TIMEOUT_MS = 12_000;
export const RADIO_RELAY_IDLE_TIMEOUT_MS = 45_000;
export const RADIO_RELAY_MAX_CONCURRENT_PER_STATION = 8;
export const RADIO_RELAY_MAX_CONCURRENT_PER_CLIENT = 4;
export const RADIO_RELAY_USER_AGENT =
  "HiddenTunesRadioRelay/1.0 (+https://admin.hiddentunes.com; catalog-approved stream proxy)";

export function getRadioRelayPublicBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.RADIO_RELAY_PUBLIC_BASE_URL ||
    "https://admin.hiddentunes.com";
  return String(raw).trim().replace(/\/+$/, "") || "https://admin.hiddentunes.com";
}

export function getRadioRelaySigningSecret() {
  const dedicated = String(process.env.RADIO_STREAM_RELAY_SECRET || "").trim();
  if (dedicated.length >= 16) return dedicated;
  const fallback = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (fallback.length >= 16) return `radio-relay:${fallback}`;
  return "";
}
