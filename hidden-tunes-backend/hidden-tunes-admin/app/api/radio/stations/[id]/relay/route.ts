import { NextRequest } from "next/server";

import {
  RADIO_PLAY_STATION_SELECT,
  isPublicRadioRow,
  jsonRadioError,
} from "@/lib/radioPublicCatalog";
import {
  isPublicMatureRadioRow,
  parseMatureRadioAccess,
} from "@/lib/radioMature/platformPolicy";
import {
  RADIO_RELAY_MAX_CONCURRENT_PER_CLIENT,
  RADIO_RELAY_MAX_CONCURRENT_PER_STATION,
} from "@/lib/radioRelay/constants";
import { tryAcquireRadioRelaySlot } from "@/lib/radioRelay/limits";
import {
  buildRelayResponseHeaders,
  openApprovedRadioUpstream,
} from "@/lib/radioRelay/streamProxy";
import { verifyRadioRelayToken } from "@/lib/radioRelay/tokens";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientKeyFromRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function logRelayEvent(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown>
) {
  const payload = {
    scope: "radio_relay",
    event,
    ...details,
  };
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const stationId = String(id || "").trim();
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();

  if (!stationId || !token) {
    return jsonRadioError("Radio relay token is required.", 400);
  }

  const verified = verifyRadioRelayToken(token, stationId);
  if (!verified.ok) {
    return jsonRadioError("Radio relay link is invalid or expired.", 403);
  }

  const { data, error } = await supabaseAdmin
    .from("radio_stations")
    .select(RADIO_PLAY_STATION_SELECT)
    .eq("id", stationId)
    .maybeSingle();

  if (error || !data) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  if (data.is_mature === true) {
    if (!parseMatureRadioAccess(request) || !isPublicMatureRadioRow(data as Record<string, unknown>)) {
      return jsonRadioError("Mature radio playback requires age confirmation.", 403);
    }
  } else if (!isPublicRadioRow(data as Record<string, unknown>)) {
    return jsonRadioError("Radio station not found or not currently playable.", 404);
  }

  const upstreamUrl = String(data.stream_url || "").trim();
  if (!upstreamUrl.startsWith("http://")) {
    return jsonRadioError("Radio relay is only available for HTTP streams.", 400);
  }

  const slot = tryAcquireRadioRelaySlot({
    stationId,
    clientKey: clientKeyFromRequest(request),
    maxPerStation: RADIO_RELAY_MAX_CONCURRENT_PER_STATION,
    maxPerClient: RADIO_RELAY_MAX_CONCURRENT_PER_CLIENT,
  });

  if (!slot) {
    return jsonRadioError("Radio relay is busy. Try again shortly.", 429);
  }

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal.addEventListener("abort", onClientAbort);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    slot.release();
    request.signal.removeEventListener("abort", onClientAbort);
  };

  try {
    const opened = await openApprovedRadioUpstream({
      upstreamUrl,
      requestHeaders: request.headers,
      signal: abort.signal,
    });

    logRelayEvent("info", "relay_open", {
      stationId,
      status: opened.response.status,
      contentType: opened.contentType,
    });

    abort.signal.addEventListener("abort", release, { once: true });

    return new Response(opened.body, {
      status: 200,
      headers: buildRelayResponseHeaders(opened.response.headers, opened.contentType),
    });
  } catch (error) {
    release();
    const reason = error instanceof Error ? error.message : "relay_failed";
    logRelayEvent("warn", "relay_failed", { stationId, reason });

    if (reason === "http_hls_unsupported") {
      return jsonRadioError("This HTTP HLS stream cannot be relayed.", 415);
    }
    if (String(reason).includes("abort")) {
      return new Response(null, { status: 499 });
    }
    return jsonRadioError("Radio station is not currently playable.", 502);
  }
}
