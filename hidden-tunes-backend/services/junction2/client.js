import { randomUUID } from "node:crypto";
import { loadJunction2Config } from "./config.js";

function combineSignals(timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    stopTimer() {
      clearTimeout(timer);
    },
    dispose() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}

export class MediaBridgeClient {
  constructor(config = loadJunction2Config(), fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.failures = 0;
    this.openedAt = 0;
    this.searchCalls = 0;
    this.ingestCalls = 0;
    this.streamCalls = 0;
  }

  circuitOpen() {
    if (this.failures < this.config.circuitFailureThreshold) return false;
    return Date.now() - this.openedAt < this.config.circuitOpenMs;
  }

  markSuccess() {
    this.failures = 0;
    this.openedAt = 0;
  }

  markFailure() {
    this.failures += 1;
    if (this.failures >= this.config.circuitFailureThreshold) this.openedAt = Date.now();
  }

  async search(text, options = {}) {
    this.searchCalls += 1;
    if (this.circuitOpen()) {
      const error = new Error("circuit_open");
      error.code = "CIRCUIT_OPEN";
      throw error;
    }
    const body = await this.postJson(
      "/internal/v1/search",
      {
        contractVersion: "v1",
        requestId: randomUUID(),
        query: { text: String(text || ""), limit: options.limit ?? this.config.searchLimit },
      },
      options.timeoutMs ?? this.config.searchTimeoutMs,
      options.signal
    );
    if (!body || !Array.isArray(body.results)) {
      const error = new Error("malformed");
      error.code = "MALFORMED";
      throw error;
    }
    return body.results;
  }

  async ingest(source, options = {}) {
    this.ingestCalls += 1;
    const body = await this.postJson(
      "/internal/v1/ingest",
      {
        contractVersion: "v1",
        requestId: randomUUID(),
        source: {
          provider: source.provider,
          id: source.sourceId,
        },
      },
      options.timeoutMs ?? this.config.playbackTimeoutMs,
      options.signal
    );
    const bridgeMediaId = body?.record?.bridgeMediaId;
    if (!bridgeMediaId) {
      const error = new Error("malformed");
      error.code = "MALFORMED";
      throw error;
    }
    return String(bridgeMediaId);
  }

  async stream(bridgeMediaId, options = {}) {
    this.streamCalls += 1;
    if (!this.config.ready) {
      const error = new Error("not_ready");
      error.code = "NOT_READY";
      throw error;
    }
    const combined = combineSignals(this.config.playbackTimeoutMs, options.signal);
    try {
      const headers = {
        authorization: `Bearer ${this.config.secret}`,
        accept: "*/*",
      };
      if (options.range) headers.range = options.range;
      const response = await this.fetchImpl(
        `${this.config.baseUrl}/internal/v1/stream/${encodeURIComponent(bridgeMediaId)}`,
        { method: options.method || "GET", headers, signal: combined.signal, redirect: "manual" }
      );
      combined.stopTimer();
      this.markSuccess();
      return response;
    } catch (err) {
      this.markFailure();
      throw err;
    } finally {
      combined.dispose();
    }
  }

  async postJson(path, payload, timeoutMs, signal) {
    if (!this.config.ready) {
      const error = new Error("not_ready");
      error.code = "NOT_READY";
      throw error;
    }
    const combined = combineSignals(timeoutMs, signal);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: combined.signal,
        redirect: "manual",
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error("bridge_http");
        error.code = response.status === 401 ? "UNAUTHORIZED" : "BRIDGE_HTTP";
        error.status = response.status;
        throw error;
      }
      if (!text || text.trimStart().startsWith("<")) {
        const error = new Error("malformed");
        error.code = "MALFORMED";
        throw error;
      }
      const json = JSON.parse(text);
      this.markSuccess();
      return json;
    } catch (err) {
      this.markFailure();
      throw err;
    } finally {
      combined.dispose();
    }
  }
}

let defaultClient = null;

export function getMediaBridgeClient(config = loadJunction2Config()) {
  if (!defaultClient) defaultClient = new MediaBridgeClient(config);
  return defaultClient;
}

export function resetMediaBridgeClient(client = null) {
  defaultClient = client;
}
