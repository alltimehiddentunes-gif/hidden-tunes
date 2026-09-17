function envFlag(env, name) {
  return String(env[name] || "").trim().toLowerCase() === "true";
}

function parseKeys(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadJunction2Config(env = process.env) {
  const externalDiscoveryEnabled = envFlag(env, "EXTERNAL_DISCOVERY_ENABLED");
  const bridgePlaybackEnabled = envFlag(env, "BRIDGE_PLAYBACK_ENABLED");
  const baseUrl = String(env.MEDIA_BRIDGE_BASE_URL || "").trim().replace(/\/+$/, "");
  const secret = String(env.MEDIA_BRIDGE_J2_SECRET || "").trim();
  const production = String(env.NODE_ENV || "").trim().toLowerCase() === "production";

  let parsedBase = null;
  try {
    parsedBase = baseUrl ? new URL(baseUrl) : null;
    if (parsedBase && parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
      parsedBase = null;
    }
  } catch {
    parsedBase = null;
  }

  return {
    externalDiscoveryEnabled,
    bridgePlaybackEnabled,
    baseUrl: parsedBase ? `${parsedBase.protocol}//${parsedBase.host}${parsedBase.pathname}`.replace(/\/+$/, "") : "",
    secret: parsedBase && secret.length >= 8 ? secret : "",
    ready: Boolean(parsedBase && secret.length >= 8),
    searchTimeoutMs: asPositiveInt(env.J2_SEARCH_TIMEOUT_MS, 1200),
    searchLimit: Math.min(asPositiveInt(env.J2_SEARCH_LIMIT, 5), 10),
    playbackTimeoutMs: asPositiveInt(env.J2_PLAYBACK_TIMEOUT_MS, 45_000),
    circuitOpenMs: asPositiveInt(env.J2_CIRCUIT_OPEN_MS, 30_000),
    circuitFailureThreshold: asPositiveInt(env.J2_CIRCUIT_FAILURES, 3),
    production,
    testFixtureEnabled: !production && envFlag(env, "J2_TEST_FIXTURE_ENABLED"),
    testFixtureKeys: parseKeys(env.J2_TEST_FIXTURE_KEYS || "archive.org:testmp3testfile"),
    publicApiBaseUrl: String(env.PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, ""),
  };
}

export function isJunction2SearchActive(config = loadJunction2Config()) {
  return config.externalDiscoveryEnabled && config.ready;
}

export function isJunction2PlaybackActive(config = loadJunction2Config()) {
  return config.bridgePlaybackEnabled && config.ready;
}
