import { isHostAllowedForProvider } from "../../playback/allowlist";
import { classifyServer, parseHeaders } from "./normalize";
import type { FootballStreamServer } from "./types";

export type SourceHealthState = "HEALTHY" | "EXPIRED" | "HEADER_REQUIRED" | "GEO_BLOCKED" | "DEAD" | "INVALID" | "UNSUPPORTED";
export type SourceHealthResult = { state: SourceHealthState; status: number; latencyMs: number; host: string | null; protocol: string };

export async function validateFootballStreamSource(server: FootballStreamServer, fetcher: typeof fetch = fetch): Promise<SourceHealthResult> {
  const started = Date.now(), protocol = classifyServer(server); let host: string | null = null;
  try {
    if (!server.url) throw new Error("missing_url");
    const parsed = new URL(server.url);
    host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !isHostAllowedForProvider("football_stream_api", host)) return { state: "UNSUPPORTED", status: 0, latencyMs: 0, host, protocol };
    const supplied = parseHeaders(server.header);
    const response = await fetcher(parsed, { method: "GET", headers: { ...supplied, "user-agent": supplied["User-Agent"] || supplied["user-agent"] || "Mozilla/5.0 HiddenTunesSports/1.0", range: "bytes=0-65535" }, redirect: "error", signal: AbortSignal.timeout(8_000) });
    const body = (await response.text()).slice(0, 65_536), contentType = response.headers.get("content-type") || "";
    const manifest = body.trimStart().startsWith("#EXTM3U") || /mpegurl/i.test(contentType);
    let state: SourceHealthState = "DEAD";
    if (response.status === 401 || response.status === 403) state = Object.keys(supplied).length ? "GEO_BLOCKED" : "HEADER_REQUIRED";
    else if (response.status === 404 || response.status === 410) state = "EXPIRED";
    else if (response.ok && protocol === "direct_hls" && manifest) {
      const mediaLine = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
      if (!mediaLine) state = "INVALID";
      else {
        const mediaUrl = new URL(mediaLine, parsed);
        if (mediaUrl.protocol !== "https:" || !isHostAllowedForProvider("football_stream_api", mediaUrl.hostname)) state = "UNSUPPORTED";
        else {
          const media = await fetcher(mediaUrl, { headers: { ...supplied, "user-agent": supplied["User-Agent"] || supplied["user-agent"] || "Mozilla/5.0 HiddenTunesSports/1.0", range: "bytes=0-4095" }, redirect: "error", signal: AbortSignal.timeout(8_000) });
          const reader = media.body?.getReader(); const first = reader ? await reader.read() : { value: undefined }; await reader?.cancel();
          state = media.ok && Boolean(first.value?.byteLength) ? "HEALTHY" : "DEAD";
        }
      }
    }
    else if (response.ok && protocol !== "direct_hls") state = "HEALTHY";
    else if (response.ok) state = "INVALID";
    return { state, status: response.status, latencyMs: Date.now() - started, host, protocol };
  } catch { return { state: "DEAD", status: 0, latencyMs: Date.now() - started, host, protocol }; }
}
