import { markUnplayable } from "./playability.js";

function sniffKind(bytes) {
  if (!bytes || !bytes.length) return "EMPTY";
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b[0] === 0x7b || b[0] === 0x5b) return "JSON";
  const head = b.subarray(0, Math.min(b.length, 16)).toString("utf8").trimStart();
  if (head.startsWith("<")) return "HTML";
  if (b.subarray(0, 7).toString("utf8") === "#EXTM3U") return "HLS";
  if (b.length >= 3 && b.subarray(0, 3).toString("ascii") === "ID3") return "MP3";
  if (b.length >= 2 && b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2)) return "MP3";
  if (b.length >= 8 && b.subarray(4, 8).toString("ascii") === "ftyp") return "MP4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "WEBM";
  return "OTHER";
}

/**
 * Prove Bridge can deliver phone-compatible progressive audio before surfacing as playable.
 * Returns bridgeMediaId on success, null on failure (and marks unplayable).
 */
export async function verifyPlayerCompatibleHit(hit, client, options = {}) {
  if (!hit?.provider || !hit?.sourceId || !client) return null;
  const timeoutMs = Math.max(1_500, Number(options.timeoutMs) || 8_000);
  const signal = options.signal;
  try {
    const bridgeMediaId = await client.ingest(
      { provider: hit.provider, sourceId: hit.sourceId },
      { signal, timeoutMs, priority: "user" },
    );
    if (!bridgeMediaId) {
      markUnplayable(hit, "VERIFY_NO_ID", 60 * 60 * 1000);
      return null;
    }
    const upstream = await client.stream(bridgeMediaId, {
      method: "GET",
      range: "bytes=0-255",
      signal,
      timeoutMs: Math.min(timeoutMs, 10_000),
    });
    if (!upstream || upstream.status >= 400) {
      markUnplayable(hit, `VERIFY_HTTP_${upstream?.status || "NA"}`, 60 * 60 * 1000);
      if (upstream?.body?.cancel) {
        try {
          await upstream.body.cancel();
        } catch {
          /* ignore */
        }
      }
      return null;
    }
    const ctype = String(upstream.headers?.get?.("content-type") || "").toLowerCase();
    const reader = upstream.body?.getReader?.();
    let first = Buffer.alloc(0);
    if (reader) {
      const { value } = await reader.read();
      if (value) first = Buffer.from(value);
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    const kind = sniffKind(first);
    const audioOk = ctype.startsWith("audio/") && (kind === "MP3" || kind === "MP4");
    if (!audioOk) {
      markUnplayable(hit, `VERIFY_${kind || "BAD"}`, 6 * 60 * 60 * 1000);
      return null;
    }
    return String(bridgeMediaId);
  } catch (err) {
    const code = String(err?.code || err?.message || "VERIFY_FAILED").slice(0, 80);
    markUnplayable(hit, code, 60 * 60 * 1000);
    return null;
  }
}
