/**
 * Fire-and-forget opaque queue signaling ONLY.
 *
 * Sends CURRENT / NEXT / NEXT+1 opaque /api/media IDs to the backend so
 * resolution, cache, and auto-next preparation run server-side.
 *
 * Does NOT download, resolve, extract, or prebuffer media on device.
 * Future-track audio bytes must remain 0 until that track becomes current.
 */

import { HIDDEN_TUNES_API_BASE_URL } from "./hiddenTunesApi";

const PREPARE_URL = `${HIDDEN_TUNES_API_BASE_URL}/api/media/prepare`;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let lastSignature = "";
let lastSentAt = 0;
const MIN_RESEND_MS = 2_000;

export function extractOpaqueMediaId(songOrUrl: unknown): string | null {
  if (!songOrUrl) return null;
  if (typeof songOrUrl === "string") {
    const fromPath = songOrUrl.match(/\/api\/media\/([0-9a-f-]{36})/i);
    if (fromPath?.[1] && UUID_RE.test(fromPath[1])) return fromPath[1];
    if (UUID_RE.test(songOrUrl.trim())) return songOrUrl.trim();
    return null;
  }
  if (typeof songOrUrl === "object") {
    const song = songOrUrl as Record<string, unknown>;
    const uri = String(
      song.streamUrl || song.url || song.audioUrl || song.audio_url || "",
    );
    const fromUri = extractOpaqueMediaId(uri);
    if (fromUri) return fromUri;
    const id = String(song.id || "").trim();
    if (UUID_RE.test(id)) return id;
  }
  return null;
}

/**
 * Non-blocking. Never await in playback critical path.
 */
export function preparePlayerQueueWindow(options: {
  current?: unknown;
  next?: unknown[];
  currentDurationMs?: number;
}): void {
  try {
    const current = extractOpaqueMediaId(options.current);
    const next = (Array.isArray(options.next) ? options.next : [])
      .map((item) => extractOpaqueMediaId(item))
      .filter((id): id is string => Boolean(id))
      .filter((id) => id !== current)
      .slice(0, 2);

    if (!current && next.length === 0) return;

    const signature = `${current || ""}|${next.join(",")}`;
    const now = Date.now();
    if (signature === lastSignature && now - lastSentAt < MIN_RESEND_MS) return;
    lastSignature = signature;
    lastSentAt = now;

    const body = JSON.stringify({
      current: current || undefined,
      next,
      currentDurationMs: Number(options.currentDurationMs) || 0,
    });

    // Fire-and-forget — do not block UI/playback on prepare.
    void fetch(PREPARE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    }).catch(() => {
      /* isolated */
    });
  } catch {
    /* isolated */
  }
}

/**
 * From a queue + index, prepare current / next / next+1.
 */
export function prepareFromQueueState(
  queue: unknown[],
  index: number,
  currentDurationMs?: number,
): void {
  if (!Array.isArray(queue) || queue.length === 0) return;
  const safeIndex = Math.max(0, Math.min(index, queue.length - 1));
  const current = queue[safeIndex];
  const next = [queue[safeIndex + 1], queue[safeIndex + 2]].filter(Boolean);
  preparePlayerQueueWindow({ current, next, currentDurationMs });
}
