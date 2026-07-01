const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

function stripIpv6Brackets(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function parseIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isPrivateIpv4(hostname: string) {
  const parts = parseIpv4(hostname);
  if (!parts) return false;

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function isPrivateIpv6(hostname: string) {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  return false;
}

export function isBlockedHostname(hostname: string) {
  const normalized = stripIpv6Brackets(hostname).trim().toLowerCase();
  if (!normalized) return true;
  if (LOCAL_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith(".local")) return true;
  if (normalized.includes(":")) return isPrivateIpv6(normalized);
  return isPrivateIpv4(normalized);
}

export function validateSafeHttpUrl(value: unknown, maxLength = 2000) {
  const raw = String(value || "").trim().slice(0, maxLength);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  if (isBlockedHostname(url.hostname)) {
    return null;
  }

  return url.toString();
}

export function validateSafeHttpsMediaUrl(value: unknown, maxLength = 2000) {
  const safeUrl = validateSafeHttpUrl(value, maxLength);
  if (!safeUrl) return null;

  try {
    const url = new URL(safeUrl);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isHttpsMediaUrl(value: unknown) {
  return Boolean(validateSafeHttpsMediaUrl(value));
}
