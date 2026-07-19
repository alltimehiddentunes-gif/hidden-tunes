import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIpv4(ip: string) {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  const ranges: Array<[number, number]> = [
    [ipv4ToInt("0.0.0.0")!, ipv4ToInt("0.255.255.255")!],
    [ipv4ToInt("10.0.0.0")!, ipv4ToInt("10.255.255.255")!],
    [ipv4ToInt("100.64.0.0")!, ipv4ToInt("100.127.255.255")!],
    [ipv4ToInt("127.0.0.0")!, ipv4ToInt("127.255.255.255")!],
    [ipv4ToInt("169.254.0.0")!, ipv4ToInt("169.254.255.255")!],
    [ipv4ToInt("172.16.0.0")!, ipv4ToInt("172.31.255.255")!],
    [ipv4ToInt("192.0.0.0")!, ipv4ToInt("192.0.0.255")!],
    [ipv4ToInt("192.168.0.0")!, ipv4ToInt("192.168.255.255")!],
    [ipv4ToInt("198.18.0.0")!, ipv4ToInt("198.19.255.255")!],
    [ipv4ToInt("224.0.0.0")!, ipv4ToInt("255.255.255.255")!],
  ];
  return ranges.some(([start, end]) => value >= start && value <= end);
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

export function isBlockedRelayHostname(hostname: string) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

export async function assertRelayUpstreamUrlSafe(rawUrl: string, options?: { allowHttps?: boolean }) {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("invalid_upstream_url");
  }

  const allowHttps = options?.allowHttps === true;
  if (parsed.protocol === "https:") {
    if (!allowHttps) throw new Error("https_upstream_not_for_relay");
  } else if (parsed.protocol !== "http:") {
    throw new Error("unsupported_upstream_protocol");
  }

  if (parsed.username || parsed.password) {
    throw new Error("upstream_credentials_forbidden");
  }

  if (isBlockedRelayHostname(parsed.hostname)) {
    throw new Error("upstream_host_blocked");
  }

  const ipVersion = isIP(parsed.hostname);
  if (!ipVersion) {
    let records: Array<{ address: string; family: number }> = [];
    try {
      records = await lookup(parsed.hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("upstream_dns_failed");
    }
    if (!records.length) throw new Error("upstream_dns_empty");
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        throw new Error("upstream_resolves_private");
      }
      if (record.family === 6 && isPrivateIpv6(record.address)) {
        throw new Error("upstream_resolves_private");
      }
    }
  }

  return parsed;
}
