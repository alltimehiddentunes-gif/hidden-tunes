import { validatePublicRadioStreamUrl } from "@/lib/radioStreamVerification";

import { buildRadioRelayStreamUrl } from "./tokens";
import { assertRelayUpstreamUrlSafe } from "./ssrf";

export type RadioPlayResolution =
  | {
      kind: "direct_https";
      streamUrl: string;
    }
  | {
      kind: "relay_http";
      streamUrl: string;
      upstreamUrl: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };

/**
 * Resolution priority for /play:
 * 1) Healthy HTTPS stream URL (direct)
 * 2) Signed HTTPS relay URL for eligible HTTP-only catalog streams
 * 3) Unavailable
 */
export async function resolveRadioPlayStreamUrl(options: {
  stationId: string;
  streamUrl: string | null | undefined;
}): Promise<RadioPlayResolution> {
  const validation = validatePublicRadioStreamUrl(options.streamUrl);
  if (!validation.ok) {
    return { kind: "unavailable", reason: validation.reason || "invalid_url" };
  }

  const url = validation.url;
  if (url.startsWith("https://")) {
    return { kind: "direct_https", streamUrl: url };
  }

  if (!url.startsWith("http://")) {
    return { kind: "unavailable", reason: "unsupported_protocol" };
  }

  try {
    await assertRelayUpstreamUrlSafe(url, { allowHttps: false });
  } catch {
    return { kind: "unavailable", reason: "upstream_blocked" };
  }

  try {
    const relayUrl = buildRadioRelayStreamUrl(options.stationId);
    return { kind: "relay_http", streamUrl: relayUrl, upstreamUrl: url };
  } catch {
    return { kind: "unavailable", reason: "relay_unavailable" };
  }
}
