import { createHash } from "node:crypto";
import type { ResolvedTvPlayback, TvValidationState } from "../types";

export interface PlutoContentValidation {
  state: TvValidationState;
  correctChannel: boolean;
  manifestPlayable: boolean;
  mediaSequence: number | null;
  sampledSegments: number;
  distinctSegmentHashes: number;
  advancing: boolean;
  reasons: string[];
}

function allowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (host.endsWith(".pluto.tv") || host.endsWith(".plutotv.net"));
}

async function getText(url: string): Promise<{ text: string; finalUrl: string; status: number }> {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  return { text: await response.text(), finalUrl: response.url, status: response.status };
}

function classifyHttp(status: number, body: string): TvValidationState | null {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403 && /geo|region|territory|country/i.test(body)) return "GEO_BLOCKED";
  if (status === 403) return "SESSION_EXPIRED";
  if (status === 404 || status === 410 || status >= 500) return "DEAD";
  if (status >= 400) return "UNKNOWN";
  return null;
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function mediaSequence(text: string): number | null {
  const match = text.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/m);
  return match ? Number(match[1]) : null;
}

function childUris(text: string): string[] {
  return lines(text).filter((line) => !line.startsWith("#"));
}

function resolveAllowed(base: string, child: string): string {
  const value = new URL(child, base);
  if (!allowed(value)) throw new Error(`Manifest escaped the official Pluto host boundary: ${value.hostname}`);
  return value.toString();
}

async function loadMediaPlaylist(source: string): Promise<{ url: string; text: string; status: number }> {
  const master = await getText(source);
  const failure = classifyHttp(master.status, master.text);
  if (failure) throw new Error(`${failure}:${master.status}`);
  if (!master.text.startsWith("#EXTM3U")) throw new Error("DEAD:not_hls");
  const uris = childUris(master.text);
  if (!master.text.includes("#EXT-X-STREAM-INF")) return { url: master.finalUrl, text: master.text, status: master.status };
  const variant = uris.at(-1);
  if (!variant) throw new Error("DEAD:no_variant");
  const variantUrl = resolveAllowed(master.finalUrl, variant);
  const media = await getText(variantUrl);
  return { url: media.finalUrl, text: media.text, status: media.status };
}

async function hashSegments(playlistUrl: string, playlist: string, limit = 4): Promise<string[]> {
  const segmentUrls = childUris(playlist).slice(-limit);
  const hashes: string[] = [];
  for (const child of segmentUrls) {
    const url = resolveAllowed(playlistUrl, child);
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) continue;
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }
  return hashes;
}

function failureState(error: unknown): TvValidationState {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = message.split(":", 1)[0] as TvValidationState;
  return ["GEO_BLOCKED", "AUTH_REQUIRED", "SESSION_EXPIRED", "DEAD"].includes(prefix) ? prefix : "UNKNOWN";
}

export async function validatePlutoActualContent(
  playback: ResolvedTvPlayback,
  options: { observationMs?: number } = {},
): Promise<PlutoContentValidation> {
  const reasons: string[] = [];
  try {
    const source = new URL(playback.source);
    const correctChannel = allowed(source) && source.pathname.includes(`/channel/${playback.providerChannelId}/`);
    if (!correctChannel) return { state: "WRONG_CHANNEL", correctChannel: false, manifestPlayable: false, mediaSequence: null, sampledSegments: 0, distinctSegmentHashes: 0, advancing: false, reasons: ["source path does not contain the canonical channel ID"] };
    const first = await loadMediaPlaylist(playback.source);
    const httpFailure = classifyHttp(first.status, first.text);
    if (httpFailure) throw new Error(`${httpFailure}:${first.status}`);
    const firstSequence = mediaSequence(first.text);
    const firstHashes = await hashSegments(first.url, first.text);
    const observationMs = Math.max(0, Math.min(options.observationMs ?? 0, 35_000));
    let secondSequence = firstSequence;
    let allHashes = firstHashes;
    if (observationMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, observationMs));
      const second = await loadMediaPlaylist(playback.source);
      secondSequence = mediaSequence(second.text);
      allHashes = firstHashes.concat(await hashSegments(second.url, second.text));
    }
    const distinct = new Set(allHashes).size;
    const advancing = firstSequence !== null && secondSequence !== null && secondSequence > firstSequence;
    if (!advancing && observationMs > 0) reasons.push("media sequence did not advance during observation");
    if (distinct < 2) reasons.push("segment sample lacks content diversity");
    // Advancing, diverse HLS segments prove transport activity only. Pluto's
    // animated idle/end slates also advance and change, so decoded programme
    // evidence is required before a caller may promote this to PLAYING_CONTENT.
    const transportHealthy = firstHashes.length > 0 && (observationMs === 0 || advancing) && distinct >= 2;
    if (transportHealthy) reasons.push("healthy changing HLS requires decoded actual-content verification");
    const state: TvValidationState = "UNKNOWN";
    return { state, correctChannel, manifestPlayable: true, mediaSequence: secondSequence, sampledSegments: allHashes.length, distinctSegmentHashes: distinct, advancing, reasons };
  } catch (error) {
    const state = failureState(error);
    reasons.push(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[redacted-url]") : String(error));
    return { state, correctChannel: false, manifestPlayable: false, mediaSequence: null, sampledSegments: 0, distinctSegmentHashes: 0, advancing: false, reasons };
  }
}
