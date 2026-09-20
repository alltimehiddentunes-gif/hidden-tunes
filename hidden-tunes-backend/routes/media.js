import express from "express";
import {
  loadJunction2Config,
  isJunction2PlaybackActive,
  isOwnerCanarySource,
  rolloutKeyFromRequest,
} from "../services/junction2/config.js";
import { getMediaBridgeClient } from "../services/junction2/client.js";
import { playbackStore } from "../services/junction2/playbackStore.js";
import { publicPlaybackError, sanitizeStreamHeaders, containsPublicLeak } from "../services/junction2/leak.js";
import { publicApiBaseUrl } from "../services/junction2/publicOrigin.js";
import { recordMetric } from "../services/junction2/metrics.js";
import { markUnplayable } from "../services/junction2/playability.js";
import {
  resolveBridgeMediaId,
  beginUserPlay,
  endUserPlay,
} from "../services/junction2/prewarm.js";
import {
  onTrackStarted,
  getPreparationState,
  preparePlayerQueueWindow,
  prepare,
  PRIORITY,
} from "../services/junction2/preparation.js";

function abortFrom(res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

function sendPublicError(res, status = 503) {
  if (res.headersSent) {
    res.end();
    return;
  }
  return res.status(status).json(publicPlaybackError());
}

export function createMediaRouter(deps = {}) {
  const router = express.Router();

  const handler = async (req, res, method) => {
    const config = deps.config || loadJunction2Config();
    const record = (deps.store || playbackStore).get(req.params.playbackId);
    const rolloutKey = deps.rolloutKey || rolloutKeyFromRequest(req);
    if (!isJunction2PlaybackActive(config, record, rolloutKey)) {
      return sendPublicError(res, 404);
    }

    if (!record) return sendPublicError(res, 404);

    const signal = abortFrom(res);
    const client = deps.client || getMediaBridgeClient(config);
    const store = deps.store || playbackStore;
    const started = Date.now();
    const marks = { storeMs: 0, ingestMs: 0, streamMs: 0, firstByteMs: 0 };
    recordMetric("playbackResolve", { method, ranged: Boolean(req.headers.range) });

    if (isOwnerCanarySource(record, config)) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_playback",
          method,
          ranged: Boolean(req.headers.range),
        }),
      );
    }

    try {
      const tStore = Date.now();
      const prepBefore = getPreparationState(record);
      let bridgeMediaId = record.bridgeMediaId || prepBefore?.bridgeMediaId || null;
      marks.storeMs = Date.now() - tStore;

      const readyBeforeRequest = Boolean(
        bridgeMediaId || prepBefore?.state === "READY" || prepBefore?.state === "RESOLVING",
      );
      if (readyBeforeRequest) recordMetric("readyBeforeRequest", { method });
      else recordMetric("readyBeforeRequestMiss", { method });

      if (!bridgeMediaId) {
        if (!record.provider || !record.sourceId) return sendPublicError(res, 404);
        const tIngest = Date.now();
        beginUserPlay();
        try {
          // Promote to P0: join/upgrade in-flight SEARCH_TOP prep; never duplicate yt-dlp.
          prepare(record, {
            priority: PRIORITY.P0_USER,
            client,
            store,
            timeoutMs: Math.min(
              Number(config.playbackTimeoutMs) || 45_000,
              Number.parseInt(String(process.env.J2_COLD_RESOLVE_TIMEOUT_MS || "12000"), 10) || 12_000,
            ),
          });
          // Bound cold resolve so the player is not left hanging 20s+.
          const coldBudgetMs = Math.min(
            Number(config.playbackTimeoutMs) || 45_000,
            Number.parseInt(String(process.env.J2_COLD_RESOLVE_TIMEOUT_MS || "12000"), 10) || 12_000,
          );
          bridgeMediaId = await (deps.resolveBridgeMediaId || resolveBridgeMediaId)(
            record,
            client,
            store,
            {
              publicPlaybackId: record.publicPlaybackId,
              signal,
              timeoutMs: coldBudgetMs,
              priority: "user",
            },
          );
        } finally {
          endUserPlay();
        }
        marks.ingestMs = Date.now() - tIngest;
      }

      // While current track streams, prepare NEXT / NEXT+1 from search session window.
      if (method === "GET") {
        try {
          onTrackStarted(record, client, store, config);
        } catch {
          /* isolated */
        }
      }

      const tStream = Date.now();
      // Many media CDNs reject HEAD; probe with a 1-byte ranged GET and discard the body.
      const upstreamMethod = method === "HEAD" ? "GET" : method;
      const upstreamRange = method === "HEAD" ? (req.headers.range || "bytes=0-0") : req.headers.range;
      const upstream = await client.stream(bridgeMediaId, {
        method: upstreamMethod,
        range: upstreamRange,
        signal,
      });
      marks.streamMs = Date.now() - tStream;

      if (upstream.status >= 300 && upstream.status < 400) {
        recordMetric("playbackFailure", { reason: "redirect", durationMs: Date.now() - started });
        return sendPublicError(res, 503);
      }
      if (upstream.status >= 400) {
        recordMetric("playbackFailure", { reason: "upstream", status: upstream.status, durationMs: Date.now() - started });
        if (upstream.body?.cancel) {
          try {
            await upstream.body.cancel();
          } catch {
            /* ignore */
          }
        }
        return sendPublicError(res, 503);
      }

      const headers = sanitizeStreamHeaders(upstream.headers);
      if (containsPublicLeak(headers, publicApiBaseUrl(req, config))) {
        recordMetric("playbackFailure", { reason: "leak", durationMs: Date.now() - started });
        return sendPublicError(res, 503);
      }

      res.status(upstream.status);
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
      }
      if (!res.getHeader("Accept-Ranges")) res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, no-store");
      marks.firstByteMs = Date.now() - started;

      if (method === "HEAD") {
        if (upstream.body?.cancel) {
          try {
            await upstream.body.cancel();
          } catch {
            /* ignore */
          }
        }
        recordMetric("playbackSuccess", { method, durationMs: marks.firstByteMs, ...marks, cache: Boolean(record.bridgeMediaId) });
        console.log(JSON.stringify({ event: "j2_playback_timing", method, ...marks, cacheHit: Boolean(record.bridgeMediaId && marks.ingestMs === 0) }));
        res.end();
        return;
      }
      if (!upstream.body) {
        recordMetric("playbackSuccess", { method, durationMs: marks.firstByteMs, ...marks });
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      let logged = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!logged) {
          marks.firstByteMs = Date.now() - started;
          logged = true;
          console.log(
            JSON.stringify({
              event: "j2_playback_timing",
              method,
              ...marks,
              cacheHit: Boolean(marks.ingestMs === 0),
            }),
          );
        }
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once("drain", () => resolve()));
        }
      }
      recordMetric("playbackSuccess", { method, durationMs: Date.now() - started, ...marks });
      res.end();
    } catch (err) {
      if (record?.canonicalSourceKey || (record?.provider && record?.sourceId)) {
        const code = String(err?.code || "");
        if (code === "BRIDGE_HTTP" || code === "UNAUTHORIZED" || code === "MALFORMED") {
          markUnplayable(record, code || "PLAYBACK_FAILURE");
        }
      }
      recordMetric("playbackFailure", { durationMs: Date.now() - started });
      return sendPublicError(res, 503);
    }
  };

  router.post("/prepare", (req, res) => {
    const config = deps.config || loadJunction2Config();
    const store = deps.store || playbackStore;
    const client = deps.client || getMediaBridgeClient(config);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const current = String(body.current || "").trim();
    const next = Array.isArray(body.next) ? body.next : [];
    // Opaque IDs only — never accept provider/source payloads from clients.
    const safeNext = next
      .map((id) => String(id || "").trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 2);
    const safeCurrent = /^[0-9a-f-]{36}$/i.test(current) ? current : "";

    const result = preparePlayerQueueWindow(
      { current: safeCurrent, next: safeNext },
      client,
      store,
      config,
      {
        currentDurationMs: Number(body.currentDurationMs) || 0,
        queryFold: "player-queue",
      },
    );

    // Non-blocking: acknowledge immediately; work continues async.
    return res.status(202).json({
      ok: true,
      scheduled: result.scheduled,
      missing: result.missing?.length || 0,
    });
  });

  router.get("/:playbackId", (req, res) => {
    const method = String(req.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET";
    return void handler(req, res, method);
  });
  return router;
}

export default createMediaRouter();
