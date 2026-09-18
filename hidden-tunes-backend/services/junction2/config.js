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

function parseQueryList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => foldCanaryQuery(item))
      .filter(Boolean)
  );
}

function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function foldCanaryQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveOwnerCanaryMode(env, enabled) {
  if (!enabled) return "off";
  const raw = String(env.J2_OWNER_CANARY_MODE || "").trim().toLowerCase();
  if (raw === "open" || raw === "queries" || raw === "off") return raw;
  // Back-compat: single query / source keys imply queries mode.
  if (String(env.J2_OWNER_CANARY_QUERY || "").trim() || String(env.J2_OWNER_CANARY_QUERIES || "").trim()) {
    return "queries";
  }
  if (String(env.J2_OWNER_CANARY_SOURCE_KEYS || "").trim()) return "queries";
  return "open";
}

export function loadJunction2Config(env = process.env) {
  const externalDiscoveryEnabled = envFlag(env, "EXTERNAL_DISCOVERY_ENABLED");
  const bridgePlaybackEnabled = envFlag(env, "BRIDGE_PLAYBACK_ENABLED");
  const baseUrl = String(env.MEDIA_BRIDGE_BASE_URL || "").trim().replace(/\/+$/, "");
  const secret = String(env.MEDIA_BRIDGE_J2_SECRET || "").trim();
  const production = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const ownerCanaryEnabled = envFlag(env, "J2_OWNER_CANARY_ENABLED");
  const ownerCanaryMode = resolveOwnerCanaryMode(env, ownerCanaryEnabled);
  const ownerCanaryQueries = parseQueryList(env.J2_OWNER_CANARY_QUERIES || "");
  const legacyQuery = foldCanaryQuery(env.J2_OWNER_CANARY_QUERY);
  if (legacyQuery) ownerCanaryQueries.add(legacyQuery);

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
    ownerCanaryEnabled,
    ownerCanaryMode,
    ownerCanaryQuery: legacyQuery,
    ownerCanaryQueries,
    ownerCanaryUpstreamQuery: String(env.J2_OWNER_CANARY_UPSTREAM_QUERY || "").trim(),
    ownerCanarySourceKeys: parseKeys(env.J2_OWNER_CANARY_SOURCE_KEYS || ""),
    workerRole: String(env.J2_WORKER_ROLE || "OWNER_CANARY_WORKER").trim() || "OWNER_CANARY_WORKER",
  };
}

export function isOwnerCanaryQuery(query, config = loadJunction2Config()) {
  if (!config.ownerCanaryEnabled || config.ownerCanaryMode === "off") return false;
  const folded = foldCanaryQuery(query);
  if (!folded) return false;
  if (config.ownerCanaryMode === "open") return true;
  return config.ownerCanaryQueries.has(folded);
}

export function isOwnerCanarySource(hitOrRecord, config = loadJunction2Config()) {
  if (!config.ownerCanaryEnabled || !hitOrRecord || config.ownerCanaryMode === "off") return false;
  if (hitOrRecord.policyState === "DENIED") return false;
  const key = String(hitOrRecord.canonicalSourceKey || "").trim().toLowerCase();
  const hasIdentity = Boolean(key || (hitOrRecord.provider && hitOrRecord.sourceId));
  if (!hasIdentity) return false;
  if (config.ownerCanaryMode === "open") return true;
  return Boolean(key && config.ownerCanarySourceKeys.has(key));
}

export function isJunction2SearchActive(config = loadJunction2Config(), query) {
  if (!config.ready) return false;
  if (config.externalDiscoveryEnabled) return true;
  return isOwnerCanaryQuery(query, config);
}

export function isJunction2PlaybackActive(config = loadJunction2Config(), record) {
  if (!config.ready) return false;
  if (config.bridgePlaybackEnabled) return true;
  return isOwnerCanarySource(record, config);
}
