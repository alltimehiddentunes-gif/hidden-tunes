export function publicApiBaseUrl(req, config = {}) {
  const configured = String(config.publicApiBaseUrl || process.env.PUBLIC_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const bridgeBase = String(config.baseUrl || "").trim();

  const candidate = configured || hostFromRequest(req);
  if (!candidate) return "";

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (config.production && parsed.protocol !== "https:") return "";

  if (bridgeBase) {
    try {
      const bridge = new URL(bridgeBase);
      if (parsed.hostname === bridge.hostname && String(parsed.port || "") === String(bridge.port || "")) {
        return "";
      }
    } catch {
      return "";
    }
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function hostFromRequest(req) {
  if (!req) return "";
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const proto = String(req.headers?.["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  if (proto !== "http" && proto !== "https") return "";
  return `${proto}://${host}`;
}
