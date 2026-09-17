const FORBIDDEN_KEYS = /^(extractor|extractorkey|gatewayurl|bridgeurl|upstreamurl|sourceurl|originalurl|resolvedurl|downloadurl|manifesturl|j1url|j2url|bridgemediaid|gatewayid|providerurl|canonicalsourcekey)$/i;

const FORBIDDEN_VALUE = [
  /googlevideo\.com/i,
  /youtube\.com/i,
  /youtu\.be/i,
  /soundcloud\.com/i,
  /tiktok\.com/i,
  /instagram\.com/i,
  /archive\.org\//i,
  /yt-dlp/i,
  /youtubeie/i,
  /mediaextractiongateway/i,
  /mediabridge/i,
  /junction\s*[12]/i,
  /\bextractor\b/i,
  /\bbridgeMediaId\b/,
  /\/j1\//i,
  /\/j2\//i,
  /127\.0\.0\.1:8787\b/,
  /127\.0\.0\.1:8788\b/,
  /localhost:8787\b/i,
  /localhost:8788\b/i,
];

const FORBIDDEN_HEADER = /^(server|via|x-powered-by|x-backend|x-served-by|x-cache|x-cache-hits|location|set-cookie|www-authenticate|cf-.+|x-amz-.+|x-gateway|x-bridge|x-request-id|x-amzn-.+)$/i;

function hostFromUrl(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

export function allowedPublicHosts(publicBaseUrl, extraHosts = []) {
  const hosts = new Set(
    extraHosts
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (publicBaseUrl) {
    const host = hostFromUrl(publicBaseUrl);
    if (host) hosts.add(host);
  }
  const r2 =
    process.env.PUBLIC_R2_BASE_URL ||
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_URL ||
    "";
  const r2Host = hostFromUrl(r2);
  if (r2Host) hosts.add(r2Host);
  hosts.add("images.unsplash.com");
  return hosts;
}

function isAllowedHttpUrl(value, allowedHosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return allowedHosts.has(url.host.toLowerCase());
  } catch {
    return false;
  }
}

export function findPublicLeak(value, allowedHosts, seen = new Set()) {
  if (value == null) return null;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && !isAllowedHttpUrl(value, allowedHosts)) {
      return "external_url";
    }
    if (FORBIDDEN_VALUE.some((re) => re.test(value))) return "forbidden_value";
    return null;
  }
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const leak = findPublicLeak(item, allowedHosts, seen);
      if (leak) return leak;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) return "forbidden_key";
    const leak = findPublicLeak(nested, allowedHosts, seen);
    if (leak) return leak;
  }
  return null;
}

export function containsPublicLeak(value, publicBaseUrl, extraHosts = []) {
  return Boolean(findPublicLeak(value, allowedPublicHosts(publicBaseUrl, extraHosts)));
}

export function sanitizeStreamHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const entries =
    typeof headers.entries === "function"
      ? headers.entries()
      : Object.entries(headers);
  for (const [name, value] of entries) {
    const key = String(name || "").toLowerCase();
    if (FORBIDDEN_HEADER.test(key)) continue;
    if (
      key === "content-type" ||
      key === "content-length" ||
      key === "content-range" ||
      key === "accept-ranges" ||
      key === "cache-control"
    ) {
      if (value) out[key] = String(value);
    }
  }
  return out;
}

export function publicPlaybackError() {
  return { error: "Playback temporarily unavailable" };
}

export function assertNoPublicLeak(value, publicBaseUrl, extraHosts = []) {
  if (containsPublicLeak(value, publicBaseUrl, extraHosts)) {
    throw new Error("public_contract_leak");
  }
}
