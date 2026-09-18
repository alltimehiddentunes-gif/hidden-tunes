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
    const started = Date.now();
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
      let bridgeMediaId = record.bridgeMediaId;
      if (!bridgeMediaId) {
        if (!record.provider || !record.sourceId) return sendPublicError(res, 404);
        bridgeMediaId = await client.ingest(
          { provider: record.provider, sourceId: record.sourceId },
          { signal }
        );
        (deps.store || playbackStore).rememberBridgeMediaId(record.publicPlaybackId, bridgeMediaId);
      }

      const upstream = await client.stream(bridgeMediaId, {
        method,
        range: req.headers.range,
        signal,
      });

      if (upstream.status >= 300 && upstream.status < 400) {
        recordMetric("playbackFailure", { reason: "redirect", durationMs: Date.now() - started });
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

      if (method === "HEAD") {
        recordMetric("playbackSuccess", { method, durationMs: Date.now() - started });
        res.end();
        return;
      }
      if (!upstream.body) {
        recordMetric("playbackSuccess", { method, durationMs: Date.now() - started });
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once("drain", () => resolve()));
        }
      }
      recordMetric("playbackSuccess", { method, durationMs: Date.now() - started });
      res.end();
    } catch {
      recordMetric("playbackFailure", { durationMs: Date.now() - started });
      return sendPublicError(res, 503);
    }
  };

  router.get("/:playbackId", (req, res) => {
    const method = String(req.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET";
    return void handler(req, res, method);
  });
  return router;
}

export default createMediaRouter();
