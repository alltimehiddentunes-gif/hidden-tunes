/**
 * Shared catalog GET helper for admin.hiddentunes.com media sections.
 * Adds a hard timeout so hung backend routes cannot leave UI spinners forever,
 * and refuses to treat HTML/gateway bodies as JSON.
 */

export const CATALOG_REQUEST_TIMEOUT_MS = 15_000;

export function isCatalogAbortError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.message === "Aborted" ||
    error.message === "radio_catalog_attach_aborted"
  );
}

export function isCatalogTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.message === "catalog_api_timeout")
  );
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function timeoutError() {
  const error = new Error("catalog_api_timeout");
  error.name = "TimeoutError";
  return error;
}

export type CatalogJsonFetchResult = {
  response: Response;
  json: unknown;
  contentType: string;
};

export type CatalogJsonFetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Dev diagnostics only — feature owner label (e.g. radio-search). */
  requestOwner?: string;
};

type CatalogFetchOutcome =
  | "success"
  | "timeout"
  | "aborted"
  | "http_error"
  | "parse_error";

function catalogUrlPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.split("?")[0] || url;
  }
}

function logCatalogFetchDiag(payload: {
  requestOwner: string;
  urlPath: string;
  timeoutMs: number;
  startedAt: number;
  elapsedMs: number;
  outcome: CatalogFetchOutcome;
}) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log("[CatalogJsonFetch]", payload);
}

/**
 * GET JSON with Accept: application/json, optional parent AbortSignal, and timeout.
 * Parent cancellation surfaces as AbortError; timeout surfaces as TimeoutError.
 *
 * Timer/listener cleanup always runs in finally. Only one terminal outcome settles
 * the returned promise (no delayed rejection after success/abort/timeout).
 */
export async function catalogJsonFetch(
  url: string,
  options?: CatalogJsonFetchOptions
): Promise<CatalogJsonFetchResult> {
  const timeoutMs = Math.max(1_000, Number(options?.timeoutMs || CATALOG_REQUEST_TIMEOUT_MS));
  const parent = options?.signal;
  const requestOwner = String(options?.requestOwner || "catalog").trim() || "catalog";
  const urlPath = catalogUrlPath(url);
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let settled = false;

  if (parent?.aborted) {
    logCatalogFetchDiag({
      requestOwner,
      urlPath,
      timeoutMs,
      startedAt,
      elapsedMs: 0,
      outcome: "aborted",
    });
    throw abortError();
  }

  const onParentAbort = () => {
    if (!settled) controller.abort();
  };
  parent?.addEventListener("abort", onParentAbort);

  const timer = setTimeout(() => {
    if (settled) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const finish = (outcome: CatalogFetchOutcome) => {
    if (settled) return;
    settled = true;
    logCatalogFetchDiag({
      requestOwner,
      urlPath,
      timeoutMs,
      startedAt,
      elapsedMs: Date.now() - startedAt,
      outcome,
    });
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    const trimmed = text.trim();
    const looksHtml = /^<!doctype html|<html[\s>]/i.test(trimmed);
    const claimsJson = contentType.toLowerCase().includes("application/json");

    if (looksHtml || (!claimsJson && !trimmed)) {
      finish(response.ok ? "parse_error" : "http_error");
      throw new Error(
        response.ok ? "catalog_api_non_json_response" : `catalog_api_${response.status}`
      );
    }

    let json: unknown = null;
    if (trimmed) {
      try {
        json = JSON.parse(trimmed);
      } catch {
        finish("parse_error");
        throw new Error("catalog_api_invalid_json");
      }
    }

    if (!response.ok) {
      finish("http_error");
      return { response, json, contentType };
    }

    finish("success");
    return { response, json, contentType };
  } catch (error) {
    if (timedOut) {
      finish("timeout");
      throw timeoutError();
    }
    if (parent?.aborted || isCatalogAbortError(error)) {
      finish("aborted");
      throw abortError();
    }
    if (!settled) {
      finish(
        error instanceof Error && /invalid_json|non_json/.test(error.message)
          ? "parse_error"
          : "http_error"
      );
    }
    throw error;
  } finally {
    settled = true;
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
